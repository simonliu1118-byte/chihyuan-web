import type { StatusTone } from "../../runtime/modules/status-flow";

/** One line under a record header saying what its status is waiting for; finished states read as a plain note. */
export function NextStep({ tone, children }: { tone: StatusTone; children: string }) {
  const finished = tone === "success" || tone === "danger";
  return <p className={finished ? "cy-next-step finished" : "cy-next-step"}>{finished ? null : <strong>下一步</strong>}{children}</p>;
}
