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
  // 進貨輔助 (user 2026-10-20): a page of its own, every customer's 銷貨／銷退 per 品號 with 庫存.
  { code: "ERP_RESTOCK_ASSIST", route: "restock-assist", label: "進貨輔助" },
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

/**
 * Grants another grant depends on (user 2026-10-21: 進貨輔助 needs ERP 商品查詢 and ERP 客戶查詢,
 * which holds 銷貨銷退單). A grant whose requirements are not all held does not count; saving one
 * without them, or removing a requirement while it is on, is refused.
 */
export const MODULE_REQUIREMENTS: Partial<Record<CyWebModuleCode, readonly CyWebModuleCode[]>> = {
  ERP_RESTOCK_ASSIST: ["ERP_ITEM_QUERY", "ERP_CUSTOMER_QUERY"],
};

export function moduleLabel(code: CyWebModuleCode): string {
  return CYWEB_MODULES.find((module) => module.code === code)?.label ?? code;
}

/** The grants that are in effect: each one whose requirements are all held. */
export function effectiveModules<T extends string>(codes: readonly T[]): T[] {
  const held = new Set<string>(codes);
  return codes.filter((code) => (MODULE_REQUIREMENTS[code as CyWebModuleCode] ?? []).every((need) => held.has(need)));
}

/** What a set of grants lacks, as a sentence for the person saving it; null when every requirement is held. */
export function moduleRequirementProblem(codes: Iterable<string>): string | null {
  const held = new Set(codes);
  for (const [code, needs] of Object.entries(MODULE_REQUIREMENTS) as [CyWebModuleCode, readonly CyWebModuleCode[]][]) {
    const missing = needs.filter((need) => !held.has(need));
    if (held.has(code) && missing.length)
      return `「${moduleLabel(code)}」需同時開啟${needs.map((need) => `「${moduleLabel(need)}」`).join("、")}；目前缺少${missing.map((need) => `「${moduleLabel(need)}」`).join("、")}。`;
  }
  return null;
}

/** The grants that need <paramref name="code"/>, e.g. 進貨輔助 for ERP 商品查詢. */
export function modulesRequiring(code: CyWebModuleCode): CyWebModuleCode[] {
  return (Object.entries(MODULE_REQUIREMENTS) as [CyWebModuleCode, readonly CyWebModuleCode[]][])
    .filter(([, needs]) => needs.includes(code)).map(([dependent]) => dependent);
}

/**
 * Turning one grant on or off for someone who holds <paramref name="held"/>: why it may not be
 * saved, or null. On needs every required grant held; off may not take away what a held grant needs.
 */
export function moduleChangeProblem(held: ReadonlySet<string>, code: CyWebModuleCode, enabled: boolean): string | null {
  const names = (codes: readonly CyWebModuleCode[]) => codes.map((c) => `「${moduleLabel(c)}」`).join("、");
  if (enabled) {
    const needs = MODULE_REQUIREMENTS[code] ?? [];
    const missing = needs.filter((need) => !held.has(need));
    return missing.length ? `「${moduleLabel(code)}」需同時開啟${names(needs)}，請先開啟${names(missing)}。` : null;
  }
  const dependents = modulesRequiring(code).filter((dependent) => held.has(dependent));
  return dependents.length ? `${names(dependents)}需要「${moduleLabel(code)}」，請先關閉${names(dependents)}。` : null;
}
