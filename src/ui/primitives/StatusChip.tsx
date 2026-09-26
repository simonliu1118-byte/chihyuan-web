import type { PropsWithChildren } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusChipProps {
  tone?: StatusTone;
  className?: string;
}

export function StatusChip({
  children,
  tone = "neutral",
  className = "",
}: PropsWithChildren<StatusChipProps>) {
  return (
    <span className={["cy-status-chip", `cy-status-chip-${tone}`, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}
