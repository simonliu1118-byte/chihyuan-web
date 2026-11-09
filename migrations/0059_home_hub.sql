-- CYWEB V0.12.7: home hub, personal todos, unified announcement/individual notice backend.
-- Rights are two independent CYWEB Module Access grants; all authenticated users may read.
ALTER TABLE app_member_module_access RENAME TO app_member_module_access_before_home;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN (
 'CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS',
 'STORE_STOCKTAKE','STORE_MONTHLY_TODOS','STORE_REPAIRS','BOT_CENTER',
 'ANNOUNCEMENT_PUBLISH','PERSONAL_NOTICE_SEND')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 updated_at TEXT NOT NULL,
 updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_before_home;
DROP TABLE app_member_module_access_before_home;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);

CREATE TABLE personal_todos (
 id INTEGER PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES app_members(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 detail TEXT NOT NULL DEFAULT '' CHECK(length(detail)<=3000),
 due_date TEXT CHECK(due_date IS NULL OR length(due_date)=10),
 due_time TEXT CHECK(due_time IS NULL OR length(due_time)=5),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','important')),
 completed_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(due_time IS NULL OR due_date IS NOT NULL)
);
CREATE INDEX idx_personal_todos_active ON personal_todos(member_id,completed_at,due_date,id DESC);

CREATE TABLE hub_notices (
 id TEXT PRIMARY KEY CHECK(length(id)=36),
 kind TEXT NOT NULL CHECK(kind IN ('company','personal')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 5000),
 created_by INTEGER REFERENCES app_members(id) ON DELETE SET NULL,
 author_name TEXT NOT NULL CHECK(length(author_name) BETWEEN 1 AND 120),
 created_at TEXT NOT NULL,
 revoked_at TEXT,
 revoked_by INTEGER REFERENCES app_members(id) ON DELETE SET NULL
);
CREATE INDEX idx_hub_notices_kind_recent ON hub_notices(kind,created_at DESC,id DESC);
CREATE INDEX idx_hub_notices_author ON hub_notices(created_by,kind,created_at DESC);

CREATE TABLE hub_notice_recipients (
 notice_id TEXT NOT NULL REFERENCES hub_notices(id) ON DELETE CASCADE,
 member_id INTEGER NOT NULL REFERENCES app_members(id) ON DELETE CASCADE,
 PRIMARY KEY(notice_id,member_id)
);
CREATE INDEX idx_hub_notice_recipients_member ON hub_notice_recipients(member_id,notice_id);

CREATE TABLE hub_notice_reads (
 notice_id TEXT NOT NULL REFERENCES hub_notices(id) ON DELETE CASCADE,
 member_id INTEGER NOT NULL REFERENCES app_members(id) ON DELETE CASCADE,
 read_at TEXT NOT NULL,
 PRIMARY KEY(notice_id,member_id)
);
CREATE INDEX idx_hub_notice_reads_member ON hub_notice_reads(member_id,notice_id);
