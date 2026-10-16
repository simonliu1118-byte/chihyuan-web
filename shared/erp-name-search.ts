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
