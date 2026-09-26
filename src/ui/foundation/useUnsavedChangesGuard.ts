import { useCallback, useEffect } from "react";

export interface UnsavedChangesGuardOptions {
  active: boolean;
  message?: string;
}

export interface NavigationDecision {
  allowed: boolean;
  reason: "clean" | "confirmed" | "cancelled";
}

const DEFAULT_MESSAGE = "尚有未儲存的變更，確定要離開嗎？";

export function useUnsavedChangesGuard({
  active,
  message = DEFAULT_MESSAGE,
}: UnsavedChangesGuardOptions) {
  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);

  const confirmNavigation = useCallback(
    (confirm: (message: string) => boolean = window.confirm): NavigationDecision => {
      if (!active) return { allowed: true, reason: "clean" };
      const allowed = confirm(message);
      return { allowed, reason: allowed ? "confirmed" : "cancelled" };
    },
    [active, message],
  );

  return { confirmNavigation };
}
