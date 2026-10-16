#!/usr/bin/env python3
"""ERP Item Query: forward migration and independent Module Access smoke checks."""
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys=ON")
for sql in sorted((root / "migrations").glob("*.sql")):
    conn.executescript(sql.read_text(encoding="utf-8"))
assert "ERP_ITEM_QUERY" in (root / "shared/modules.ts").read_text(encoding="utf-8")
now = "2026-10-16T00:00:00Z"
conn.execute("INSERT INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES ('erp-test-member','9001',1,?,?)",(now,now))
member = conn.execute("SELECT id FROM app_members WHERE employee_no='9001'").fetchone()[0]
conn.execute("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(?,?,1,?)",(member,"ERP_ITEM_QUERY",now))
assert conn.execute("SELECT enabled FROM app_member_module_access WHERE member_id=? AND module_code='ERP_ITEM_QUERY'",(member,)).fetchone() == (1,)
for id, status in (("test-1","QUEUED"),("test-2","DONE")):
    conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at) VALUES(?,?,?,?,?,?)",(id,member,"T0001",status,now,now))
try:
    conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at) VALUES('test-3',?,'T0002','RUNNING',?,?)",(member,now,now))
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("active job uniqueness not enforced")
conn.execute("UPDATE erp_item_queries SET status='DONE',completed_at=? WHERE id='test-1'",(now,))
conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at) VALUES('test-4',?,'T0002','RUNNING',?,?)",(member,now,now))
conn.execute("UPDATE erp_item_queries SET fields_json='[{\"name\":\"品號\",\"value\":\"T0002\"}]' WHERE id='test-4'")
conn.execute("UPDATE erp_item_queries SET fields_json=NULL WHERE id='test-4'")
assert conn.execute("SELECT fields_json FROM erp_item_queries WHERE id='test-4'").fetchone() == (None,)
conn.execute("INSERT INTO erp_item_agent_credentials(id,token_hash,created_at,updated_by) VALUES(1,?,?,?)",("a"*64,now,member))
assert conn.execute("SELECT token_hash FROM erp_item_agent_credentials WHERE id=1").fetchone()==("a"*64,)
conn.execute("UPDATE erp_item_agent_credentials SET token_hash=NULL,revoked_at=? WHERE id=1",(now,))
assert conn.execute("SELECT token_hash FROM erp_item_agent_credentials WHERE id=1").fetchone()==(None,)
conn.close()
print("PASS ERP item query migration, access, queue, JSON and retention schema")
