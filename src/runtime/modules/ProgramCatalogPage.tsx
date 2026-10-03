import { useEffect, useState } from "react";
import type { ProgramCatalog, ProgramEntry } from "../../../shared/program-catalog";
import { apiRequest } from "../../api/client";
import { DataView } from "../../ui/data/DataView";
import { Section } from "../../ui/primitives/Section";
import accountingIcon from "../../assets/cy-apps/ACC.svg";
import invoiceIcon from "../../assets/cy-apps/INV.svg";
import calculatorIcon from "../../assets/cy-apps/CAL.svg";
import converterIcon from "../../assets/cy-apps/CVT.svg";
import envelopeIcon from "../../assets/cy-apps/ENV.svg";
import watermarkIcon from "../../assets/cy-apps/WM.svg";
import "./program-catalog.css";

const icons = { ACC: accountingIcon, INV: invoiceIcon, CAL: calculatorIcon, CVT: converterIcon, ENV: envelopeIcon, WM: watermarkIcon };
function version(program: ProgramEntry) { return <strong>{program.version ? "V" + program.version : "尚未發版"}</strong>; }
function published(program: ProgramEntry) {
  return program.publishedAt ? <time dateTime={program.publishedAt}>{date(program.publishedAt)}</time> : <span>—</span>;
}
function date(value: string): string {
  return new Date(value).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
}
function name(program: ProgramEntry) {
  return <div className="cy-program-name"><img src={icons[program.icon]} width="56" height="56" alt="" />
    <div><strong>{program.name}</strong><span>{program.platform === "web" ? "網頁版" : "Windows 10／11 · x64"}</span></div></div>;
}
function links(program: ProgramEntry) {
  if (!program.version) return <span>正式發版後提供下載</span>;
  return <div className="cy-program-links">
    {program.websiteUrl ? <a className="cy-op-button is-primary" href={program.websiteUrl} target="_blank" rel="noopener noreferrer">開啟網站</a>
      : program.downloadUrl ? <a className="cy-op-button is-primary" href={program.downloadUrl} target="_blank" rel="noopener noreferrer">下載程式</a>
      : <span>尚無可下載檔案</span>}
  </div>;
}
export function ProgramCatalogView({ catalog }: { catalog: ProgramCatalog }) {
  return <>
    {!catalog.current ? <div className="cy-notice cy-notice-warning" role="status">版本資料暫時無法更新，目前顯示上次確認的正式版本。</div> : null}
    <DataView ariaLabel="CY 程式清單" items={catalog.programs} getKey={program => program.id}
      columns={[{ key: "name", header: "程式", render: name },
        { key: "version", header: catalog.current ? "最新正式版本" : "已確認正式版本", render: version },
        { key: "date", header: "發版日", render: published },
        { key: "description", header: "功能簡介", render: program => <p className="cy-program-description">{program.description}</p> },
        { key: "links", header: "使用／下載", render: links }]}
      renderCard={program => <>{name(program)}<div className="cy-program-meta">{version(program)}
        <span>發版日 {published(program)}</span></div>
        <p className="cy-program-description">{program.description}</p>{links(program)}</>}
      emptyTitle="尚無程式" />
    <p className="cy-program-checked">版本確認：{date(catalog.checkedAt)}。桌面版下載後解壓縮即可使用；網頁版開啟後依各程式登入規則操作。</p>
  </>;
}
export function ProgramCatalogPage() {
  const [catalog, setCatalog] = useState<ProgramCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError("");
    void apiRequest<ProgramCatalog>("/api/programs", { signal: abort.signal }).then(value => {
      if (!abort.signal.aborted) {
        setCatalog(value);
        if (value.refreshFailure) console.warn("CYWEB_PROGRAM_REFRESH", value.refreshFailure.code, value.refreshFailure.httpStatus ?? "");
      }
    }).catch(() => {
      if (!abort.signal.aborted) setError("無法讀取程式清單，請稍後重試。");
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [refresh]);
  return <Section title="CY 程式" description="CY 程式功能、正式版本與使用入口；開發中的程式先提供功能介紹。"
    actions={<button type="button" className="cy-op-button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? "讀取中…" : "更新版本"}</button>}
    className="cy-program-catalog">
    {loading && !catalog ? <p role="status">正在讀取程式清單…</p> : null}
    {error ? <div className="cy-notice cy-notice-danger" role="alert">{error}</div> : null}
    {catalog ? <ProgramCatalogView catalog={catalog} /> : null}
  </Section>;
}
