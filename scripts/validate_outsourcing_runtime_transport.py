#!/usr/bin/env python3
"""Source contract for the WO-0.18 operational React -> Worker -> D1 flow."""
from __future__ import annotations
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p:str)->str:
    s=(ROOT/p).read_text(encoding="utf-8")
    assert s.strip(),f"empty {p}"
    return s
def main()->None:
    app=read("src/App.tsx")
    page=read("src/runtime/modules/OutsourcingOperationalPage.tsx")
    client=read("src/runtime/api/outsourcing-flow-client.ts")
    routes=read("worker/http/business-api-phase2-routes.ts")
    assert 'route === "outsourcing"' in app and "OutsourcingOperationalPage" in app
    for obsolete in ("useLocalDatabase","mutateLocalDatabase","LocalOutsourcingOrder","nextLocalId"):
        assert obsolete not in page,f"obsolete local authority: {obsolete}"
    for token in ("ModuleSections","RecordSheet","RecordRows","EntryTable",
                  "flowApi.createOrder","flowApi.issue","flowApi.receive",
                  "flowApi.stockEvent","flowApi.createStatement","flowApi.addPayment"):
        assert token in page,f"missing shared UI or operation {token}"
    for token in ('/orders','/stock','/statements','/payments'):
        assert token in client,f"missing transport: {token}"
    for token in ('requireBusinessModule(request, env, requestId, "OUTSOURCING")',
                  'flow.listOrders','flow.issue','flow.receive','flow.listStatements',
                  'flow.addPayment','flow.stock'):
        assert token in routes,f"missing server flow: {token}"
    print("PASS WO-0.18 React -> Worker/D1 transport")
if __name__=="__main__":main()
