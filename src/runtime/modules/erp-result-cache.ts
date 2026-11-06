import type { ErpQueryResult } from "../../../shared/erp-item-query";

/**
 * Finished ERP results kept in this tab (user 2026-11-03): CY Web clears a result 5 minutes after
 * it finishes, so the page keeps its own copy until the tab or browser closes or the member logs
 * out. sessionStorage only: a result too large for it (big reports) is not kept and shows as before.
 */
const PREFIX = "cy-erp-result:";

function keys(storage: Storage): string[] {
  const found: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) found.push(key);
  }
  return found;
}

/** Only the newest result of each query type is kept (user 2026-11-03): a page shows its newest anyway. */
export function keepErpResult(result: ErpQueryResult): void {
  try { window.sessionStorage.setItem(PREFIX + result.queryType, JSON.stringify(result)); }
  catch { /* too large or storage blocked: CY Web still has it for 5 minutes */ }
}

export function keptErpResult(id: string, queryType: ErpQueryResult["queryType"]): ErpQueryResult | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + queryType);
    const kept = raw ? JSON.parse(raw) as ErpQueryResult : null;
    return kept?.id === id ? kept : null;
  } catch { return null; }
}

/** On logout or when the session ends: nothing of the last member stays in the tab. */
export function clearErpResults(): void {
  try {
    const storage = window.sessionStorage;
    for (const key of keys(storage)) storage.removeItem(key);
  } catch { /* storage blocked */ }
}

/** Keep the original completion only while data exists on the server or in this tab. */
export function erpResultForDisplay(result: ErpQueryResult): ErpQueryResult | null {
  if (result.status !== "DONE") return result;
  if (!result.resultCleared) {
    keepErpResult(result);
    return result;
  }
  return keptErpResult(result.id, result.queryType);
}
