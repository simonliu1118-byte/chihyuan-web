-- V0.9.38 ERP 關閉／暫停 (user 2026-10-27): anyone with an ERP query grant may ask the Agent to
-- close ERP once its queue is done (freeing an ERP licence), optionally holding new queries for
-- 15／30／60 minutes, or to force-close ERP after a failed query. One shared row; the Agent reads
-- it on claim and reports the outcome. Operational state only: not part of the portable backup.
CREATE TABLE erp_item_agent_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  request TEXT CHECK (request IS NULL OR request IN ('CLOSE','FORCE_CLOSE')),
  requested_at TEXT,
  requested_by INTEGER,
  hold_until TEXT,
  result TEXT CHECK (result IS NULL OR result IN ('CLOSED','KEPT_OPEN','NOT_OPEN','FAILED')),
  result_at TEXT,
  FOREIGN KEY (requested_by) REFERENCES app_members(id) ON UPDATE RESTRICT ON DELETE SET NULL
);
