import type { PropsWithChildren, ReactNode } from "react";

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Section({
  children,
  title,
  description,
  actions,
  className = "",
}: PropsWithChildren<SectionProps>) {
  return (
    <section className={["cy-section", className].filter(Boolean).join(" ")}>
      {title || description || actions ? (
        <header className="cy-section-header">
          <div className="cy-section-heading">
            {title ? <h2 className="cy-section-title">{title}</h2> : null}
            {description ? <p className="cy-section-description">{description}</p> : null}
          </div>
          {actions ? <div className="cy-section-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="cy-section-content">{children}</div>
    </section>
  );
}
