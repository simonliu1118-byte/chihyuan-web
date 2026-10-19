export interface UnitConversionEdge {
  fromUnit: string;
  quantityScaled4: number;
  toUnit: string;
}

interface Rational {
  numerator: bigint;
  denominator: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1n;
}

function reduce(value: Rational): Rational {
  const common = gcd(value.numerator, value.denominator);
  return {
    numerator: value.numerator / common,
    denominator: value.denominator / common,
  };
}

function multiply(a: Rational, b: Rational): Rational {
  return reduce({
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  });
}

function divide(a: Rational, b: Rational): Rational {
  if (b.numerator === 0n) throw new Error("UNIT_CONVERSION_ZERO_FACTOR");
  return reduce({
    numerator: a.numerator * b.denominator,
    denominator: a.denominator * b.numerator,
  });
}

const SCALE4 = 10_000n;

/**
 * Item conversion semantics are `1 fromUnit = quantity toUnit`.
 * Every configured path must eventually resolve to the Item base unit.
 */
export function unitFactorToBase(
  baseUnit: string,
  edges: readonly UnitConversionEdge[],
  unit: string,
): Rational {
  if (unit === baseUnit) return { numerator: 1n, denominator: 1n };
  const byFrom = new Map(edges.map((edge) => [edge.fromUnit, edge] as const));
  const visited = new Set<string>();
  let current = unit;
  let factor: Rational = { numerator: 1n, denominator: 1n };

  while (current !== baseUnit) {
    if (visited.has(current)) throw new Error("UNIT_CONVERSION_CYCLE");
    visited.add(current);
    const edge = byFrom.get(current);
    if (!edge) throw new Error("UNIT_CONVERSION_PATH_MISSING");
    if (!Number.isSafeInteger(edge.quantityScaled4) || edge.quantityScaled4 <= 0) {
      throw new Error("UNIT_CONVERSION_FACTOR_INVALID");
    }
    factor = multiply(factor, {
      numerator: BigInt(edge.quantityScaled4),
      denominator: SCALE4,
    });
    current = edge.toUnit;
  }

  return factor;
}

export function convertScaled4Exact(
  quantityScaled4: number,
  fromUnit: string,
  toUnit: string,
  baseUnit: string,
  edges: readonly UnitConversionEdge[],
): number {
  if (!Number.isSafeInteger(quantityScaled4)) throw new Error("UNIT_CONVERSION_QUANTITY_INVALID");
  if (fromUnit === toUnit) return quantityScaled4;
  const sourceFactor = unitFactorToBase(baseUnit, edges, fromUnit);
  const targetFactor = unitFactorToBase(baseUnit, edges, toUnit);
  const ratio = divide(sourceFactor, targetFactor);
  const numerator = BigInt(quantityScaled4) * ratio.numerator;
  if (numerator % ratio.denominator !== 0n) {
    throw new Error("UNIT_CONVERSION_PRECISION_EXCEEDED");
  }
  const converted = numerator / ratio.denominator;
  const asNumber = Number(converted);
  if (!Number.isSafeInteger(asNumber)) throw new Error("UNIT_CONVERSION_RESULT_OUT_OF_RANGE");
  return asNumber;
}

export function allowedUnits(baseUnit: string, edges: readonly UnitConversionEdge[]): ReadonlySet<string> {
  return new Set([baseUnit, ...edges.map((edge) => edge.fromUnit)]);
}

/**
 * quantityScaled4 × unitPriceScaled4 -> money2. No hidden rounding is applied:
 * the result must already be exactly representable at two decimal places.
 */
export function scaled4ProductToMoney2Exact(quantityScaled4: number, unitPriceScaled4: number): number {
  if (!Number.isSafeInteger(quantityScaled4) || !Number.isSafeInteger(unitPriceScaled4)) {
    throw new Error("FIXED_POINT_OPERAND_INVALID");
  }
  const product = BigInt(quantityScaled4) * BigInt(unitPriceScaled4);
  const divisor = 1_000_000n;
  if (product % divisor !== 0n) throw new Error("MONEY2_PRECISION_EXCEEDED");
  const result = product / divisor;
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) throw new Error("MONEY2_RESULT_OUT_OF_RANGE");
  return asNumber;
}
