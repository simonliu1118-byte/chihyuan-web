import type { ToastMessage } from "./useToastQueue";

export interface ToastRegionProps {
  toasts: readonly ToastMessage[];
  onDismiss: (id: string) => void;
  label?: string;
}

export function ToastRegion({
  toasts,
  onDismiss,
  label = "系統通知",
}: ToastRegionProps) {
  return (
    <div className="cy-toast-region" aria-label={label} aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={["cy-toast", `cy-toast-${toast.tone}`].join(" ")}
          role={toast.tone === "danger" ? "alert" : "status"}
        >
          <div className="cy-toast-content">
            {toast.title ? <div className="cy-toast-title">{toast.title}</div> : null}
            <div className="cy-toast-message">{toast.message}</div>
          </div>
          <button
            className="cy-toast-close"
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="關閉通知"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
