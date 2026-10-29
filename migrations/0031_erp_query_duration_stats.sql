-- V0.9.53 (user 2026-10-29): the 排程佇列 estimate reads one running average per query type
-- instead of averaging 30 days of finished queries on every 5-second refresh. Each finished
-- query updates its type's average when the Agent reports it. Operational state only: not part
-- of the portable backup, like the ERP queue itself.
CREATE TABLE erp_query_duration_stats (
    query_type TEXT NOT NULL CHECK (length(query_type) BETWEEN 1 AND 40),
    include_history INTEGER NOT NULL CHECK (include_history IN (0,1)),
    avg_seconds REAL NOT NULL CHECK (avg_seconds >= 0),
    samples INTEGER NOT NULL CHECK (samples >= 1),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (query_type, include_history)
);
-- Start from the queries already kept, so the estimate does not fall back to the defaults.
INSERT INTO erp_query_duration_stats(query_type,include_history,avg_seconds,samples,updated_at)
SELECT query_type, include_history,
       MAX(0, AVG((julianday(completed_at)-julianday(started_at))*86400)), COUNT(*),
       strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM erp_item_queries
 WHERE status IN ('DONE','NOT_FOUND') AND started_at IS NOT NULL AND completed_at IS NOT NULL
 GROUP BY query_type, include_history;
