import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiClientError } from "../../api/client";
import {
  BOT_LIMITS, BOT_REVIEW_LABELS, BOT_STATUS_LABELS, type BotCenterState, type BotReviewStatus, type BotStatus,
} from "../../../shared/bot-center";
import { createBot, issueBotCredential, loadBotCenter, reviewDraft, revokeBotCredential } from "../api/bot-center-client";
import { ExpandToggle } from "../../ui/data/ExpandToggle";
import { StatusFilter } from "../../ui/data/StatusFilter";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { formatDateTime } from "../../ui/foundation/format";
import { Field, FormSection } from "../../ui/forms/Field";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useFormPrompt } from "../../ui/overlays/useFormPrompt";
import { StatusChip } from "../../ui/primitives/StatusChip";
import "./bot-center.css";

const STATUS_TONE: Record<BotStatus, "neutral" | "info" | "warning" | "success"> = {
  idle: "neutral", working: "info", blocked: "warning", done: "success",
};
const REVIEW_TONE: Record<BotReviewStatus, "warning" | "success" | "danger"> = {
  pending: "warning", approved: "success", rejected: "danger",
};

function messageOf(error: unknown): string {
  return error instanceof ApiClientError ? error.message || error.code : "BOT 管理中心暫時無法使用";
}

export function BotCenterPage() {
  const [state, setState] = useState<BotCenterState | null>(null);
  const [draftStatus, setDraftStatus] = useState<BotReviewStatus | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openDraft, setOpenDraft] = useState<number | null>(null);
  const [openReport, setOpenReport] = useState<number | null>(null);
  const [openCompletion, setOpenCompletion] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage, reportError, tone] = useFeedbackMessage<string | null>(null);
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();

  const refresh = useCallback(async (status: BotReviewStatus | "all") => {
    const next = await loadBotCenter(status);
    setState(next);
    setDraftStatus(next.draftStatus);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void refresh("pending").catch(error => { if (active) reportError(messageOf(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh, reportError]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch (error) { reportError(messageOf(error)); } finally { setBusy(false); }
  }
  async function decide(id: number, decision: "approved" | "rejected") {
    const values = await ask({
      title: decision === "approved" ? "通過審稿" : "退回審稿",
      fields: [{ name: "reason", label: "理由", multiline: true }],
      confirmLabel: decision === "approved" ? "通過" : "退回",
      confirmTone: decision === "rejected" ? "danger" : "primary",
    });
    if (!values) return;
    await run(async () => {
      await reviewDraft(id, decision, values.reason);
      await refresh(draftStatus);
      setMessage(decision === "approved" ? "已通過，結果已供原 BOT 讀取" : "已退回，結果已供原 BOT 讀取");
    });
  }
  async function addBot(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createBot(code, label);
      setCode(""); setLabel("");
      await refresh(draftStatus);
      setMessage("已新增 BOT");
    });
  }
  async function issue() {
    if (!(await confirm({
      title: state?.credential.configured ? "輪換連線憑證" : "產生連線憑證",
      description: state?.credential.configured ? "舊憑證會立即失效。" : "憑證只在產生時顯示一次。",
      confirmLabel: state?.credential.configured ? "輪換" : "產生",
      confirmTone: state?.credential.configured ? "danger" : "primary",
    }))) return;
    await run(async () => {
      const issued = await issueBotCredential();
      setToken(issued.token);
      await refresh(draftStatus);
    });
  }
  async function revoke() {
    if (!(await confirm({ title: "撤銷連線憑證", description: "撤銷後，BOT 將無法送出回報或讀取審稿結果。", confirmLabel: "撤銷", confirmTone: "danger" }))) return;
    await run(async () => {
      await revokeBotCredential();
      await refresh(draftStatus);
      setMessage("已撤銷連線憑證");
    });
  }

  if (loading && !state) return <Loading />;
  if (!state) return <section className="cy-op-panel"><h2>BOT 管理中心</h2><p>{message ?? "目前無法載入。"}</p></section>;

  return <div className="cy-bot-center">
    <FeedbackBanner message={message} tone={tone} />
    {confirmationDialog}{promptDialog}
    {token ? <Dialog open size="small" title="連線憑證（只顯示這一次）" showCloseButton={false} onClose={() => setToken(null)}
      footer={<div className="cy-dialog-action-row">
        <button type="button" className="cy-op-button" onClick={() => void navigator.clipboard?.writeText(token)}>複製</button>
        <button type="button" className="cy-op-button primary" onClick={() => setToken(null)}>關閉</button>
      </div>}>
      <form onKeyDown={enterAdvancesFields} onSubmit={event => { event.preventDefault(); setToken(null); }}>
        <FormSection><Field label="憑證" size="l"><input className="cy-op-input" readOnly value={token} /></Field></FormSection>
      </form>
    </Dialog> : null}

    <section className="cy-op-panel" aria-label="各 BOT 進度狀態">
      <div className="cy-op-panel-header">
        <h2>各 BOT 進度狀態</h2>
        <div>
          <StatusChip tone={state.credential.configured ? "success" : "neutral"}>{state.credential.configured ? "連線憑證已設定" : "尚未設定連線憑證"}</StatusChip>
          <button type="button" className="cy-op-button compact" disabled={busy} onClick={() => void issue()}>{state.credential.configured ? "輪換憑證" : "產生憑證"}</button>
          {state.credential.configured ? <button type="button" className="cy-op-button compact danger" disabled={busy} onClick={() => void revoke()}>撤銷憑證</button> : null}
        </div>
      </div>
      <div className="cy-op-table-wrap"><table className="cy-op-table">
        <colgroup><col style={{ width: "4em" }} /><col style={{ width: "8em" }} /><col style={{ width: "6em" }} /><col /><col style={{ width: "12em" }} /></colgroup>
        <thead><tr><th className="is-center">項次</th><th>BOT</th><th className="is-center">狀態</th><th>進度</th><th className="is-center">更新時間</th></tr></thead>
        <tbody>{state.bots.map((bot, index) => <tr key={bot.id}>
          <td className="is-center">{index + 1}</td>
          <td>{bot.label}</td>
          <td className="is-center"><StatusChip tone={STATUS_TONE[bot.status]}>{BOT_STATUS_LABELS[bot.status]}</StatusChip></td>
          <td>{bot.summary || "—"}</td>
          <td className="is-center">{formatDateTime(bot.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>
      <form className="cy-op-subsection" onKeyDown={enterAdvancesFields} onSubmit={event => void addBot(event)}>
        <h3>新增 BOT</h3>
        <FormSection>
          <Field label="代碼" size="s" required><input className="cy-op-input" required maxLength={BOT_LIMITS.code} value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, BOT_LIMITS.code))} /></Field>
          <Field label="名稱" size="m" required><input className="cy-op-input" required maxLength={BOT_LIMITS.label} value={label} onChange={event => setLabel(event.target.value)} /></Field>
        </FormSection>
        <div className="cy-op-form-footer"><button type="submit" className="cy-op-button primary" disabled={busy}>新增</button></div>
      </form>
    </section>

    <section className="cy-op-panel" aria-label="待審稿">
      <div className="cy-op-panel-header"><h2>待審稿</h2></div>
      <StatusFilter label="審稿狀態" value={draftStatus === "all" ? "" : draftStatus} counts={state.draftCounts}
        options={(["pending", "approved", "rejected"] as const).map(status => ({ code: status, label: BOT_REVIEW_LABELS[status], tone: REVIEW_TONE[status] }))}
        onChange={status => { const next = (status || "all") as BotReviewStatus | "all"; setDraftStatus(next); void run(() => refresh(next)); }} />
      <div className="cy-op-table-wrap"><table className="cy-op-table">
        <colgroup><col style={{ width: "4em" }} /><col style={{ width: "12em" }} /><col style={{ width: "8em" }} /><col /><col style={{ width: "6em" }} /><col style={{ width: "10em" }} /></colgroup>
        <thead><tr><th className="is-center">項次</th><th className="is-center">時間</th><th>BOT</th><th>標題</th><th className="is-center">狀態</th><th className="is-center">操作</th></tr></thead>
        <tbody>{state.drafts.length ? state.drafts.map((draft, index) => {
          const open = openDraft === draft.id;
          return <Fragment key={draft.id}>
            <tr>
              <td className="is-center"><ExpandToggle expanded={open} label={draft.title} onToggle={() => setOpenDraft(open ? null : draft.id)} />{index + 1}</td>
              <td className="is-center">{formatDateTime(draft.createdAt)}</td>
              <td>{draft.botLabel}</td>
              <td>{draft.title}</td>
              <td className="is-center"><StatusChip tone={REVIEW_TONE[draft.status]}>{BOT_REVIEW_LABELS[draft.status]}</StatusChip></td>
              <td className="is-center">{draft.status === "pending" ? <div className="cy-bot-actions">
                <button type="button" className="cy-op-button compact primary" disabled={busy} onClick={() => void decide(draft.id, "approved")}>通過</button>
                <button type="button" className="cy-op-button compact danger" disabled={busy} onClick={() => void decide(draft.id, "rejected")}>退回</button>
              </div> : "—"}</td>
            </tr>
            {open ? <tr><td colSpan={6} className="cy-bot-text">{draft.body}{draft.reason ? `\n理由：${draft.reason}` : ""}{draft.reviewer ? `\n審核：${draft.reviewer.displayName || draft.reviewer.employeeNo || "使用者"} ${formatDateTime(draft.reviewedAt)}` : ""}</td></tr> : null}
          </Fragment>;
        }) : <tr><td colSpan={6}>尚無審稿</td></tr>}</tbody>
      </table></div>
    </section>

    <section className="cy-op-panel" aria-label="回報">
      <div className="cy-op-panel-header"><h2>回報</h2></div>
      <div className="cy-op-table-wrap"><table className="cy-op-table">
        <colgroup><col style={{ width: "4em" }} /><col style={{ width: "12em" }} /><col style={{ width: "8em" }} /><col /></colgroup>
        <thead><tr><th className="is-center">項次</th><th className="is-center">時間</th><th>BOT</th><th>標題</th></tr></thead>
        <tbody>{state.reports.length ? state.reports.map((report, index) => {
          const open = openReport === report.id;
          return <Fragment key={report.id}>
            <tr>
              <td className="is-center"><ExpandToggle expanded={open} label={report.title} onToggle={() => setOpenReport(open ? null : report.id)} />{index + 1}</td>
              <td className="is-center">{formatDateTime(report.reportedAt)}</td>
              <td>{report.botLabel}</td>
              <td>{report.title}</td>
            </tr>
            {open ? <tr><td colSpan={4} className="cy-bot-text">{report.body}</td></tr> : null}
          </Fragment>;
        }) : <tr><td colSpan={4}>尚無回報</td></tr>}</tbody>
      </table></div>
    </section>

    <section className="cy-op-panel" aria-label="今日完成時間軸">
      <div className="cy-op-panel-header"><h2>今日完成時間軸</h2><StatusChip>{state.timelineDate.replaceAll("-", "/")}</StatusChip></div>
      <div className="cy-op-table-wrap"><table className="cy-op-table">
        <colgroup><col style={{ width: "8em" }} /><col style={{ width: "8em" }} /><col /></colgroup>
        <thead><tr><th className="is-center">時間</th><th>BOT</th><th>完成項目</th></tr></thead>
        <tbody>{state.timeline.length ? state.timeline.map(item => {
          const open = openCompletion === item.id;
          return <Fragment key={item.id}>
            <tr>
              <td className="is-center">{formatDateTime(item.completedAt).slice(11)}</td>
              <td>{item.botLabel}</td>
              <td>{item.detail ? <ExpandToggle expanded={open} label={item.title} onToggle={() => setOpenCompletion(open ? null : item.id)} /> : null}{item.title}</td>
            </tr>
            {open ? <tr><td colSpan={3} className="cy-bot-text">{item.detail}</td></tr> : null}
          </Fragment>;
        }) : <tr><td colSpan={3}>今天還沒有完成項目</td></tr>}</tbody>
      </table></div>
    </section>
  </div>;
}
