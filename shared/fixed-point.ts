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

export function parseScaledInteger(value: string, decimalPlaces: number): number {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 9) {
    throw new Error("FIXED_POINT_SCALE_INVALID");
  }

  const normalized = value.trim();
  const pattern = decimalPlaces === 0
    ? /^[-+]?\d+$/
    : new RegExp(`^[-+]?\\d+(?:\\.\\d{1,${decimalPlaces}})?$`);
  if (!pattern.test(normalized)) {
    throw new Error("FIXED_POINT_FORMAT_INVALID");
  }

  const negative = normalized.startsWith("-");
  const unsigned = normalized.replace(/^[-+]/, "");
  const [wholeText, fractionText = ""] = unsigned.split(".");
  const factor = 10 ** decimalPlaces;
  const whole = Number(wholeText);
  const fraction = decimalPlaces === 0
    ? 0
    : Number(fractionText.padEnd(decimalPlaces, "0"));
  const scaled = whole * factor + fraction;
  const signed = negative ? -scaled : scaled;

  if (!Number.isSafeInteger(signed)) {
    throw new Error("FIXED_POINT_INTEGER_OUT_OF_RANGE");
  }
  return signed;
}

export function formatScaled4(value: number): string {
  return formatScaledInteger(value, 4);
}

export function parseScaled4(value: string): number {
  return parseScaledInteger(value, 4);
}

export function formatMoney2(value: number): string {
  return formatScaledInteger(value, 2);
}

export function parseMoney2(value: string): number {
  return parseScaledInteger(value, 2);
}
