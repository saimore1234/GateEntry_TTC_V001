frappe.ui.form.on('Gate Entry', {
    refresh: function(frm) {
        // Remove existing buttons
        frm.remove_custom_button('Select POs & Fetch Items');
        frm.remove_custom_button('Add Item');
        
        if (frm.doc.docstatus === 0) {
            if (frm.doc.entry_type === 'PO Based') {
                // Add PO Mode button
                frm.add_custom_button(__('Select POs & Fetch Items'), function() {
                    show_po_selection_dialog(frm);
                }).addClass('btn-primary');
                
                // Show help message
                frm.dashboard.set_headline_alert(`
                    <div style="padding: 10px; background-color: #e3f2fd; border-left: 4px solid #2196f3;">
                        <strong>🔵 PO Based Mode</strong><br>
                        1. Click "Select POs & Fetch Items"<br>
                        2. Select one or more Purchase Orders<br>
                        3. Click "Fetch Items" to load items
                    </div>
                `);
            } else if (frm.doc.entry_type === 'Manual Entry') {
                // Add Manual Mode button
                frm.add_custom_button(__('Add Item'), function() {
                    show_add_item_dialog(frm);
                }).addClass('btn-primary');
                
                // Show help message
                frm.dashboard.set_headline_alert(`
                    <div style="padding: 10px; background-color: #e8f5e9; border-left: 4px solid #4caf50;">
                        <strong>🟢 Manual Entry Mode</strong><br>
                        Click "Add Item" to add items one by one
                    </div>
                `);
            }
        }
    },
    
    entry_type: function(frm) {
        // Reset form when switching modes
        frm.set_value('selected_pos_display', '');
        frm.set_value('items', []);
        frm.set_value('supplier_name', '');
        frm.set_value('total_qty', 0);
        frm.set_value('total_packages', 0);
        frm.set_value('total_weight', 0);
        frm.refresh_field('items');
        frm.refresh();
        
        if (frm.doc.entry_type === 'PO Based') {
            frappe.msgprint(__('PO Mode: Click "Select POs & Fetch Items" to load items from Purchase Orders'));
        } else if (frm.doc.entry_type === 'Manual Entry') {
            frappe.msgprint(__('Manual Mode: Click "Add Item" to add items manually'));
        }
    },
    
    gate_in_time: function(frm) {
        if (!frm.doc.gate_in_time) {
            frm.set_value('gate_in_time', frappe.datetime.now_datetime());
        }
    }
});

// Function to show PO selection dialog
function show_po_selection_dialog(frm) {
    // Get all open Purchase Orders
    frappe.call({
        method: "frappe.client.get_list",
        args: {
            doctype: "Purchase Order",
            filters: {
                docstatus: 1,
                status: ["in", ["To Receive and Bill", "To Receive"]]
            },
            fields: ["name", "supplier", "supplier_name", "transaction_date"],
            limit_page_length: 100
        },
        callback: function(r) {
            if (r.message && r.message.length > 0) {
                // Create dialog
                let dialog = new frappe.ui.Dialog({
                    title: 'Select Purchase Orders',
                    fields: [
                        {
                            fieldname: 'po_list',
                            fieldtype: 'HTML',
                            options: '<div id="po-list-container"></div>'
                        }
                    ],
                    primary_action_label: 'Fetch Items',
                    primary_action: function() {
                        let selected = [];
                        $('.po-checkbox:checked').each(function() {
                            selected.push($(this).val());
                        });
                        
                        if (selected.length === 0) {
                            frappe.msgprint(__('Please select at least one Purchase Order'));
                            return;
                        }
                        
                        dialog.hide();
                        frappe.show_alert({message: __('Fetching items from selected POs...'), indicator: 'orange'});
                        
                        frm.call('fetch_items_from_po', {
                            po_names: JSON.stringify(selected)
                        }).then(() => {
                            frm.refresh_field('items');
                            frm.refresh_field('selected_pos_display');
                            frm.refresh_field('supplier_name');
                            update_summary(frm);
                            frappe.show_alert({
                                message: __('✓ Items fetched successfully!'),
                                indicator: 'green'
                            });
                        });
                    }
                });
                
                // Build HTML table
                let html = '<div style="max-height: 400px; overflow-y: auto;">';
                html += '<table class="table table-bordered table-hover">';
                html += '<thead class="thead-light">';
                html += '<tr>';
                html += '<th width="5%"><input type="checkbox" id="select_all_po"></th>';
                html += '<th width="35%">PO Number</th>';
                html += '<th width="40%">Supplier</th>';
                html += '<th width="20%">Date</th>';
                html += '</tr>';
                html += '</thead><tbody>';
                
                $.each(r.message, function(i, po) {
                    html += '<tr>';
                    html += '<td><input type="checkbox" class="po-checkbox" value="' + po.name + '"></td>';
                    html += '<td><strong>' + po.name + '</strong></td>';
                    html += '<td>' + (po.supplier_name || po.supplier || '') + '</td>';
                    html += '<td>' + po.transaction_date + '</td>';
                    html += '</tr>';
                });
                
                html += '</tbody></table>';
                html += '<p class="text-muted mt-2">💡 Tip: Select multiple POs to combine items</p>';
                html += '</div>';
                
                dialog.fields_dict.po_list.$wrapper.html(html);
                
                // Select All functionality
                setTimeout(function() {
                    $('#select_all_po').on('change', function() {
                        $('.po-checkbox').prop('checked', $(this).prop('checked'));
                    });
                }, 100);
                
                dialog.show();
            } else {
                frappe.msgprint({
                    title: __('No POs Found'),
                    message: __('No open Purchase Orders found. Please create a Purchase Order first.'),
                    indicator: 'red'
                });
            }
        }
    });
}

// Function to show Add Item dialog for manual mode
function show_add_item_dialog(frm) {
    let dialog = new frappe.ui.Dialog({
        title: 'Add Item',
        fields: [
            {
                fieldname: 'item_code',
                fieldtype: 'Link',
                label: 'Item Code',
                options: 'Item',
                reqd: 1
            },
            {
                fieldname: 'item_name',
                fieldtype: 'Data',
                label: 'Item Name',
                read_only: 1
            },
            {
                fieldname: 'col1',
                fieldtype: 'Column Break'
            },
            {
                fieldname: 'qty',
                fieldtype: 'Float',
                label: 'Quantity',
                reqd: 1,
                default: 1
            },
            {
                fieldname: 'uom',
                fieldtype: 'Link',
                label: 'UOM',
                options: 'UOM',
                reqd: 1
            },
            {
                fieldname: 'packages',
                fieldtype: 'Int',
                label: 'No of Packages',
                default: 1
            },
            {
                fieldname: 'weight',
                fieldtype: 'Float',
                label: 'Total Weight (kg)'
            },
            {
                fieldname: 'description',
                fieldtype: 'Small Text',
                label: 'Description'
            }
        ],
        primary_action_label: 'Add Item',
        primary_action: function(values) {
            if (!values.item_code || !values.uom) {
                frappe.msgprint(__('Please select Item Code and UOM'));
                return;
            }
            
            frm.call('add_manual_item', {
                item_data: JSON.stringify(values)
            }).then(() => {
                frm.refresh_field('items');
                dialog.hide();
                update_summary(frm);
                frappe.show_alert({
                    message: __('✓ Item added successfully'),
                    indicator: 'green'
                });
            });
        }
    });
    
    // Auto-fetch item details when item code is selected
    dialog.fields_dict.item_code.df.onchange = function() {
        let item_code = dialog.get_value('item_code');
        if (item_code) {
            frappe.call({
                method: "frappe.client.get",
                args: {doctype: "Item", name: item_code},
                callback: function(r) {
                    if (r.message) {
                        dialog.set_value('item_name', r.message.item_name);
                        dialog.set_value('uom', r.message.stock_uom);
                        dialog.set_value('description', r.message.description);
                    }
                }
            });
        }
    };
    
    dialog.show();
}

// Handle items table changes
frappe.ui.form.on('Gate Entry Item', {
    received_qty: function(frm) {
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

// Update summary totals
function update_summary(frm) {
    let total_qty = 0;
    let total_pkgs = 0;
    let total_wt = 0;
    
    $.each(frm.doc.items || [], function(i, item) {
        total_qty += flt(item.received_qty);
        total_pkgs += flt(item.no_of_packages);
        total_wt += flt(item.total_weight);
    });
    
    frm.set_value('total_qty', total_qty);
    frm.set_value('total_packages', total_pkgs);
    frm.set_value('total_weight', total_wt);
}