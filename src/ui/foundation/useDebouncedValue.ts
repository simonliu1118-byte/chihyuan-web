import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
