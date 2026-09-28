import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface ToastInput {
  title?: ReactNode;
  message: ReactNode;
  tone?: ToastTone;
  durationMs?: number | null;
}

export interface ToastMessage extends ToastInput {
  id: string;
  tone: ToastTone;
}

export function useToastQueue(defaultDurationMs = 4000) {
  const [toasts, setToasts] = useState<readonly ToastMessage[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer != null) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput): string => {
      const id = crypto.randomUUID();
      const durationMs = input.durationMs === undefined ? defaultDurationMs : input.durationMs;
      const toast: ToastMessage = {
        ...input,
        id,
        tone: input.tone ?? "neutral",
        durationMs,
      };

      setToasts((current) => [...current, toast]);

      if (durationMs != null && durationMs > 0) {
        const timer = window.setTimeout(() => dismissToast(id), durationMs);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [defaultDurationMs, dismissToast],
  );

  const clearToasts = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      window.clearTimeout(timer);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return {
    toasts,
    pushToast,
    dismissToast,
    clearToasts,
  };
}
