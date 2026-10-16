/** Public-safe ERP item-name search validation. No SQL or ERP field mapping crosses this boundary. */
export const ERP_NAME_MAX_LENGTH = 40;
export function parseErpNameKeyword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\x00-\x1f\x7f]/u.test(value)) return null;
  const keyword = value.trim();
  if (!keyword || Array.from(keyword).length > ERP_NAME_MAX_LENGTH
    || /['%_\[\]]/u.test(keyword)) return null;
  return keyword;
}
/** Compare by case and full/half width, matching the name-search agent's intent. */
export function erpNameContains(name: string, keyword: string): boolean {
  return name.normalize("NFKC").toLocaleLowerCase().includes(keyword.normalize("NFKC").toLocaleLowerCase());
}
/**
 * ERP codes (品號, 客戶代號, 業務員代號) are ASCII letters and digits only, 1～40 characters, the
 * same rule as CYERPAutoQuery (user 2026-10-16). Case is kept: ERP codes are case sensitive.
 */
export function parseErpCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return /^[A-Za-z0-9]{1,40}$/.test(code) ? code : null;
}
