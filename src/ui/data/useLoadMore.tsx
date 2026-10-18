import { useCallback, useRef, useState } from "react";

interface Page<T> { items: readonly T[]; nextCursor: string | null }

/**
 * Cursor paging for list panes. The list effect calls `reset(query, firstPage.nextCursor)`
 * after loading page one; `more()` appends the next page for that same query. A page that
 * arrives after the filters changed is discarded.
 */
export function useLoadMore<Q extends object, T extends { id: number }>(
  fetchPage: (query: Q & { cursor: string }) => Promise<Page<T>>,
  setRows: (update: (current: readonly T[]) => readonly T[]) => void,
  onError: (error: unknown) => void,
) {
  const query = useRef<Q | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = useCallback((next: Q, nextCursor: string | null) => {
    query.current = next;
    setCursor(nextCursor);
  }, []);

  const more = useCallback(async () => {
    const current = query.current;
    if (!cursor || !current || loading) return;
    setLoading(true);
    try {
      const page = await fetchPage({ ...current, cursor });
      if (query.current !== current) return;
      setRows(rows => [...rows, ...page.items.filter(item => !rows.some(row => row.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, fetchPage, setRows, onError]);

  return { hasMore: cursor !== null, loading, reset, more };
}

/** "載入更多" row at the end of a list pane. */
export function LoadMoreRow({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  if (!hasMore) return null;
  return <div className="cy-load-more">
    <button type="button" className="cy-op-button compact" disabled={loading} onClick={onMore}>{loading ? "載入中…" : "載入更多"}</button>
  </div>;
}
