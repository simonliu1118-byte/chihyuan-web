const key = "cyweb.remembered-employee-number";

/** Store only an optional account hint, never passwords or CYID session authority. */
export function getRememberedEmployee(): string {
  try {
    const number = window.localStorage.getItem(key) ?? "";
    return /^\d{4}$/.test(number) ? number : "";
  } catch { return ""; }
}

export function saveRememberedEmployee(employeeNo: string | null): void {
  try {
    if (employeeNo && /^\d{4}$/.test(employeeNo)) window.localStorage.setItem(key, employeeNo);
    else window.localStorage.removeItem(key);
  } catch { /* Private browsing may block this convenience. */ }
}
