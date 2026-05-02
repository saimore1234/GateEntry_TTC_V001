frappe.ui.form.on('Gate Entry', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 0 && frm.doc.entry_type === 'PO Based') {
            frm.add_custom_button(__('Select POs'), function() {
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Purchase Order",
                        filters: {docstatus: 1, status: ["in", ["To Receive and Bill", "To Receive"]]},
                        fields: ["name", "supplier_name"]
                    },
                    callback: function(r) {
                        let dialog = new frappe.ui.Dialog({title: 'Select POs', fields: [{fieldname: 'po_html', fieldtype: 'HTML'}]});
                        let html = '<div>';
                        r.message.forEach(po => {
                            html += '<div><label><input type="checkbox" class="po-chk" value="' + po.name + '"> ' + po.name + ' - ' + (po.supplier_name || '') + '</label></div>';
                        });
                        html += '</div><button class="btn btn-primary btn-sm mt-2" id="fetch_btn">Fetch Items</button>';
                        dialog.fields_dict.po_html.$wrapper.html(html);
                        dialog.show();
                        $('#fetch_btn').click(() => {
                            let selected = [];
                            $('.po-chk:checked').each(function() { selected.push($(this).val()); });
                            if(selected.length) {
                                dialog.hide();
                                frm.call('fetch_from_po', {po_names: JSON.stringify(selected)}).then(() => {
                                    frm.refresh_field('items');
                                    frm.refresh_field('supplier_name');
                                    frappe.msgprint('Items fetched!');
                                });
                            }
                        });
                    }
                });
            });
        } else if (frm.doc.docstatus === 0 && frm.doc.entry_type === 'Manual Entry') {
            frm.add_custom_button(__('Add Item'), function() {
                let d = new frappe.ui.Dialog({title: 'Add Item', fields: [
                    {fieldname: 'item_code', fieldtype: 'Link', label: 'Item Code', options: 'Item', reqd: 1},
                    {fieldname: 'qty', fieldtype: 'Float', label: 'Quantity', default: 1, reqd: 1},
                    {fieldname: 'uom', fieldtype: 'Link', label: 'UOM', options: 'UOM', reqd: 1}
                ], primary_action_label: 'Add', primary_action: function(v) {
                    frm.call('add_manual_item', {item_data: JSON.stringify(v)}).then(() => {
                        frm.refresh_field('items');
                        d.hide();
                    });
                }});
                d.fields_dict.item_code.df.onchange = function() {
                    frappe.db.get_value('Item', d.get_value('item_code'), 'item_name', (r) => {
                        if(r) d.set_value('item_name', r.item_name);
                    });
                };
                d.show();
            });
        }
    }
});