import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The shell's page-title row; modules place their primary action there. */
export const PageActionsTargetContext = createContext<HTMLElement | null>(null);

/** Render a module's primary action beside the page title without changing its behaviour. */
export function PagePrimaryActions({ children }: { children: ReactNode }) {
  const target = useContext(PageActionsTargetContext);
  return target ? createPortal(<div className="cy-op-page-actions">{children}</div>, target) : null;
}
