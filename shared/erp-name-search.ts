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
  // Letters, digits and 「-」 (user 2026-10-21: 品號 such as K1807003-1), starting with a letter or digit.
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/.test(code) ? code : null;
}

/**
 * A 銷貨單／銷退單 number 「232A-20260804003」 (單別, dash, number), or null. Only 單別 23x (銷貨,
 * COPR15) and 24x (銷退, COPR16) are orders the Agent can open (user 2026-10-17).
 */
export function parseErpOrderNo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const no = value.trim().toUpperCase();
  return /^(23|24)[A-Z0-9]{0,4}-[0-9]{6,20}$/.test(no) ? no : null;
}
