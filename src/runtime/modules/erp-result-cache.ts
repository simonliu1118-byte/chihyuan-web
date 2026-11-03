import type { ErpQueryResult } from "../../../shared/erp-item-query";

/**
 * Finished ERP results kept in this tab (user 2026-11-03): CY Web clears a result 5 minutes after
 * it finishes, so the page keeps its own copy until the tab or browser closes or the member logs
 * out. sessionStorage only: a result too large for it (big reports) is not kept and shows as before.
 */
const PREFIX = "cy-erp-result:";
const MAX_KEPT = 30;

function keys(storage: Storage): string[] {
  const found: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) found.push(key);
  }
  return found;
}

export function keepErpResult(result: ErpQueryResult): void {
  try {
    const storage = window.sessionStorage;
    const kept = keys(storage);
    // Oldest first out (by completedAt) once the tab holds many.
    if (kept.length >= MAX_KEPT) {
      const oldest = kept.map(key => ({ key, at: (JSON.parse(storage.getItem(key) ?? "{}") as Partial<ErpQueryResult>).completedAt ?? "" }))
        .sort((a, b) => a.at.localeCompare(b.at))[0];
      if (oldest) storage.removeItem(oldest.key);
    }
    storage.setItem(PREFIX + result.id, JSON.stringify(result));
  } catch { /* too large or storage blocked: CY Web still has it for 5 minutes */ }
}

export function keptErpResult(id: string): ErpQueryResult | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + id);
    return raw ? JSON.parse(raw) as ErpQueryResult : null;
  } catch { return null; }
}

/** On logout or when the session ends: nothing of the last member stays in the tab. */
export function clearErpResults(): void {
  try {
    const storage = window.sessionStorage;
    for (const key of keys(storage)) storage.removeItem(key);
  } catch { /* storage blocked */ }
}
