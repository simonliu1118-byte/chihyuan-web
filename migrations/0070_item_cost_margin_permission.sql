-- 商品成本及毛利分析次級權限；保留既有授權，不自動新增任何人的權限。
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_before_item_cost;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN (
 'CUSTOMERS','ITEMS','ITEMS_COST_MARGIN','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','ORDERING_CN_PURCHASE','STORE_CUSTOMER_ORDERS',
 'STORE_STOCKTAKE','STORE_MONTHLY_TODOS','STORE_REPAIRS','BOT_CENTER',
 'ANNOUNCEMENT_PUBLISH','PERSONAL_NOTICE_SEND')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_before_item_cost;
DROP TABLE app_member_module_access_before_item_cost;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);
