import type { PropsWithChildren, ReactNode } from "react";

type NoticeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}

export function Notice({
  children,
  tone = "neutral",
  title,
  className = "",
  role = "status",
}: PropsWithChildren<NoticeProps>) {
  return (
    <div
      className={["cy-notice", `cy-notice-${tone}`, className].filter(Boolean).join(" ")}
      role={role}
    >
      {title ? <div className="cy-notice-title">{title}</div> : null}
      <div className="cy-notice-body">{children}</div>
    </div>
  );
}
