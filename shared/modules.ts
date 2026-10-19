export const CYWEB_MODULES = [
  { code: "CUSTOMERS", route: "customers", label: "客戶" },
  { code: "ITEMS", route: "items", label: "商品" },
  { code: "DEFECTS", route: "defects", label: "瑕疵" },
  { code: "ORDERS", route: "orders", label: "銷售工單" },
  { code: "OUTSOURCING", route: "outsourcing", label: "委外/代工" },
  { code: "WORKLOGS", route: "worklogs", label: "工作日誌" },
  { code: "ERP_ITEM_QUERY", route: "erp-item-query", label: "ERP 商品查詢" },
  // One ERP 查詢 page (user 2026-10-17: one entry); each category has its own grant.
  { code: "ERP_CUSTOMER_QUERY", route: "erp-item-query", label: "ERP 客戶查詢" },
  { code: "ERP_RECEIVABLE_QUERY", route: "erp-item-query", label: "ERP 未收款查詢" },
  { code: "ERP_SUPPLIER_QUERY", route: "erp-item-query", label: "ERP 供應商查詢" },
  // A permission inside ERP 商品查詢 (標準進價), not a page of its own.
  { code: "ERP_ITEM_COST", route: null, label: "ERP 商品成本" },
] as const;

export type CyWebModuleCode = (typeof CYWEB_MODULES)[number]["code"];
export type CyWebModuleRoute = (typeof CYWEB_MODULES)[number]["route"];

export function isCyWebModuleCode(value: unknown): value is CyWebModuleCode {
  return typeof value === "string" && CYWEB_MODULES.some((module) => module.code === value);
}

export function isCyWebModuleRoute(value: unknown): value is CyWebModuleRoute {
  return typeof value === "string" && CYWEB_MODULES.some((module) => module.route === value);
}

/** The grants that open a page; any one of them is enough (ERP 查詢 has four). */
export function moduleCodesForRoute(route: string): CyWebModuleCode[] {
  return CYWEB_MODULES.filter((module) => module.route === route).map((module) => module.code);
}
