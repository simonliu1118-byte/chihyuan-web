import "./status-name.css";

/** A customer status with its light (user 2026-11-03, as on the legacy sheet). */
export function StatusName({ status }: { status?: { name: string; light?: string } | null }) {
  if (!status) return null;
  const light = (status.light ?? "GREEN").toLowerCase();
  return <span className="cy-status-light-name">
    <span className={"cy-status-light " + light} aria-hidden="true">{light === "closed" ? "✕" : null}</span>{status.name}
  </span>;
}
