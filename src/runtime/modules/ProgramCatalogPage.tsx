import { formatDate } from "../../ui/foundation/format";
import { Loading } from "../../ui/feedback/Loading";
import { useFeedback } from "../../ui/feedback/FeedbackProvider";
import { useEffect, useState } from "react";
import type { ProgramCatalog, ProgramEntry } from "../../../shared/program-catalog";
import { getProgramAction, nextProgramCatalogUpdate } from "../../../shared/program-catalog";
import { apiRequest } from "../../api/client";
import { DataView } from "../../ui/data/DataView";
import { Section } from "../../ui/primitives/Section";
import accountingIcon from "../../assets/cy-apps/ACC.svg";
import invoiceIcon from "../../assets/cy-apps/INV.svg";
import calculatorIcon from "../../assets/cy-apps/CAL.svg";
import converterIcon from "../../assets/cy-apps/CVT.svg";
import autoInputIcon from "../../assets/cy-apps/Auto.svg";
import autoQueryIcon from "../../assets/cy-apps/AutoQ.svg";
import envelopeIcon from "../../assets/cy-apps/ENV.svg";
import watermarkIcon from "../../assets/cy-apps/WM.svg";
import "./program-catalog.css";

const icons = { ACC: accountingIcon, INV: invoiceIcon, CAL: calculatorIcon, CVT: converterIcon, Auto: autoInputIcon, AutoQ: autoQueryIcon, ENV: envelopeIcon, WM: watermarkIcon };
function version(program: ProgramEntry) { return <strong>{program.version ? "V" + program.version : "尚未發版"}</strong>; }
function published(program: ProgramEntry) {
  return program.publishedAt ? <time dateTime={program.publishedAt}>{date(program.publishedAt)}</time> : <span>—</span>;
}
function date(value: string): string {
  return formatDate(value);
}
function name(program: ProgramEntry) {
  return <div className="cy-program-name">{program.icon ? <img src={icons[program.icon]} width="56" height="56" alt="" />
    : <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><rect x="1" y="1" width="54" height="54" rx="10" fill="var(--cy-surface-muted, #edf2f0)" />
      <g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="28" cy="28" r="14" /><ellipse cx="28" cy="28" rx="6" ry="14" /><path d="M14 28h28M17 20h22M17 36h22" /></g></svg>}
    <div><strong>{program.name}</strong><span>{program.platform === "web" ? "網頁版" : "Windows 10／11 · x64"}</span></div></div>;
}
function links(program: ProgramEntry) {
  const action = getProgramAction(program);
  if (action.kind === "pending") return <span>正式發版後提供下載</span>;
  if (action.kind === "unavailable") return <span>尚無可下載檔案</span>;
  return <div className="cy-program-links">
    <a className="cy-op-button is-primary" href={action.url} target="_blank" rel="noopener noreferrer">{action.kind === "website" ? "開啟網站" : "下載程式"}</a>
  </div>;
}
export function ProgramCatalogView({ catalog }: { catalog: ProgramCatalog }) {
  return <>
    {!catalog.current ? <div className="cy-notice cy-notice-warning" role="status">{catalog.automaticUpdate?.status === "pending"
      ? "版本清單將於每日排程自動確認，目前顯示已確認的正式版本。"
      : "本次自動更新尚未成功，目前顯示上次確認的正式版本，系統將於下次排程再確認。"}</div> : null}
    <DataView ariaLabel="CY 程式清單" items={catalog.programs} getKey={program => program.id}
      columns={[{ key: "name", header: "程式", render: name },
        { key: "version", header: "已確認正式版本", render: version },
        { key: "date", header: "發版日", render: published },
        { key: "description", header: "功能簡介", render: program => <p className="cy-program-description">{program.description}</p> },
        { key: "links", header: "使用／下載", render: links }]}
      renderCard={program => <>{name(program)}<div className="cy-program-meta">{version(program)}
        <span>發版日 {published(program)}</span></div>
        <p className="cy-program-description">{program.description}</p>{links(program)}</>}
      emptyTitle="尚無程式" />
    <p className="cy-program-checked">每日台灣時間凌晨 3 點自動確認版本；最近確認：{date(catalog.checkedAt)}。桌面版下載後解壓縮即可使用；網頁版開啟後依各程式登入規則操作。</p>
  </>;
}
export function programRefreshMessage(failure: ProgramCatalog["refreshFailure"]): string {
  const retained = "已保留上次確認的正式版本與下載入口，系統將於下次每日排程再確認。";
  if (failure?.code === "RATE_LIMIT") return "GitHub 版本查詢暫時達到次數限制。" + retained;
  if (failure?.code === "NETWORK" || failure?.code === "TIMEOUT") return "目前無法連線至版本來源。" + retained;
  if (failure?.code === "HTTP" && failure.httpStatus === 403) return "GitHub 目前拒絕版本查詢。" + retained;
  return "目前無法取得完整的正式版本資料。" + retained;
}
export function ProgramCatalogPage() {
  const [catalog, setCatalog] = useState<ProgramCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const notify = useFeedback();
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      let nextUpdateAt = nextProgramCatalogUpdate(Date.now());
      setLoading(true);
      try {
        const value = await apiRequest<ProgramCatalog>("/api/programs", { signal: abort.signal });
        if (!abort.signal.aborted) {
          setCatalog(value);
          if (value.automaticUpdate?.nextUpdateAt && Number.isFinite(Date.parse(value.automaticUpdate.nextUpdateAt))) nextUpdateAt = value.automaticUpdate.nextUpdateAt;
          if (value.refreshFailure) notify(programRefreshMessage(value.refreshFailure), "版本更新提醒");
        }
      } catch {
        if (!abort.signal.aborted) notify("無法讀取程式清單，請稍後重新開啟此頁。", "版本更新提醒");
      } finally {
        if (!abort.signal.aborted) {
          setLoading(false);
          // Read the shared result once after the next scheduled update; never query GitHub here.
          timer = setTimeout(() => void load(), Math.max(60000, Date.parse(nextUpdateAt) + 60000 - Date.now()));
        }
      }
    }
    void load();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [notify]);
  return <Section className="cy-program-catalog">
    {loading && !catalog ? <Loading /> : null}
    {!loading && !catalog ? <p role="status">目前無法讀取程式清單，請稍後重新開啟此頁。</p> : null}
    {catalog ? <ProgramCatalogView catalog={catalog} /> : null}
  </Section>;
}
