export const CYWEB_MODULES = [
  { code: "customers", label: "客戶" },
  { code: "items", label: "商品" },
  { code: "defects", label: "瑕疵" },
  { code: "orders", label: "銷售工單" },
  { code: "outsourcing", label: "委外" },
  { code: "worklogs", label: "工作日誌" },
  { code: "settings", label: "設定" },
  { code: "audit", label: "稽核紀錄" },
] as const;

export type CyWebModuleCode = (typeof CYWEB_MODULES)[number]["code"];

const MODULE_CODES = new Set<string>(CYWEB_MODULES.map((module) => module.code));

export function isCyWebModuleCode(value: string): value is CyWebModuleCode {
  return MODULE_CODES.has(value);
}
