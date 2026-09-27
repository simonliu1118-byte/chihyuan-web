export function formatScaledInteger(value: number, decimalPlaces: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new Error("FIXED_POINT_INTEGER_OUT_OF_RANGE");
  }
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 9) {
    throw new Error("FIXED_POINT_SCALE_INVALID");
  }

  if (decimalPlaces === 0) return String(value);

  const negative = value < 0;
  const absolute = Math.abs(value);
  const factor = 10 ** decimalPlaces;
  const whole = Math.floor(absolute / factor);
  const fraction = String(absolute % factor).padStart(decimalPlaces, "0").replace(/0+$/, "");
  const rendered = fraction ? `${whole}.${fraction}` : String(whole);
  return negative ? `-${rendered}` : rendered;
}

export function formatScaled4(value: number): string {
  return formatScaledInteger(value, 4);
}

export function formatMoney2(value: number): string {
  return formatScaledInteger(value, 2);
}
