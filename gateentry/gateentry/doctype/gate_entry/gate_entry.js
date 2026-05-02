frappe.ui.form.on('Gate Entry', {
    refresh: function(frm) {
        // Add custom buttons
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Select POs'), function() {
                frm.trigger('select_pos');
            }).addClass('btn-primary');
        }
    },
    
    select_pos: function(frm) {
        // Get open POs
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Purchase Order",
                filters: {
                    docstatus: 1,
                    status: ["in", ["To Receive and Bill", "To Receive"]]
                },
                fields: ["name", "supplier", "supplier_name", "transaction_date", "total_qty"],
                limit_page_length: 100
            },
            callback: function(r) {
                if (r.message && r.message.length > 0) {
                    let pos = r.message;
                    let dialog = new frappe.ui.Dialog({
                        title: 'Select Purchase Orders',
                        fields: [
                            {
                                fieldname: 'po_list',
                                fieldtype: 'HTML',
                                options: '<div id="po_checkbox_list"></div>'
                            }
                        ],
                        primary_action_label: 'Add Selected POs',
                        primary_action: function(values) {
                            let selected = [];
                            $('.po-checkbox:checked').each(function() {
                                selected.push($(this).val());
                            });
                            
                            if (selected.length === 0) {
                                frappe.msgprint(__('Please select at least one PO'));
                                return;
                            }
                            
                            frm.set_value('selected_pos', selected.join(', '));
                            dialog.hide();
                            
                            // Auto fetch items
                            frm.call('fetch_items').then(() => {
                                frm.refresh_field('items');
                                frappe.show_alert({
                                    message: __('Items loaded successfully'),
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
                    html += '<th>Total Qty</th>';
                    html += '</tr></thead><tbody>';
                    
                    $.each(pos, function(i, po) {
                        html += '<tr>';
                        html += '<td><input type="checkbox" class="po-checkbox" value="' + po.name + '"></td>';
                        html += '<td>' + po.name + '</td>';
                        html += '<td>' + (po.supplier_name || po.supplier) + '</td>';
                        html += '<td>' + po.transaction_date + '</td>';
                        html += '<td>' + (po.total_qty || 0) + '</td>';
                        html += '</tr>';
                    });
                    
                    html += '</tbody></table></div>';
                    dialog.fields_dict.po_list.$wrapper.html(html);
                    
                    // Select all functionality
                    $('#select_all').on('change', function() {
                        $('.po-checkbox').prop('checked', $(this).prop('checked'));
                    });
                    
                    dialog.show();
                } else {
                    frappe.msgprint(__('No open Purchase Orders found'));
                }
            }
        });
    },
    
    gate_in_time: function(frm) {
        if (!frm.doc.gate_in_time) {
            frm.set_value('gate_in_time', frappe.datetime.now_datetime());
        }
    }
});

// Handle items table events
frappe.ui.form.on('Gate Entry Item', {
    received_qty: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (row.received_qty > row.ordered_qty) {
            frappe.msgprint(__('Received Qty cannot exceed Ordered Qty'));
            frappe.model.set_value(cdt, cdn, 'received_qty', row.ordered_qty);
        }
        update_summary(frm);
    },
    
    no_of_packages: function(frm) {
        update_summary(frm);
    },
    
    total_weight: function(frm) {
        update_summary(frm);
    },
    
    items_remove: function(frm) {
        update_summary(frm);
    }
});

function update_summary(frm) {
    let total_qty = 0;
    let total_pkgs = 0;
    let total_wt = 0;
    
    $.each(frm.doc.items || [], function(i, item) {
        total_qty += flt(item.received_qty);
        total_pkgs += flt(item.no_of_packages);
        total_wt += flt(item.total_weight);
    });
    
    frm.set_value('total_quantity', total_qty);
    frm.set_value('total_packages', total_pkgs);
    frm.set_value('total_weight', total_wt);
}