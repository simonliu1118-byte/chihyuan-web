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
# V0.9.41: a member may have up to three active jobs; the Worker checks the limit when one is made.
conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at) VALUES('test-3',?,'T0002','RUNNING',?,?)",(member,now,now))
assert not conn.execute("SELECT 1 FROM sqlite_master WHERE name='idx_erp_query_one_active_per_member'").fetchone()
conn.execute("DELETE FROM erp_item_queries WHERE id='test-3'")
conn.execute("UPDATE erp_item_queries SET status='DONE',completed_at=? WHERE id='test-1'",(now,))
conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at) VALUES('test-4',?,'T0002','RUNNING',?,?)",(member,now,now))
conn.execute("UPDATE erp_item_queries SET fields_json='[{\"name\":\"品號\",\"value\":\"T0002\"}]' WHERE id='test-4'")
conn.execute("UPDATE erp_item_queries SET fields_json=NULL WHERE id='test-4'")
assert conn.execute("SELECT fields_json FROM erp_item_queries WHERE id='test-4'").fetchone() == (None,)
conn.execute("INSERT INTO erp_item_agent_credentials(id,token_hash,created_at,updated_by) VALUES(1,?,?,?)",("a"*64,now,member))
assert conn.execute("SELECT token_hash FROM erp_item_agent_credentials WHERE id=1").fetchone()==("a"*64,)
conn.execute("UPDATE erp_item_agent_credentials SET token_hash=NULL,revoked_at=? WHERE id=1",(now,))
assert conn.execute("SELECT token_hash FROM erp_item_agent_credentials WHERE id=1").fetchone()==(None,)
assert {row[1] for row in conn.execute("PRAGMA table_info(erp_item_queries)")} >= {"include_history","history_from","history_to","batch_managed","batches_json","history_json"}
assert conn.execute("SELECT include_history,history_from,history_to,batch_managed FROM erp_item_queries WHERE id='test-2'").fetchone() == (0,None,None,None)
conn.execute("UPDATE erp_item_queries SET include_history=1,history_from='2026-01-01',history_to='2026-10-16',batch_managed=1,batches_json='[]',history_json='{}' WHERE id='test-2'")
assert conn.execute("SELECT batch_managed FROM erp_item_queries WHERE id='test-2'").fetchone() == (1,)
conn.execute("UPDATE erp_item_queries SET fields_json=NULL,warehouses_json=NULL,batches_json=NULL,history_json=NULL WHERE id='test-2'")
assert conn.execute("SELECT batches_json,history_json FROM erp_item_queries WHERE id='test-2'").fetchone() == (None,None)
cols={row[1] for row in conn.execute("PRAGMA table_info(erp_item_queries)")}
assert {"query_type","keyword","items_json"} <= cols
assert conn.execute("SELECT query_type,keyword FROM erp_item_queries WHERE id='test-2'").fetchone()==("ITEM_NO",None)
conn.execute("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,created_at,expires_at,query_type,keyword) VALUES('name-test',?,'ITEM_NAME','DONE',?,?, 'ITEM_NAME','假商品')",(member,now,now))
conn.execute('UPDATE erp_item_queries SET items_json=? WHERE id=?',('{"items":[],"total":0,"truncated":false}', 'name-test'))
assert conn.execute("SELECT json_extract(items_json,'$.total') FROM erp_item_queries WHERE id='name-test'").fetchone()==(0,)
conn.execute("UPDATE erp_item_queries SET items_json=NULL WHERE id='name-test'")
assert conn.execute("SELECT items_json FROM erp_item_queries WHERE id='name-test'").fetchone()==(None,)
conn.close()
print("PASS ERP item query migration, access, queue, JSON and retention schema")
