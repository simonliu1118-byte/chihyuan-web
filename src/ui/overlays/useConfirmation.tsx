import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog";

type Confirmation = Pick<ConfirmDialogProps, "title" | "description" | "confirmLabel" | "cancelLabel" | "confirmTone">;

/** One pending decision per mounted screen; leaving it always cancels. */
export function useConfirmation() {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const finish = useCallback((accepted: boolean) => {
    const pending = resolve.current;
    resolve.current = null;
    setRequest(null);
    pending?.(accepted);
  }, []);
  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);
  const confirm = useCallback((next: Confirmation): Promise<boolean> => {
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>(done => { resolve.current = done; setRequest(next); });
  }, []);
  const cancel = useCallback(() => finish(false), [finish]);
  return { confirm, cancel, confirmationDialog: request ? <ConfirmDialog open {...request}
    onConfirm={() => finish(true)} onCancel={() => finish(false)} /> : null };
}
