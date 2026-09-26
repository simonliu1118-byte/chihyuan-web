import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from "react";

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
  children,
}: PropsWithChildren<DialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={[
        "cy-dialog",
        `cy-dialog-${presentation}`,
        `cy-dialog-${size}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
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
        <header className="cy-dialog-header">
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
        </header>

        <div className="cy-dialog-body">{children}</div>
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
