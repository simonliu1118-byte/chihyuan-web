-- CY Web 0.4.0 direct Employee × Module Access authority.
--
-- app_tags / app_tag_modules / app_member_tags are retained as historical/
-- application metadata, but runtime module authorization moves to the direct
-- grant table below. This keeps Identity role and CY Web Module Access as
-- independent dimensions and avoids implicit authorization through tag shape.

CREATE TABLE app_member_module_access (
    member_id INTEGER NOT NULL,
    module_code TEXT NOT NULL CHECK (
        module_code IN (
            'CUSTOMERS',
            'ITEMS',
            'DEFECTS',
            'ORDERS',
            'OUTSOURCING',
            'WORKLOGS'
        )
    ),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    updated_at TEXT NOT NULL,
    updated_by INTEGER,
    PRIMARY KEY (member_id, module_code),
    FOREIGN KEY (member_id) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX idx_app_member_module_access_enabled
    ON app_member_module_access(member_id, enabled, module_code);

-- Preserve any pre-existing development grants that were represented by app
-- tags before direct Module Access became the forward authority.
INSERT OR IGNORE INTO app_member_module_access(
    member_id, module_code, enabled, updated_at, updated_by
)
SELECT mt.member_id,
       CASE lower(trim(tm.module_code))
           WHEN 'customer' THEN 'CUSTOMERS'
           WHEN 'customers' THEN 'CUSTOMERS'
           WHEN 'item' THEN 'ITEMS'
           WHEN 'items' THEN 'ITEMS'
           WHEN 'defect' THEN 'DEFECTS'
           WHEN 'defects' THEN 'DEFECTS'
           WHEN 'order' THEN 'ORDERS'
           WHEN 'orders' THEN 'ORDERS'
           WHEN 'sales_order' THEN 'ORDERS'
           WHEN 'sales_orders' THEN 'ORDERS'
           WHEN 'outsourcing' THEN 'OUTSOURCING'
           WHEN 'worklog' THEN 'WORKLOGS'
           WHEN 'worklogs' THEN 'WORKLOGS'
           WHEN 'work_log' THEN 'WORKLOGS'
           WHEN 'work_logs' THEN 'WORKLOGS'
       END AS module_code,
       1,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       NULL
  FROM app_member_tags mt
  JOIN app_tags t ON t.id = mt.tag_id AND t.is_active = 1
  JOIN app_tag_modules tm ON tm.tag_id = t.id
 WHERE CASE lower(trim(tm.module_code))
           WHEN 'customer' THEN 'CUSTOMERS'
           WHEN 'customers' THEN 'CUSTOMERS'
           WHEN 'item' THEN 'ITEMS'
           WHEN 'items' THEN 'ITEMS'
           WHEN 'defect' THEN 'DEFECTS'
           WHEN 'defects' THEN 'DEFECTS'
           WHEN 'order' THEN 'ORDERS'
           WHEN 'orders' THEN 'ORDERS'
           WHEN 'sales_order' THEN 'ORDERS'
           WHEN 'sales_orders' THEN 'ORDERS'
           WHEN 'outsourcing' THEN 'OUTSOURCING'
           WHEN 'worklog' THEN 'WORKLOGS'
           WHEN 'worklogs' THEN 'WORKLOGS'
           WHEN 'work_log' THEN 'WORKLOGS'
           WHEN 'work_logs' THEN 'WORKLOGS'
       END IS NOT NULL;
