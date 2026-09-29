export const CYWEB_MODULES = [
  { code: "CUSTOMERS", route: "customers", label: "客戶" },
  { code: "ITEMS", route: "items", label: "商品" },
  { code: "DEFECTS", route: "defects", label: "瑕疵" },
  { code: "ORDERS", route: "orders", label: "銷售工單" },
  { code: "OUTSOURCING", route: "outsourcing", label: "委外" },
  { code: "WORKLOGS", route: "worklogs", label: "工作日誌" },
] as const;

export type CyWebModuleCode = (typeof CYWEB_MODULES)[number]["code"];
export type CyWebModuleRoute = (typeof CYWEB_MODULES)[number]["route"];

export function isCyWebModuleCode(value: unknown): value is CyWebModuleCode {
  return typeof value === "string" && CYWEB_MODULES.some((module) => module.code === value);
}

export function isCyWebModuleRoute(value: unknown): value is CyWebModuleRoute {
  return typeof value === "string" && CYWEB_MODULES.some((module) => module.route === value);
}

export function moduleCodeForRoute(route: string): CyWebModuleCode | null {
  return CYWEB_MODULES.find((module) => module.route === route)?.code ?? null;
}
