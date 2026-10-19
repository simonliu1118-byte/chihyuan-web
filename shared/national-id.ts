/** Taiwan citizen ID and new-format ARC check digits. Never include raw IDs in audit payloads. */
const LETTER_CODES: Record<string, number> = Object.fromEntries("ABCDEFGHJKLMNPQRSTUVXYWZIO".split("").map((char, i) => [char, 10 + i]));
export function isValidTaiwanId(value: string): boolean {
  const id = value.trim().toUpperCase();
  if (!/^[A-Z][12][0-9]{8}$/.test(id) && !/^[A-Z][89][0-9]{8}$/.test(id)) return false;
  const code = LETTER_CODES[id[0]];
  if (code === undefined) return false;
  const digits = [Math.floor(code / 10), code % 10, ...id.slice(1).split("").map(Number)];
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
  return digits.reduce((sum, digit, i) => sum + digit * weights[i], 0) % 10 === 0;
}
export function maskTaiwanId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim().toUpperCase();
  return id.length === 10 ? id.slice(0, 3) + "****" + id.slice(7) : null;
}
