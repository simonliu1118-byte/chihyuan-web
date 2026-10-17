import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Render existing module action in the shared module heading without changing its behavior. */
export function PagePrimaryActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById("cy-page-primary-actions"));
  }, []);
  return target ? createPortal(<div className="cy-op-page-actions">{children}</div>, target) : null;
}
