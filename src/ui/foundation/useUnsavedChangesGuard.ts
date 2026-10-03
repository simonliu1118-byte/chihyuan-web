import { createContext, createElement, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, type PropsWithChildren } from "react";
import { useConfirmation } from "../overlays/useConfirmation";

export interface UnsavedChangesGuardOptions {
  active: boolean;
  message?: string;
  blocked?: boolean;
}

export interface NavigationDecision {
  allowed: boolean;
  reason: "clean" | "confirmed" | "cancelled";
}

const DEFAULT_MESSAGE = "尚有未儲存的變更，確定要離開嗎？";
type GuardState = Required<UnsavedChangesGuardOptions>;
const NavigationGuardContext = createContext<{
  guards: Map<symbol, GuardState>;
  canLeave: () => Promise<boolean>;
  cancel: () => void;
} | null>(null);

/** One shared decision for every registered editor in the active module. */
export function UnsavedChangesBoundary({ children }: PropsWithChildren) {
  const guards = useRef(new Map<symbol, GuardState>()).current;
  const { confirm, confirmationDialog, cancel } = useConfirmation();
  const canLeave = useCallback(async () => {
    const states = [...guards.values()];
    if (states.some(state => state.blocked)) {
      await confirm({ title: "操作處理中", description: "請等待目前操作完成後再切換頁面。", confirmLabel: "知道了" });
      return false;
    }
    const dirty = states.find(state => state.active);
    if (!dirty) return true;
    const accepted = await confirm({ title: "切換模組？", description: "切換模組會放棄目前尚未儲存的內容。你也可以留在目前模組繼續編輯。",
      confirmLabel: "確定切換", cancelLabel: "放棄切換，繼續編輯", confirmTone: "danger" });
    return accepted && ![...guards.values()].some(state => state.blocked);
  }, [guards, confirm]);
  const value = useMemo(() => ({ guards, canLeave, cancel }), [guards, canLeave, cancel]);
  return createElement(NavigationGuardContext.Provider, { value }, createElement(Fragment, null, children, confirmationDialog));
}

export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext);
  if (!context) throw new Error("Navigation guard requires UnsavedChangesBoundary");
  return context;
}

export function useUnsavedChangesGuard({
  active,
  message = DEFAULT_MESSAGE,
  blocked = false,
}: UnsavedChangesGuardOptions) {
  const context = useContext(NavigationGuardContext);
  const key = useRef(Symbol("unsaved-editor")).current;
  useLayoutEffect(() => {
    if (!context) return;
    context.guards.set(key, { active, blocked, message });
    return () => { context.guards.delete(key); };
  }, [context, key, active, blocked, message]);
  useEffect(() => {
    if (!active && !blocked) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active, blocked]);

  const confirmNavigation = useCallback(
    (
      confirm: (message: string) => boolean = (prompt) => window.confirm(prompt),
    ): NavigationDecision => {
      if (!active) return { allowed: true, reason: "clean" };
      const allowed = confirm(message);
      return { allowed, reason: allowed ? "confirmed" : "cancelled" };
    },
    [active, message],
  );

  const confirmNavigationAsync = useCallback(async (confirm: (message: string) => Promise<boolean>): Promise<NavigationDecision> => {
    if (!active) return { allowed: true, reason: "clean" };
    const allowed = await confirm(message);
    return { allowed, reason: allowed ? "confirmed" : "cancelled" };
  }, [active, message]);

  return { confirmNavigation, confirmNavigationAsync };
}
