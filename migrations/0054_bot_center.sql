-- BOT 管理中心. Review rows are a write-back for the originating bot.
-- Approving a draft does not publish, enqueue, or enable replies.

ALTER TABLE app_member_module_access RENAME TO app_member_module_access_before_bot_center;
CREATE TABLE app_member_module_access (
 member_id INTEGER NOT NULL,
 module_code TEXT NOT NULL CHECK(module_code IN
 ('CUSTOMERS','ITEMS','DEFECTS','ORDERS','OUTSOURCING','WORKLOGS',
 'ERP_ITEM_QUERY','ERP_CUSTOMER_QUERY','ERP_RECEIVABLE_QUERY','ERP_ITEM_COST',
 'ERP_SUPPLIER_QUERY','ERP_RESTOCK_ASSIST','ORDERING','STORE_CUSTOMER_ORDERS','STORE_STOCKTAKE','STORE_MONTHLY_TODOS','STORE_REPAIRS','BOT_CENTER')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),updated_at TEXT NOT NULL,updated_by INTEGER,
 PRIMARY KEY(member_id,module_code),
 FOREIGN KEY(member_id) REFERENCES app_members(id) ON DELETE CASCADE,
 FOREIGN KEY(updated_by) REFERENCES app_members(id) ON DELETE RESTRICT
);
INSERT INTO app_member_module_access SELECT * FROM app_member_module_access_before_bot_center;
DROP TABLE app_member_module_access_before_bot_center;
CREATE INDEX idx_app_member_module_access_enabled ON app_member_module_access(member_id,enabled,module_code);

CREATE TABLE bot_profiles (
 id INTEGER PRIMARY KEY,
 code TEXT NOT NULL UNIQUE CHECK(length(code) BETWEEN 2 AND 32 AND code GLOB '[A-Z]*' AND code NOT GLOB '*[^A-Z0-9_]*'),
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 160),
 status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','working','blocked','done')),
 summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 800),
 updated_at TEXT NOT NULL
);

CREATE TABLE bot_drafts (
 id INTEGER PRIMARY KEY,
 bot_id INTEGER NOT NULL REFERENCES bot_profiles(id),
 external_ref TEXT CHECK(external_ref IS NULL OR (length(trim(external_ref)) BETWEEN 1 AND 320)),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 480),
 body TEXT NOT NULL CHECK(length(body) <= 16000),
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected')),
 review_reason TEXT CHECK(review_reason IS NULL OR length(review_reason) <= 2000),
 reviewed_by INTEGER REFERENCES app_members(id),
 reviewed_at TEXT,
 created_at TEXT NOT NULL,
 CHECK((review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX idx_bot_drafts_external_ref ON bot_drafts(bot_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX idx_bot_drafts_status ON bot_drafts(review_status, id DESC);

CREATE TABLE bot_reports (
 id INTEGER PRIMARY KEY,
 bot_id INTEGER NOT NULL REFERENCES bot_profiles(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 480),
 body TEXT NOT NULL CHECK(length(body) <= 16000),
 reported_at TEXT NOT NULL
);
CREATE INDEX idx_bot_reports_recent ON bot_reports(id DESC);

CREATE TABLE bot_completions (
 id INTEGER PRIMARY KEY,
 bot_id INTEGER NOT NULL REFERENCES bot_profiles(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 480),
 detail TEXT NOT NULL DEFAULT '' CHECK(length(detail) <= 16000),
 completed_at TEXT NOT NULL
);
CREATE INDEX idx_bot_completions_time ON bot_completions(completed_at, id DESC);

-- Hash only. Plaintext is returned once and is not part of the portable backup.
CREATE TABLE bot_ingest_credentials (
 id INTEGER PRIMARY KEY CHECK(id = 1),
 token_hash TEXT CHECK(token_hash IS NULL OR (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
 created_at TEXT,
 revoked_at TEXT,
 updated_by INTEGER REFERENCES app_members(id)
);
