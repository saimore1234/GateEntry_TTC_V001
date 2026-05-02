import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

class GateEntry(Document):
    
    def validate(self):
        self.calculate_totals()
    
    def calculate_totals(self):
        total_qty = 0
        total_pkgs = 0
        total_wt = 0
        
        for item in self.items:
            total_qty += flt(item.get("received_qty", 0))
            total_pkgs += flt(item.get("no_of_packages", 0) or 0)
            total_wt += flt(item.get("total_weight", 0) or 0)
        
        self.total_qty = total_qty
        self.total_packages = total_pkgs
        self.total_weight = total_wt
    
    @frappe.whitelist()
    def fetch_items_from_po(self, po_names):
        """Fetch items from selected Purchase Orders"""
        import json
        po_list = json.loads(po_names)
        
        if not po_list:
            frappe.throw(_("Please select at least one Purchase Order"))
        
        # Clear existing items
        self.set("items", [])
        suppliers = set()
        selected_text = ""
        
        for po_name in po_list:
            if not frappe.db.exists("Purchase Order", po_name):
                continue
            
            po_doc = frappe.get_doc("Purchase Order", po_name)
            suppliers.add(po_doc.supplier)
            
            if selected_text:
                selected_text += ", "
            selected_text += po_name
            
            # Fetch items from PO
            for po_item in po_doc.items:
                # Check if item already exists (from multiple POs)
                existing = None
                for item in self.items:
                    if item.get("item_code") == po_item.item_code:
                        existing = item
                        break
                
                if existing:
                    existing.ordered_qty = flt(existing.get("ordered_qty", 0)) + flt(po_item.qty)
                    existing.received_qty = flt(existing.get("received_qty", 0)) + flt(po_item.qty)
                else:
                    self.append("items", {
                        "item_code": po_item.item_code,
                        "item_name": po_item.item_name,
                        "ordered_qty": po_item.qty,
                        "received_qty": po_item.qty,
                        "uom": po_item.uom,
                        "description": po_item.description,
                        "no_of_packages": 1,
                        "total_weight": 0
                    })
        
        # Set selected POs display
        self.selected_pos_display = selected_text
        
        # Set supplier name if single supplier
        if len(suppliers) == 1:
            supplier = list(suppliers)[0]
            self.supplier_name = frappe.db.get_value("Supplier", supplier, "supplier_name") or supplier
        
        self.calculate_totals()
        frappe.msgprint(_("✓ Fetched {0} items from {1} PO(s)").format(len(self.items), len(po_list)))
        return True
    
    @frappe.whitelist()
    def add_manual_item(self, item_data):
        """Add a single item manually (for Manual Entry mode)"""
        import json
        item = json.loads(item_data)
        
        self.append("items", {
            "item_code": item.get("item_code"),
            "item_name": item.get("item_name"),
            "received_qty": item.get("qty", 1),
            "uom": item.get("uom"),
            "description": item.get("description"),
            "no_of_packages": item.get("packages", 1),
            "total_weight": item.get("weight", 0)
        })
        
        self.calculate_totals()
        frappe.msgprint(_("✓ Item added successfully"))
        return True
    
    def on_submit(self):
        self.db_set("status", "Completed")
        frappe.msgprint(_("✓ Gate Entry {0} submitted successfully").format(self.name))
    
    def on_cancel(self):
        self.db_set("status", "Rejected")
        frappe.msgprint(_("✓ Gate Entry {0} cancelled").format(self.name))