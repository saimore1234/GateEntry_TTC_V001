import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

class GateEntry(Document):
    
    def validate(self):
        self.calculate_totals()
    
    def calculate_totals(self):
        total_qty = 0
        total_wt = 0
        for item in self.items:
            total_qty += flt(item.received_qty)
            total_wt += flt(item.weight or 0)
        self.total_qty = total_qty
        self.total_weight = total_wt
    
    @frappe.whitelist()
    def add_purchase_orders(self, po_names):
        """Add POs and auto-fetch items"""
        import json
        po_list = json.loads(po_names)
        
        # Clear existing
        self.purchase_orders = []
        self.items = []
        suppliers = set()
        
        for po_name in po_list:
            if not frappe.db.exists("Purchase Order", po_name):
                continue
            
            po_doc = frappe.get_doc("Purchase Order", po_name)
            suppliers.add(po_doc.supplier)
            
            # Add to PO Tracking table
            self.append("purchase_orders", {
                "purchase_order": po_name,
                "supplier": po_doc.supplier,
                "order_date": po_doc.transaction_date,
                "total_qty": sum(item.qty for item in po_doc.items),
                "status": "Pending"
            })
            
            # Auto-fetch items from PO
            for po_item in po_doc.items:
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
                        "purchase_order_ref": po_name,
                        "item_code": po_item.item_code,
                        "item_name": po_item.item_name,
                        "ordered_qty": po_item.qty,
                        "received_qty": po_item.qty,
                        "uom": po_item.uom,
                        "quality": "Pending",
                        "packages": 1,
                        "weight": 0
                    })
        
        # Set supplier if all POs have same supplier
        if len(suppliers) == 1:
            supplier = list(suppliers)[0]
            self.supplier = supplier
            self.supplier_name = frappe.db.get_value("Supplier", supplier, "supplier_name")
        
        self.calculate_totals()
        frappe.msgprint(_("Added {0} PO(s) and loaded {1} items").format(len(po_list), len(self.items)))
        return True
    
    def on_submit(self):
        self.db_set("status", "Completed")
        frappe.msgprint(_("Gate Entry {0} submitted successfully").format(self.name))