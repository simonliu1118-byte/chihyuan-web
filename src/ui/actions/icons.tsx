import type { ReactNode } from "react";

/** One stroke style for every action glyph; size and colour come from .cy-icon in app.css. */
function Glyph({ children }: { children: ReactNode }) {
  return <svg className="cy-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">{children}</svg>;
}

/** Shared action icons. Add new glyphs here instead of inline SVG in a module. */
export const Icons = {
  camera: <Glyph><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="4"/><path d="m8 6 1-2h6l1 2"/></Glyph>,
  history: <Glyph><path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7" /><path d="M12 7v5l3 2" /></Glyph>,
  edit: <Glyph><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></Glyph>,
  cancel: <Glyph><circle cx="12" cy="12" r="9" /><path d="m8 8 8 8m-8 0 8-8" /></Glyph>,
  back: <Glyph><path d="m9 4-6 6 6 6" /><path d="M3 10h11a6 6 0 0 1 6 6v4" /></Glyph>,
  check: <Glyph><path d="m5 12 4 4L19 6" /></Glyph>,
  close: <Glyph><path d="m6 6 12 12M6 18 18 6" /></Glyph>,
  add: <Glyph><path d="M12 5v14M5 12h14" /></Glyph>,
  chevronRight: <Glyph><path d="m9 6 6 6-6 6" /></Glyph>,
  grip: <Glyph><path d="M8 5h.01M8 12h.01M8 19h.01M16 5h.01M16 12h.01M16 19h.01" /></Glyph>,
  settings: <Glyph><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Glyph>,
  eye: <Glyph><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Glyph>,
  remove: <Glyph><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></Glyph>,
} as const;
