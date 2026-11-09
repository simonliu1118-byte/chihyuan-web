import type { ReactNode } from "react";

/** One stroke style for every action glyph; size and colour come from .cy-icon in app.css. */
function Glyph({ children }: { children: ReactNode }) {
  return <svg className="cy-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">{children}</svg>;
}

/** Shared action icons. Add new glyphs here instead of inline SVG in a module. */
export const Icons = {
  tag: <Glyph><path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="8" cy="8" r="1.5"/></Glyph>,
  circle: <Glyph><circle cx="12" cy="12" r="8" /></Glyph>,
  warning: <Glyph><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></Glyph>,
  print: <Glyph><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></Glyph>,
  camera: <Glyph><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="4"/><path d="m8 6 1-2h6l1 2"/></Glyph>,
  history: <Glyph><path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7" /><path d="M12 7v5l3 2" /></Glyph>,
  edit: <Glyph><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></Glyph>,
  cancel: <Glyph><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8m-8 0 8-8" /></Glyph>,
  back: <Glyph><path d="m9 4-6 6 6 6" /><path d="M3 10h11a6 6 0 0 1 6 6v4" /></Glyph>,
  check: <Glyph><path d="m5 12 4 4L19 6" /></Glyph>,
  close: <Glyph><path d="m6 6 12 12M6 18 18 6" /></Glyph>,
  add: <Glyph><path d="M12 5v14M5 12h14" /></Glyph>,
  retry: <Glyph><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></Glyph>,
  verify: <Glyph><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></Glyph>,
  chevronRight: <Glyph><path d="m9 6 6 6-6 6" /></Glyph>,
  grip: <Glyph><path d="M8 5h.01M8 12h.01M8 19h.01M16 5h.01M16 12h.01M16 19h.01" /></Glyph>,
  settings: <Glyph><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Glyph>,
  eye: <Glyph><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Glyph>,
  bell: <Glyph><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10Z"/><path d="M10 21h4"/></Glyph>,
  remove: <Glyph><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></Glyph>,
} as const;
