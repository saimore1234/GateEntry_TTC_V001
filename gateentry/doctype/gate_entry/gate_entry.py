import frappe
from frappe.model.document import Document
from frappe.utils import flt
from frappe import _

class GateEntry(Document):
    
    def validate(self):
        total_qty = 0
        total_pkgs = 0
        total_wt = 0
        for item in self.items:
            total_qty += flt(item.received_qty)
            total_pkgs += flt(item.no_of_packages or 0)
            total_wt += flt(item.total_weight or 0)
        self.total_qty = total_qty
        self.total_packages = total_pkgs
        self.total_weight = total_wt
    
    @frappe.whitelist()
    def fetch_from_po(self, po_names):
        import json
        po_list = json.loads(po_names)
        if not po_list:
            frappe.throw("Select at least one PO")
        self.items = []
        for po_name in po_list:
            po = frappe.get_doc("Purchase Order", po_name)
            self.supplier_name = po.supplier_name or po.supplier
            for po_item in po.items:
                self.append("items", {
                    "item_code": po_item.item_code,
                    "item_name": po_item.item_name,
                    "ordered_qty": po_item.qty,
                    "received_qty": po_item.qty,
                    "uom": po_item.uom,
                    "description": po_item.description
                })
        self.validate()
        return True
    
    @frappe.whitelist()
    def add_manual_item(self, item_data):
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
        self.validate()
        return True
    
    def on_submit(self):
        self.status = "Completed"
