-- CY Web initial D1 schema draft
-- Source: docs/architecture/FINAL_DATA_DICTIONARY.md
-- This migration is a source-of-truth draft only. It does not modify production D1 by itself.
--
-- Cloudflare D1 enforces foreign keys by default. Do not rely on toggling
-- PRAGMA foreign_keys inside a migration.

-- Numeric storage convention:
--   scaled4 values are stored as INTEGER x 10,000.
--   money2 values are stored as INTEGER x 100.
-- Application/API mappers expose decimal values; do not use binary floating point
-- for persisted business values.

-- ============================================================
-- Shared Identity / app-local authorization
-- ============================================================

CREATE TABLE app_members (
    id INTEGER PRIMARY KEY,
    identity_employee_id TEXT NOT NULL UNIQUE CHECK (length(trim(identity_employee_id)) > 0),
    employee_no TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE app_tags (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE app_tag_modules (
    tag_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (length(trim(module_code)) > 0),
    PRIMARY KEY (tag_id, module_code),
    FOREIGN KEY (tag_id) REFERENCES app_tags(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE app_member_tags (
    member_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (member_id, tag_id),
    FOREIGN KEY (member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES app_tags(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- Common lookups
-- ============================================================

CREATE TABLE departments (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE customer_categories (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE customer_statuses (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE regions (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    group_code TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE item_categories (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    parent_id INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (parent_id) REFERENCES item_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- Item domain
-- ============================================================

CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    item_no TEXT NOT NULL UNIQUE CHECK (length(trim(item_no)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    spec TEXT,
    base_unit TEXT NOT NULL CHECK (length(trim(base_unit)) > 0),
    item_category_id INTEGER,
    cost INTEGER,
    cost_tax_mode TEXT CHECK (cost_tax_mode IS NULL OR cost_tax_mode IN ('none', 'inclusive', 'exclusive')),
    store_price INTEGER,
    clinic_price INTEGER,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    CHECK (cost IS NULL OR cost >= 0),
    CHECK (store_price IS NULL OR store_price >= 0),
    CHECK (clinic_price IS NULL OR clinic_price >= 0),
    FOREIGN KEY (item_category_id) REFERENCES item_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE item_number_history (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    item_no TEXT NOT NULL CHECK (length(trim(item_no)) > 0),
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    change_source TEXT,
    is_searchable INTEGER NOT NULL DEFAULT 1 CHECK (is_searchable IN (0, 1)),
    created_at TEXT NOT NULL,
    CHECK (valid_to IS NULL OR valid_to >= valid_from),
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_item_number_history_no
    ON item_number_history(item_no);

CREATE INDEX idx_item_number_history_item_from
    ON item_number_history(item_id, valid_from DESC);

CREATE TABLE item_unit_conversions (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL,
    from_unit TEXT NOT NULL CHECK (length(trim(from_unit)) > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    to_unit TEXT NOT NULL CHECK (length(trim(to_unit)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CHECK (from_unit <> to_unit),
    UNIQUE (item_id, from_unit, to_unit),
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- ============================================================
-- Customer domain
-- ============================================================

CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    customer_no TEXT CHECK (customer_no IS NULL OR length(trim(customer_no)) > 0),
    short_name TEXT NOT NULL CHECK (length(trim(short_name)) > 0),
    full_name TEXT,
    tax_id TEXT,
    customer_category_id INTEGER,
    region_id INTEGER,
    owner_department_id INTEGER,
    owner_employee_id INTEGER,
    fax TEXT,
    customer_status_id INTEGER,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (customer_category_id) REFERENCES customer_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (region_id) REFERENCES regions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (owner_department_id) REFERENCES departments(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (owner_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (customer_status_id) REFERENCES customer_statuses(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_customers_customer_no_present
    ON customers(customer_no)
    WHERE customer_no IS NOT NULL;

CREATE INDEX idx_customers_tax_id
    ON customers(tax_id);

CREATE INDEX idx_customers_short_name
    ON customers(short_name);

CREATE INDEX idx_customers_owner_employee
    ON customers(owner_employee_id);

CREATE INDEX idx_customers_status
    ON customers(customer_status_id);

CREATE INDEX idx_customers_region
    ON customers(region_id);

CREATE TABLE customer_phones (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    phone_number TEXT NOT NULL CHECK (length(trim(phone_number)) > 0),
    extension TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_customer_phones_customer
    ON customer_phones(customer_id, sort_order);

CREATE TABLE customer_contacts (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    department_name TEXT,
    title TEXT,
    phone TEXT,
    mobile TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_customer_contacts_customer
    ON customer_contacts(customer_id, sort_order);

CREATE TABLE customer_addresses (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    postal_code TEXT,
    address TEXT NOT NULL CHECK (length(trim(address)) > 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_customer_addresses_customer
    ON customer_addresses(customer_id, sort_order);

CREATE TABLE customer_notes (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_customer_notes_customer
    ON customer_notes(customer_id, sort_order);

CREATE TABLE customer_visits (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    visit_date TEXT NOT NULL,
    contact_id INTEGER,
    person_snapshot TEXT,
    employee_id INTEGER NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (contact_id) REFERENCES customer_contacts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_customer_visits_customer_date
    ON customer_visits(customer_id, visit_date DESC);

CREATE TABLE customer_frequent_items (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    item_id INTEGER,
    custom_item_name TEXT,
    custom_category_name TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
        (item_id IS NOT NULL AND custom_item_name IS NULL AND custom_category_name IS NULL)
        OR
        (item_id IS NULL AND custom_item_name IS NOT NULL AND length(trim(custom_item_name)) > 0)
    ),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_customer_frequent_items_customer
    ON customer_frequent_items(customer_id, sort_order);

-- ============================================================
-- Customer-item quotation history
-- ============================================================

CREATE TABLE customer_item_quotes (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quote_date TEXT NOT NULL,
    employee_id INTEGER NOT NULL,
    item_no_snapshot TEXT NOT NULL CHECK (length(trim(item_no_snapshot)) > 0),
    item_name_snapshot TEXT NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
    spec_snapshot TEXT,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_customer_item_quotes_customer_date
    ON customer_item_quotes(customer_id, quote_date DESC);

CREATE INDEX idx_customer_item_quotes_item_date
    ON customer_item_quotes(item_id, quote_date DESC);

CREATE TABLE quote_price_breaks (
    id INTEGER PRIMARY KEY,
    quote_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (quote_id) REFERENCES customer_item_quotes(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

-- ============================================================
-- Sales Work Order domain
-- ============================================================

CREATE TABLE sales_work_orders (
    id INTEGER PRIMARY KEY,
    work_order_ref TEXT NOT NULL UNIQUE CHECK (length(trim(work_order_ref)) > 0),
    customer_id INTEGER,
    customer_no_snapshot TEXT,
    customer_name_snapshot TEXT NOT NULL CHECK (length(trim(customer_name_snapshot)) > 0),
    order_date TEXT NOT NULL,
    operator_employee_id INTEGER NOT NULL,
    note TEXT,
    status_code TEXT NOT NULL CHECK (status_code IN ('created', 'issued', 'waiting_stock', 'picked', 'shipped', 'voided')),
    erp_no TEXT CHECK (erp_no IS NULL OR length(trim(erp_no)) > 0),
    hide_price_on_sales_document INTEGER NOT NULL DEFAULT 0 CHECK (hide_price_on_sales_document IN (0, 1)),
    invoice_type_code TEXT CHECK (invoice_type_code IS NULL OR invoice_type_code IN ('two_copy', 'three_copy')),
    receipt_option_code TEXT CHECK (receipt_option_code IS NULL OR receipt_option_code IN ('with_receipt', 'without_receipt')),
    voided_at TEXT,
    voided_by INTEGER,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    CHECK (
        customer_id IS NOT NULL
        OR
        (customer_no_snapshot IS NULL AND length(trim(customer_name_snapshot)) > 0)
    ),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (operator_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (voided_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_sales_work_orders_erp_no
    ON sales_work_orders(erp_no);

CREATE INDEX idx_sales_work_orders_status_date
    ON sales_work_orders(status_code, order_date DESC);

CREATE INDEX idx_sales_work_orders_customer
    ON sales_work_orders(customer_id);

CREATE TABLE sales_work_order_items (
    id INTEGER PRIMARY KEY,
    sales_work_order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    item_no_snapshot TEXT NOT NULL CHECK (length(trim(item_no_snapshot)) > 0),
    item_name_snapshot TEXT NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
    spec_snapshot TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_snapshot TEXT NOT NULL CHECK (length(trim(unit_snapshot)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (sales_work_order_id) REFERENCES sales_work_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_sales_work_order_items_order
    ON sales_work_order_items(sales_work_order_id, sort_order);

-- ============================================================
-- Defect domain
-- ============================================================

CREATE TABLE defect_reports (
    id INTEGER PRIMARY KEY,
    reported_date TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    customer_no_snapshot TEXT,
    customer_name_snapshot TEXT NOT NULL CHECK (length(trim(customer_name_snapshot)) > 0),
    item_id INTEGER NOT NULL,
    item_no_snapshot TEXT NOT NULL CHECK (length(trim(item_no_snapshot)) > 0),
    item_name_snapshot TEXT NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
    spec_snapshot TEXT,
    owner_employee_id INTEGER NOT NULL,
    defect_description TEXT NOT NULL CHECK (length(trim(defect_description)) > 0),
    handling TEXT,
    status_code TEXT NOT NULL CHECK (status_code IN ('created', 'processing', 'resolved')),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (owner_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_defect_reports_status_date
    ON defect_reports(status_code, reported_date DESC);

CREATE INDEX idx_defect_reports_customer
    ON defect_reports(customer_id);

CREATE INDEX idx_defect_reports_item
    ON defect_reports(item_id);

-- ============================================================
-- Contractor / BOM
-- ============================================================

CREATE TABLE contractors (
    id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('person', 'organization')),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
    legal_name TEXT,
    tax_id TEXT,
    phone TEXT,
    address TEXT,
    note TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_contractors_name
    ON contractors(display_name);

CREATE TABLE contractor_contacts (
    id INTEGER PRIMARY KEY,
    contractor_id INTEGER NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    title TEXT,
    phone TEXT,
    mobile TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE contractor_pricing (
    id INTEGER PRIMARY KEY,
    contractor_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    pricing_unit TEXT NOT NULL CHECK (length(trim(pricing_unit)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    note TEXT,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    UNIQUE (contractor_id, item_id),
    FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE bom_recipes (
    id INTEGER PRIMARY KEY,
    recipe_ref TEXT NOT NULL UNIQUE CHECK (length(trim(recipe_ref)) > 0),
    finished_item_id INTEGER NOT NULL,
    output_quantity INTEGER NOT NULL CHECK (output_quantity > 0),
    output_unit TEXT NOT NULL CHECK (length(trim(output_unit)) > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (finished_item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_bom_recipes_finished_item
    ON bom_recipes(finished_item_id, is_active);

CREATE TABLE bom_components (
    id INTEGER PRIMARY KEY,
    bom_recipe_id INTEGER NOT NULL,
    component_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (bom_recipe_id, component_item_id, unit),
    FOREIGN KEY (bom_recipe_id) REFERENCES bom_recipes(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (component_item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- Outsourcing domain
-- ============================================================

CREATE TABLE outsourcing_orders (
    id INTEGER PRIMARY KEY,
    outsourcing_ref TEXT NOT NULL UNIQUE CHECK (length(trim(outsourcing_ref)) > 0),
    status_code TEXT NOT NULL CHECK (status_code IN ('pending_outbound', 'outbound', 'received', 'priced', 'paid', 'voided')),
    operator_employee_id INTEGER NOT NULL,
    contractor_id INTEGER NOT NULL,
    contractor_name_snapshot TEXT NOT NULL CHECK (length(trim(contractor_name_snapshot)) > 0),
    order_date TEXT NOT NULL,
    outbound_date TEXT,
    paid_at TEXT,
    paid_by INTEGER,
    voided_at TEXT,
    voided_by INTEGER,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (operator_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (paid_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (voided_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_outsourcing_orders_status_date
    ON outsourcing_orders(status_code, order_date DESC);

CREATE INDEX idx_outsourcing_orders_contractor
    ON outsourcing_orders(contractor_id, order_date DESC);

CREATE TABLE outsourcing_order_parts (
    id INTEGER PRIMARY KEY,
    outsourcing_order_id INTEGER NOT NULL,
    bom_recipe_id INTEGER,
    finished_item_id INTEGER,
    finished_item_no_snapshot TEXT,
    finished_item_name_snapshot TEXT,
    finished_spec_snapshot TEXT,
    component_item_id INTEGER NOT NULL,
    component_item_no_snapshot TEXT NOT NULL CHECK (length(trim(component_item_no_snapshot)) > 0),
    component_item_name_snapshot TEXT NOT NULL CHECK (length(trim(component_item_name_snapshot)) > 0),
    component_spec_snapshot TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_snapshot TEXT NOT NULL CHECK (length(trim(unit_snapshot)) > 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (outsourcing_order_id) REFERENCES outsourcing_orders(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (bom_recipe_id) REFERENCES bom_recipes(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (finished_item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (component_item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_outsourcing_order_parts_order
    ON outsourcing_order_parts(outsourcing_order_id, sort_order);

CREATE TABLE outsourcing_receipts (
    id INTEGER PRIMARY KEY,
    outsourcing_order_id INTEGER NOT NULL UNIQUE,
    received_date TEXT NOT NULL,
    operator_employee_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (outsourcing_order_id) REFERENCES outsourcing_orders(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (operator_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE outsourcing_receipt_items (
    id INTEGER PRIMARY KEY,
    receipt_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    bom_recipe_id INTEGER,
    item_no_snapshot TEXT NOT NULL CHECK (length(trim(item_no_snapshot)) > 0),
    item_name_snapshot TEXT NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
    spec_snapshot TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_snapshot TEXT NOT NULL CHECK (length(trim(unit_snapshot)) > 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (receipt_id) REFERENCES outsourcing_receipts(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (bom_recipe_id) REFERENCES bom_recipes(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE outsourcing_pricings (
    id INTEGER PRIMARY KEY,
    outsourcing_order_id INTEGER NOT NULL UNIQUE,
    priced_date TEXT NOT NULL,
    operator_employee_id INTEGER NOT NULL,
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    created_at TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (outsourcing_order_id) REFERENCES outsourcing_orders(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (operator_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE outsourcing_pricing_items (
    id INTEGER PRIMARY KEY,
    pricing_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    item_no_snapshot TEXT NOT NULL CHECK (length(trim(item_no_snapshot)) > 0),
    item_name_snapshot TEXT NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
    unit_snapshot TEXT NOT NULL CHECK (length(trim(unit_snapshot)) > 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (pricing_id) REFERENCES outsourcing_pricings(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- Contractor stock ledger
-- ============================================================

CREATE TABLE contractor_stock_movements (
    id INTEGER PRIMARY KEY,
    contractor_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    related_finished_item_id INTEGER,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('outbound_supply', 'receipt_consumption', 'manual_adjustment', 'reversal')),
    quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
    occurred_at TEXT NOT NULL,
    operator_employee_id INTEGER NOT NULL,
    outsourcing_order_id INTEGER,
    outsourcing_receipt_id INTEGER,
    reversal_of_movement_id INTEGER,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (contractor_id) REFERENCES contractors(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (related_finished_item_id) REFERENCES items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (operator_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (outsourcing_order_id) REFERENCES outsourcing_orders(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (outsourcing_receipt_id) REFERENCES outsourcing_receipts(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (reversal_of_movement_id) REFERENCES contractor_stock_movements(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_contractor_stock_movements_balance
    ON contractor_stock_movements(contractor_id, item_id, occurred_at);

CREATE INDEX idx_contractor_stock_movements_order
    ON contractor_stock_movements(outsourcing_order_id);

CREATE INDEX idx_contractor_stock_movements_reversal
    ON contractor_stock_movements(reversal_of_movement_id);

-- ============================================================
-- WorkLog / scoring
-- ============================================================

CREATE TABLE work_log_categories (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    input_mode TEXT NOT NULL CHECK (input_mode IN ('boolean', 'quantity')),
    unit_label TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE work_log_platforms (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE work_log_scoring_rows (
    id INTEGER PRIMARY KEY,
    work_log_category_id INTEGER,
    custom_name TEXT,
    score_value INTEGER,
    description TEXT,
    note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    CHECK (
        (work_log_category_id IS NOT NULL AND custom_name IS NULL)
        OR
        (work_log_category_id IS NULL AND custom_name IS NOT NULL AND length(trim(custom_name)) > 0)
    ),
    FOREIGN KEY (work_log_category_id) REFERENCES work_log_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX ux_work_log_scoring_rows_category
    ON work_log_scoring_rows(work_log_category_id)
    WHERE work_log_category_id IS NOT NULL;

CREATE TABLE work_log_scoring_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    target_average_daily_score INTEGER,
    minimum_average_daily_score INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE work_logs (
    id INTEGER PRIMARY KEY,
    work_log_ref TEXT NOT NULL UNIQUE CHECK (length(trim(work_log_ref)) > 0),
    log_date TEXT NOT NULL,
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    work_days INTEGER NOT NULL CHECK (work_days > 0),
    type_code TEXT NOT NULL CHECK (length(trim(type_code)) > 0),
    employee_id INTEGER NOT NULL,
    status_code TEXT NOT NULL CHECK (status_code IN ('created', 'pending_review', 'reviewed')),
    reviewed_by INTEGER,
    reviewed_at TEXT,
    review_remark TEXT,
    final_score INTEGER,
    average_daily_score INTEGER,
    created_at TEXT NOT NULL,
    created_by INTEGER,
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    CHECK (date_to >= date_from),
    CHECK (
        (status_code = 'reviewed'
            AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND final_score IS NOT NULL
            AND average_daily_score IS NOT NULL)
        OR
        (status_code <> 'reviewed'
            AND reviewed_by IS NULL
            AND reviewed_at IS NULL
            AND review_remark IS NULL
            AND final_score IS NULL
            AND average_daily_score IS NULL)
    ),
    FOREIGN KEY (employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (reviewed_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_work_logs_employee_date
    ON work_logs(employee_id, log_date DESC);

CREATE INDEX idx_work_logs_status_date
    ON work_logs(status_code, log_date DESC);

CREATE INDEX idx_work_logs_interval
    ON work_logs(date_from, date_to);

CREATE TABLE work_log_entries (
    id INTEGER PRIMARY KEY,
    work_log_id INTEGER NOT NULL,
    entry_type_code TEXT NOT NULL CHECK (length(trim(entry_type_code)) > 0),
    content TEXT,
    platform_id INTEGER,
    review_remark TEXT,
    review_score INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (work_log_id) REFERENCES work_logs(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (platform_id) REFERENCES work_log_platforms(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_work_log_entries_log
    ON work_log_entries(work_log_id, sort_order);

CREATE TABLE work_log_entry_categories (
    id INTEGER PRIMARY KEY,
    work_log_entry_id INTEGER NOT NULL,
    work_log_category_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    UNIQUE (work_log_entry_id, work_log_category_id),
    FOREIGN KEY (work_log_entry_id) REFERENCES work_log_entries(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (work_log_category_id) REFERENCES work_log_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

-- ============================================================
-- Shared CY Web Audit Core
-- ============================================================

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL CHECK (length(trim(entity_type)) > 0),
    entity_key TEXT NOT NULL CHECK (length(trim(entity_key)) > 0),
    action TEXT NOT NULL CHECK (length(trim(action)) > 0),
    actor_employee_id INTEGER,
    occurred_at TEXT NOT NULL,
    status_from TEXT,
    status_to TEXT,
    request_id TEXT,
    before_json TEXT,
    after_json TEXT,
    metadata_json TEXT,
    FOREIGN KEY (actor_employee_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_audit_events_entity_time
    ON audit_events(entity_type, entity_key, occurred_at DESC);

CREATE INDEX idx_audit_events_time
    ON audit_events(occurred_at DESC);

CREATE INDEX idx_audit_events_actor_time
    ON audit_events(actor_employee_id, occurred_at DESC);

-- Deliberately no action/time index yet; add only when observed query usage
-- justifies its write/storage cost.

-- ============================================================
-- Backup operational catalog
-- ============================================================

CREATE TABLE backup_sets (
    backup_id TEXT PRIMARY KEY CHECK (length(trim(backup_id)) > 0),
    created_at TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    data_sha256 TEXT NOT NULL CHECK (length(trim(data_sha256)) > 0),
    data_byte_length INTEGER NOT NULL CHECK (data_byte_length >= 0),
    total_record_count INTEGER NOT NULL CHECK (total_record_count >= 0),
    status_code TEXT NOT NULL CHECK (length(trim(status_code)) > 0)
);

CREATE INDEX idx_backup_sets_created_at
    ON backup_sets(created_at DESC);

CREATE TABLE backup_copies (
    id INTEGER PRIMARY KEY,
    backup_id TEXT NOT NULL,
    provider_code TEXT NOT NULL CHECK (length(trim(provider_code)) > 0),
    status_code TEXT NOT NULL CHECK (length(trim(status_code)) > 0),
    object_prefix TEXT NOT NULL CHECK (length(trim(object_prefix)) > 0),
    verified_at TEXT,
    last_error_code TEXT,
    updated_at TEXT NOT NULL,
    UNIQUE (backup_id, provider_code),
    FOREIGN KEY (backup_id) REFERENCES backup_sets(backup_id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX idx_backup_copies_provider_status
    ON backup_copies(provider_code, status_code);

-- End of initial schema draft.
-- Cross-row workflow transitions, WorkLog review-score clearing,
-- Item unit-conversion cycle detection, Customer reconciliation,
-- generated reference formatting, and exact financial rounding remain
-- service-layer responsibilities.
