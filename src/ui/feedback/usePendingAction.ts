import { useCallback, useState } from "react";

/**
 * Remembers which action button started the current request, so only that button
 * shows the busy spinner while the rest of the page is disabled by the shared busy flag.
 */
export function usePendingAction() {
  const [pending, setPending] = useState<string | null>(null);
  const track = useCallback((key: string, work: Promise<unknown>) => {
    setPending(key);
    void work.finally(() => setPending((current) => (current === key ? null : current)));
  }, []);
  return { pending, track };
}
