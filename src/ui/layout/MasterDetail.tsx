import { useCallback, useState, type ReactNode } from "react";

/**
 * List/detail workspace. Wide screens show both panes; phones (≤ 820px) show one pane at a time.
 * `open` is the person's explicit intent to look at a record (tap a row, 新增, 修改); automatic
 * first-row selection on wide screens never hides the list on a phone.
 */
export function useMasterDetailPane() {
  const [detailOpen, setDetailOpen] = useState(false);
  const open = useCallback(() => {
    setDetailOpen(true);
    if (window.matchMedia("(max-width: 820px)").matches) window.scrollTo({ top: 0 });
  }, []);
  const close = useCallback(() => setDetailOpen(false), []);
  return { pane: detailOpen ? "detail" as const : "list" as const, open, close };
}

/** Phone-only back link at the top of the detail pane. */
export function MasterDetailBack({ label, onBack, disabled }: { label: string; onBack: () => void; disabled?: boolean }) {
  return <button type="button" className="cy-md-back" disabled={disabled} onClick={onBack}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>{label}
  </button>;
}

/** Empty detail pane: what to do next, in plain words. */
export function MasterDetailEmpty({ title, hint }: { title: string; hint?: ReactNode }) {
  return <div className="cy-md-empty"><div><strong>{title}</strong>{hint ? <p>{hint}</p> : null}</div></div>;
}
