import type { ReactNode } from "react";

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** "table": the small borderless size used inside data rows (26px, 36px on phones). */
  variant?: "default" | "table";
  /** "danger": neutral until hovered, then the danger colour (cancel, remove). */
  tone?: "default" | "danger";
  expanded?: boolean;
  controls?: string;
}

/** Square icon-only action with the same sizing tokens as other compact buttons. */
export function IconButton({ icon, label, onClick, disabled = false, variant = "default", tone = "default", expanded, controls }: IconButtonProps) {
  return <button type="button"
    className={"cy-op-button compact cy-icon-button" + (variant === "table" ? " cy-icon-button-table" : "") + (tone === "danger" ? " cy-icon-button-danger" : "")}
    title={label} aria-label={label} aria-expanded={expanded} aria-controls={controls} disabled={disabled} onClick={onClick}>
    <span aria-hidden="true">{icon}</span>
  </button>;
}
