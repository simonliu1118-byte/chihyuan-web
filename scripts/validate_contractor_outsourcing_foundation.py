#!/usr/bin/env python3
"""Focused source and schema checks for contractor/BOM and WO-0.18 batch outsourcing."""
from __future__ import annotations
import sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def read(path:str)->str:
    s=(ROOT/path).read_text(encoding="utf-8")
    assert s.strip(),f"empty: {path}"
    return s

def check_sources()->None:
    contract=read("shared/contractor-outsourcing.ts")
    flow=read("worker/outsourcing/flow-service.ts")
    math=read("shared/outsourcing-flow.ts")
    route=read("worker/http/business-api-phase2-routes.ts")
    for s in ("ContractorBillingMethod","billingMethod","ContractorPrice","BomDetail"):
        assert s in contract,f"missing contractor contract: {s}"
    for s in ("createOrder","issue(","receive(","cancelIssue","cancelReceipt","adjustStock",
              "createStatement","confirmStatement","addPayment","AuditService"):
        assert s in flow,f"missing batch flow behavior: {s}"
    for s in ("stockGaugeFromMovements","productionCapacity","roundedLineMoney2","outsourcingLifecycle"):
        assert s in math,f"missing shared calculation: {s}"
    for s in ('requireBusinessModule(request, env, requestId, "OUTSOURCING")',
              'flow.receive(','flow.issue(','flow.createStatement(','flow.addPayment('):
        assert s in route,f"missing Worker/D1 route: {s}"

def check_schema()->None:
    schema="\n".join(p.read_text(encoding="utf-8") for p in sorted((ROOT/"migrations").glob("*.sql")))
    c=sqlite3.connect(":memory:")
    c.execute("PRAGMA foreign_keys=ON")
    c.executescript(schema)
    now="2026-11-10T00:00:00Z"
    c.execute("INSERT INTO app_members(identity_employee_id,employee_no,is_active,created_at,updated_at) VALUES('e1','E001',1,?,?)",(now,now))
    c.execute("INSERT INTO items(item_no,name,base_unit,created_at,updated_at) VALUES('FIN1','成品','個',?,?)",(now,now))
    c.execute("INSERT INTO items(item_no,name,base_unit,created_at,updated_at) VALUES('PART1','料件','個',?,?)",(now,now))
    c.execute("INSERT INTO contractors(entity_type,display_name,is_active,created_at,updated_at,revision) VALUES('organization','代工甲',1,?,?,1)",(now,now))
    assert c.execute("SELECT billing_method FROM contractors WHERE id=1").fetchone()[0]=="single"
    c.execute("UPDATE contractors SET billing_method='monthly' WHERE id=1")
    c.execute("INSERT INTO bom_recipes(recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,updated_at,revision) VALUES('BOM-A',1,10000,'個',1,?,?,1)",(now,now))
    c.execute("INSERT INTO bom_recipes(recipe_ref,finished_item_id,output_quantity,output_unit,is_active,created_at,updated_at,revision) VALUES('BOM-B',1,10000,'個',1,?,?,1)",(now,now))
    assert c.execute("SELECT COUNT(*) FROM bom_recipes WHERE finished_item_id=1").fetchone()[0]==2
    c.execute("INSERT INTO outsourcing_orders(outsourcing_ref,contractor_id,contractor_name_snapshot,order_date,created_at,created_by,updated_at,updated_by) VALUES('OUT-1',1,'代工甲','2026-11-10',?,1,?,1)",(now,now))
    c.execute("INSERT INTO outsourcing_order_products(outsourcing_order_id,item_id,bom_recipe_id,planned_quantity,unit) VALUES(1,1,1,100000,'個')")
    c.execute("INSERT INTO outsourcing_order_products(outsourcing_order_id,item_id,bom_recipe_id,planned_quantity,unit) VALUES(1,1,2,200000,'個')")
    assert c.execute("SELECT COUNT(*) FROM outsourcing_order_products WHERE outsourcing_order_id=1").fetchone()[0]==2
    c.execute("INSERT INTO outsourcing_issues(outsourcing_order_id,issued_date,created_at,created_by) VALUES(1,'2026-11-10',?,1)",(now,))
    c.execute("INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,issue_id,created_at,operator_employee_id) VALUES(1,2,'issue',100000,'2026-11-10',1,?,1)",(now,))
    c.execute("INSERT INTO contractor_stock_movements(contractor_id,item_id,movement_type,quantity_delta,occurred_at,issue_id,reversal_of_movement_id,created_at,operator_employee_id) VALUES(1,2,'reversal',-100000,'2026-11-10',1,1,?,1)",(now,))
    assert c.execute("SELECT SUM(quantity_delta) FROM contractor_stock_movements WHERE contractor_id=1 AND item_id=2").fetchone()[0]==0
    try:c.execute("UPDATE contractors SET billing_method='weekly' WHERE id=1")
    except sqlite3.IntegrityError:pass
    else:raise AssertionError("invalid billing method accepted")
    c.close()
if __name__=="__main__":
    check_sources();check_schema();print("PASS contractor/BOM and WO-0.18 batch flow source/schema")
