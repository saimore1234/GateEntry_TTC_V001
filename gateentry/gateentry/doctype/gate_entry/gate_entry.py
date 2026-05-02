import frappe
from frappe.model.document import Document
from frappe.utils import flt, now_datetime
from frappe import _

class GateEntry(Document):
    
    def validate(self):
        self.calculate_totals()
        self.validate_quantities()
    
    def calculate_totals(self):
        total_qty = 0
        total_pkgs = 0
        total_wt = 0
        
        for item in self.items:
            total_qty += flt(item.received_qty)
            total_pkgs += flt(item.no_of_packages or 0)
            total_wt += flt(item.total_weight or 0)
        
        self.total_quantity = total_qty
        self.total_packages = total_pkgs
        self.total_weight = total_wt
    
    def validate_quantities(self):
        for item in self.items:
            if item.received_qty > item.ordered_qty:
                frappe.throw(_("Row #{0}: Received Qty cannot exceed Ordered Qty for {1}").format(
                    item.idx, item.item_code))
    
    @frappe.whitelist()
    def fetch_items(self):
        """Fetch items from selected POs"""
        if not self.selected_pos:
            frappe.throw(_("Please select Purchase Orders first using the 'Select Purchase Orders' button"))
        
        po_names = [po.strip() for po in self.selected_pos.split(',') if po.strip()]
        
        if not po_names:
            frappe.throw(_("No valid POs found"))
        
        # Clear existing items
        self.items = []
        suppliers = set()
        
        # Fetch items from each PO
        for po_name in po_names:
            if not frappe.db.exists("Purchase Order", po_name):
                frappe.msgprint(_("Warning: PO {0} not found, skipping").format(po_name))
                continue
            
            po = frappe.get_doc("Purchase Order", po_name)
            suppliers.add(po.supplier)
            
            po_items = frappe.get_all("Purchase Order Item",
                filters={"parent": po_name},
                fields=["item_code", "item_name", "description", "qty", "uom"]
            )
            
            for po_item in po_items:
                # Check if item already exists from another PO
                existing = None
                for item in self.items:
                    if item.item_code == po_item.item_code:
                        existing = item
                        break
                
                if existing:
                    existing.ordered_qty += po_item.qty
                    existing.received_qty += po_item.qty
                else:
                    self.append("items", {
                        "purchase_order": po_name,
                        "item_code": po_item.item_code,
                        "item_name": po_item.item_name,
                        "description": po_item.description,
                        "ordered_qty": po_item.qty,
                        "received_qty": po_item.qty,
                        "uom": po_item.uom,
                        "quality_status": "Pending",
                        "no_of_packages": 1
                    })
        
        # Set supplier info if single supplier
        if len(suppliers) == 1:
            supplier = list(suppliers)[0]
            self.supplier = supplier
            self.supplier_name = frappe.db.get_value("Supplier", supplier, "supplier_name")
        
        self.calculate_totals()
        frappe.msgprint(_("Loaded {0} items from {1} PO(s)").format(len(self.items), len(po_names)))
        return self.items
    
    def on_submit(self):
        self.update_purchase_orders()
        self.db_set("status", "Completed")
    
    def update_purchase_orders(self):
        """Update each Purchase Order"""
        po_updates = {}
        
        for item in self.items:
            if item.purchase_order:
                if item.purchase_order not in po_updates:
                    po_updates[item.purchase_order] = []
                po_updates[item.purchase_order].append(item)
        
        for po_name, items in po_updates.items():
            po = frappe.get_doc("Purchase Order", po_name)
            
            for po_item in po.items:
                for gate_item in items:
                    if po_item.item_code == gate_item.item_code:
                        current_received = flt(po_item.get("received_qty_at_gate", 0))
                        new_received = current_received + flt(gate_item.received_qty)
                        po_item.db_set("received_qty_at_gate", new_received, update_modified=False)
                        po_item.db_set("gate_entry_reference", self.name, update_modified=False)
                        
                        if new_received >= flt(po_item.qty):
                            po_item.db_set("gate_entry_status", "Completed", update_modified=False)
                        elif new_received > 0:
                            po_item.db_set("gate_entry_status", "Partial", update_modified=False)
            
            frappe.db.commit()
        
        frappe.msgprint(_("Updated {0} Purchase Order(s)").format(len(po_updates)))