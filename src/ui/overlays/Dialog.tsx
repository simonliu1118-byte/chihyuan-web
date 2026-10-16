import { useLayoutEffect, useId, useRef, type PropsWithChildren, type ReactNode, type CSSProperties } from "react";

export type DialogPresentation = "modal" | "drawer" | "sheet";
export type DialogSize = "small" | "medium" | "large";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  dismissible?: boolean;
  presentation?: DialogPresentation;
  size?: DialogSize;
  closeLabel?: string;
  className?: string;
  hideHeader?: boolean;
  style?: CSSProperties;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  dismissible = true,
  presentation = "modal",
  size = "medium",
  closeLabel = "關閉",
  className = "",
  hideHeader = false,
  style,
  children,
}: PropsWithChildren<DialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreFocus = () => {
      const target = returnFocusRef.current;
      if (target?.isConnected && target !== document.body && !target.matches(":disabled")) {
        target.focus();
        return;
      }
      // A busy submit control can lose focus before an asynchronous error opens.
      // Return to the containing form rather than the inert page behind its modal.
      const parent = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
      const fallback = parent?.querySelector<HTMLElement>("input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")
        ?? parent?.querySelector<HTMLElement>("button:not(:disabled)");
      fallback?.focus();
    };

    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
      restoreFocus();
    }
    return () => {
      if (!dialog.open) return;
      dialog.close();
      restoreFocus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={[
        "cy-dialog",
        `cy-dialog-${presentation}`,
        `cy-dialog-${size}`,
        className,
        hideHeader ? "cy-dialog-plain" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
      style={style}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        if (!dismissible) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (!dismissible || event.target !== event.currentTarget) return;
        onClose();
      }}
    >
      <div className="cy-dialog-surface">
        {hideHeader ? <>
          <h2 id={titleId} className="cy-visually-hidden">{title}</h2>
          {dismissible ? <button type="button" className="cy-dialog-close cy-dialog-floating-close" onClick={onClose} aria-label={closeLabel}>×</button> : null}
        </> : <header className="cy-dialog-header">
          <div className="cy-dialog-heading">
            <h2 className="cy-dialog-title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <div className="cy-dialog-description" id={descriptionId}>
                {description}
              </div>
            ) : null}
          </div>
          {dismissible ? (
            <button className="cy-dialog-close" type="button" onClick={onClose} aria-label={closeLabel}>
              ×
            </button>
          ) : null}
        </header>}

        {children != null && children !== false ? <div className="cy-dialog-body">{children}</div> : null}
        {footer ? <footer className="cy-dialog-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

export type DrawerProps = Omit<DialogProps, "presentation">;

export function Drawer(props: PropsWithChildren<DrawerProps>) {
  return <Dialog {...props} presentation="drawer" />;
}

export type BottomSheetProps = Omit<DialogProps, "presentation">;

export function BottomSheet(props: PropsWithChildren<BottomSheetProps>) {
  return <Dialog {...props} presentation="sheet" />;
}
