#!/usr/bin/env python3
"""Zero-dependency structural checks for the mixed React business runtime."""

from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    text = (ROOT / path).read_text(encoding="utf-8")
    if not text.strip():
        raise AssertionError(f"empty file: {path}")
    return text


def main() -> int:
    app = read("src/App.tsx")
    customer = read("src/runtime/modules/CustomerOperationalPage.tsx")
    quote_form = read("src/runtime/modules/customer/QuoteCreateForm.tsx")
    item = read("src/runtime/modules/ItemOperationalPage.tsx")
    item_client = read("src/runtime/api/item-runtime-client.ts")
    customer_client = read("src/runtime/api/customer-runtime-client.ts")
    defect = read("src/runtime/modules/DefectOperationalPage.tsx")
    defect_form = read("src/runtime/modules/defect/DefectForm.tsx")
    defect_client = read("src/runtime/api/defect-runtime-client.ts")
    order = read("src/runtime/modules/SalesOrderOperationalPage.tsx")
    order_client = read("src/runtime/api/sales-order-runtime-client.ts")
    outsourcing = read("src/runtime/modules/OutsourcingOperationalPage.tsx")
    outsourcing_client = read("src/runtime/api/outsourcing-runtime-client.ts")
    worklog = read("src/runtime/modules/WorkLogOperationalPage.tsx")
    worklog_client = read("src/runtime/api/work-log-runtime-client.ts")
    doc = read("docs/architecture/OPERATIONAL_RUNTIME.md")

    for token in ["#customers", "#items", "#orders", "#outsourcing", "#worklogs", "#audit"]:
        if token not in app:
            raise AssertionError(f"missing operational navigation: {token}")
    # WO-0.16.0: no separate sidebar entry for defects, but old #defects is still a
    # routable deep link with its own grant in the shared item workspace.
    items_workspace = read("src/runtime/modules/ItemsModulePage.tsx")
    if '"defects"' not in app or 'route === "items" || route === "defects"' not in app:
        raise AssertionError("missing backward-compatible defect deep link")
    if 'routeHref(key)' not in items_workspace or 'canDefects' not in items_workspace:
        raise AssertionError("defect route must retain its independent permission")

    for retired in ["src/runtime/OperationalWorkspace.tsx", "src/runtime/local-database.ts", "src/runtime/advanced-local-types.ts"]:
        if (ROOT / retired).exists():
            raise AssertionError(f"retired local runtime returned: {retired}")
    for page in ROOT.glob("src/**/*.tsx"):
        source = page.read_text()
        # WO-0.9.76 explicitly persists one display-only checkbox, never business data.
        # Permit only that literal key at its existing owner; other storage access stays forbidden.
        if page == ROOT / "src/runtime/modules/RestockAssist.tsx":
            source = source.replace('localStorage.getItem("cy-restock-daily")', "")
            source = source.replace('localStorage.setItem("cy-restock-daily",String(value))', "")
        if "local-database" in source or re.search(r"\blocalStorage\s*(?:\.|\[)", source):
            raise AssertionError(f"browser-local authority returned: {page}")
    # Settings live inside their modules (客戶、商品、工作日誌) rather than a shared 系統管理 page.
    for page, used_as, token in [("ModuleSettingsPanel", "ModuleSettingsButton", "loadSettings"), ("AuditOperationalPage", "AuditOperationalPage", "loadAudit")]:
        source = read(f"src/runtime/modules/{page}.tsx")
        if used_as not in app or token not in source:
            raise AssertionError(f"missing protected admin page: {page}")
    if "#settings" in app:
        raise AssertionError("shared settings entry returned; settings belong to their modules")

    for token in [
        "新增拜訪",
        "startQuoteCorrection",
        "常用商品",
        "changeCustomerNumber",
        "checkCustomerTaxId",
        "createCustomerVisit",
        "createCustomerQuote",
        "createCustomerFrequentItem",
    ]:
        if token not in (customer + quote_form):
            raise AssertionError(f"missing D1 Customer operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in customer:
            raise AssertionError(f"Customer operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/customers",
        "/api/business/customers/lookups",
        "/item-options",
        "/tax-id-check",
        "/number",
        "/visits",
        "/quotes",
        "/frequent-items",
        "apiRequest",
    ]:
        if token not in customer_client:
            raise AssertionError(f"missing Customer Worker API transport contract: {token}")

    for token in [
        "validateConversions",
        "changeItemNumberRequest",
        "loadItemNumberHistory",
        "createItem",
        "updateItem",
        "costTaxMode",
        "storePrice",
        "clinicPrice",
        "更改品號",
        "歷史品號",
    ]:
        if token not in item:
            raise AssertionError(f"missing D1 Item operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in item:
            raise AssertionError(f"Item operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/items",
        "/api/business/items/lookups",
        "/number-history",
        "/number",
        "apiRequest",
    ]:
        if token not in item_client:
            raise AssertionError(f"missing Item Worker API transport contract: {token}")

    for token in [
        "loadDefectLookups",
        "searchDefects",
        "loadDefectDetail",
        "createDefect",
        "updateDefect",
        "startDefectProcessing",
        "resolveDefect",
        "reopenDefect",
        "invalidateDefect",
        "deleteDefect",
        "顯示作廢",
    ]:
        if token not in (defect + defect_form):
            raise AssertionError(f"missing D1 Defect operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalDefect",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in defect:
            raise AssertionError(f"Defect operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/defects",
        "/lookups",
        "start-processing",
        "resolve",
        "reopen",
        "invalidate",
        "apiRequest",
    ]:
        if token not in defect_client:
            raise AssertionError(f"missing Defect Worker API transport contract: {token}")


    for token in [
        "loadSalesOrderLookups",
        "searchSalesOrders",
        "loadSalesOrderDetail",
        "createSalesOrder",
        "updateSalesOrder",
        "fillOrCorrectSalesOrderErp",
        "markSalesOrderPicked",
        "markSalesOrderShipped",
        "reverseSalesOrderShipment",
        "deleteSalesOrderDraft",
    ]:
        if token not in order:
            raise AssertionError(f"missing D1 Sales Order operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalSalesOrder",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in order:
            raise AssertionError(f"Sales Order operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/orders",
        "/lookups",
        "/erp",
        "waiting-stock",
        "picked",
        "shipped",
        "reverse-shipment",
        "void",
        "apiRequest",
    ]:
        if token not in order_client:
            raise AssertionError(f"missing Sales Order Worker API transport contract: {token}")


    # WO-0.18: validate the *active* five-tab flow and its Worker/D1 API,
    # rather than retaining the retired one-shot outbound/payment operations.
    flow_client = read("src/runtime/api/outsourcing-flow-client.ts")
    outsourcing_routes = read("worker/http/business-api-phase2-routes.ts")
    flow_service = read("worker/outsourcing/flow-service.ts")
    for token in (
        "ModuleSections", "RecordSheet", "RecordRows", "EntryTable",
        "searchContractors", "searchBoms", "flowApi.listOrders",
        "flowApi.createOrder", "flowApi.issue", "flowApi.receive",
        "flowApi.stockEvent", "flowApi.groupedStock",
        "flowApi.issueSuggestion", "flowApi.consumptionPreview",
        "flowApi.createStatement", "flowApi.addPayment",
    ):
        if token not in outsourcing:
            raise AssertionError(f"missing WO-0.18 Outsourcing UI operation: {token}")
    for token in (
        "flowApi.cancelIssue", "flowApi.cancelReceipt",
        "flowApi.confirmStatement", "flowApi.unconfirmStatement",
        "flowApi.deletePayment", "flowApi.reopen",
    ):
        if token not in outsourcing:
            raise AssertionError(f"missing WO-0.18 reversible operation: {token}")

    for forbidden in (
        "useLocalDatabase", "mutateLocalDatabase", "../local-database",
        "LocalOutsourcingOrder", "nextLocalId", "timestampNow",
    ):
        if forbidden in outsourcing:
            raise AssertionError(f"Outsourcing page retained browser-local authority: {forbidden}")

    for token in (
        "/api/business/outsourcing", "/lookups", "/contractors", "/boms", "apiRequest",
    ):
        if token not in outsourcing_client:
            raise AssertionError(f"missing Outsourcing master-data transport: {token}")
    for token in (
        "/orders", "/issues", "/receipts", "/stock", "/stock/groups",
        "/issue-suggestion", "/consumption-preview", "/stock/history",
        "/statements", "/payments", "/confirm", "/unconfirm", "apiRequest",
    ):
        if token not in flow_client:
            raise AssertionError(f"missing WO-0.18 flow transport: {token}")
    for token in (
        'requireBusinessModule(request, env, requestId, "OUTSOURCING")',
        "flow.createOrder", "flow.issue", "flow.receive",
        "flow.adjustStock", "flow.recommendedIssue", "flow.previewConsumption",
        "flow.groupedStock", "flow.createStatement", "flow.addPayment",
    ):
        if token not in outsourcing_routes:
            raise AssertionError(f"missing protected WO-0.18 Worker route: {token}")
    for token in (
        "outsourcingLifecycle", "stockGaugeFromMovements",
        "cancelIssue", "cancelReceipt", "statementDetail",
        "confirmStatement", "deletePayment",
    ):
        if token not in (flow_service + read("shared/outsourcing-flow.ts")):
            raise AssertionError(f"missing WO-0.18 D1 domain behavior: {token}")


    for token in [
        "loadWorkLogConfiguration",
        "loadWorkLogStatistics",
        "searchWorkLogs",
        "loadWorkLogDetail",
        "createWorkLog",
        "updateWorkLogCreated",
        "submitWorkLog",
        "withdrawWorkLog",
        "reviewWorkLog",
        "cancelWorkLogReview",
        "deleteWorkLogCreated",
    ]:
        if token not in worklog:
            raise AssertionError(f"missing D1 WorkLog operational behavior: {token}")

    for forbidden in [
        "useLocalDatabase",
        "mutateLocalDatabase",
        "../local-database",
        "LocalWorkLog",
        "nextLocalId",
        "timestampNow",
    ]:
        if forbidden in worklog:
            raise AssertionError(f"WorkLog operational page must not retain localStorage authority: {forbidden}")

    for token in [
        "/api/business/worklogs",
        "/configuration",
        "/statistics",
        'transition(workLogId, "submit", input)',
        'transition(workLogId, "withdraw", input)',
        "/review",
        'transition(workLogId, "cancel-review", input)',
        "apiRequest",
    ]:
        if token not in worklog_client:
            raise AssertionError(f"missing WorkLog Worker API transport contract: {token}")

    normalized_doc = doc.lower()
    for token in [
        "business transport complete",
        "worker protected http api",
        "standalone `preview/*`",
        "browser-local authority retired",
    ]:
        if token not in normalized_doc:
            raise AssertionError(f"missing operational-runtime contract: {token}")

    print("PASS business operational runtime contracts (all six business modules use Worker/D1 authority)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
