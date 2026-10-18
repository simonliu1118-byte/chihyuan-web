/**
 * The one loading indicator: a spinner with 載入中. Used wherever a screen, pane or
 * list waits for data, so every wait looks the same. Button busy labels stay separate.
 */
export function Loading({ inline = false }: { inline?: boolean }) {
  return <div className={inline ? "cy-loading inline" : "cy-loading"} role="status" aria-live="polite">
    <span className="cy-loading-spinner" aria-hidden="true" />
    <span>載入中…</span>
  </div>;
}
