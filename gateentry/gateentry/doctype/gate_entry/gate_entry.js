frappe.ui.form.on('Gate Entry', {
    refresh: function(frm) {
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Select POs'), function() {
                frm.trigger('select_purchase_orders');
            }).addClass('btn-primary');
        }
    },
    
    select_purchase_orders: function(frm) {
        // Get open POs
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Purchase Order",
                filters: {
                    docstatus: 1,
                    status: ["in", ["To Receive and Bill", "To Receive"]]
                },
                fields: ["name", "supplier", "transaction_date"],
                limit_page_length: 100
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    let dialog = new frappe.ui.Dialog({
                        title: 'Select Purchase Orders',
                        fields: [
                            {
                                fieldname: 'po_html',
                                fieldtype: 'HTML',
                                options: '<div id="po_list"></div>'
                            }
                        ],
                        primary_action_label: 'Load Items',
                        primary_action: function(values) {
                            let selected = [];
                            $('.po-checkbox:checked').each(function() {
                                selected.push($(this).val());
                            });
                            
                            if (selected.length === 0) {
                                frappe.msgprint(__('Please select at least one PO'));
                                return;
                            }
                            
                            frappe.show_alert({
                                message: __('Loading items from selected POs...'),
                                indicator: 'orange'
                            });
                            
                            frm.call('add_purchase_orders', {
                                po_names: JSON.stringify(selected)
                            }).then(() => {
                                frm.refresh_field('purchase_orders');
                                frm.refresh_field('items');
                                frm.refresh_field('total_qty');
                                frm.refresh_field('total_weight');
                                dialog.hide();
                                frappe.show_alert({
                                    message: __('Items loaded successfully!'),
                                    indicator: 'green'
                                });
                            });
                        }
                    });
                    
                    let html = '<div style="max-height: 400px; overflow-y: auto;">';
                    html += '<table class="table table-bordered">';
                    html += '<thead><tr>';
                    html += '<th><input type="checkbox" id="select_all"></th>';
                    html += '<th>PO Number</th>';
                    html += '<th>Supplier</th>';
                    html += '<th>Date</th>';
                    html += '</tr></thead><tbody>';
                    
                    $.each(r.message, function(i, po) {
                        html += '<tr>';
                        html += '<td><input type="checkbox" class="po-checkbox" value="' + po.name + '"></td>';
                        html += '<td>' + po.name + '</td>';
                        html += '<td>' + (po.supplier || '') + '</td>';
                        html += '<td>' + po.transaction_date + '</td>';
                        html += '</tr>';
                    });
                    
                    html += '</tbody></table></div>';
                    html += '<script>';
                    html += '$("#select_all").on("change", function() {';
                    html += '    $(".po-checkbox").prop("checked", $(this).prop("checked"));';
                    html += '});';
                    html += '</script>';
                    
                    dialog.fields_dict.po_html.$wrapper.html(html);
                    dialog.show();
                } else {
                    frappe.msgprint(__('No open Purchase Orders found'));
                }
            }
        });
    },
    
    validate: function(frm) {
        // Check if items exist
        if (frm.doc.items && frm.doc.items.length === 0) {
            frappe.throw(__('Please select Purchase Orders first'));
        }
    }
});

// Handle received quantity changes
frappe.ui.form.on('Gate Entry Item', {
    received_qty: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (row.received_qty > row.ordered_qty) {
            frappe.msgprint(__('Received Qty cannot exceed Ordered Qty'));
            frappe.model.set_value(cdt, cdn, 'received_qty', row.ordered_qty);
        }
        update_summary(frm);
    },
    
    weight: function(frm) {
        update_summary(frm);
    },
    
    items_remove: function(frm) {
        update_summary(frm);
    }
});

function update_summary(frm) {
    let total_qty = 0;
    let total_wt = 0;
    
    $.each(frm.doc.items || [], function(i, item) {
        total_qty += flt(item.received_qty);
        total_wt += flt(item.weight);
    });
    
    frm.set_value('total_qty', total_qty);
    frm.set_value('total_weight', total_wt);
}