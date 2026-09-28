import { FormEvent, useMemo, useState } from "react";
import type { LocalDefect } from "../advanced-local-types";
import {
  dateToday,
  mutateLocalDatabase,
  nextLocalId,
  timestampNow,
  useLocalDatabase,
} from "../local-database";
import "./defect-operational.css";

interface DefectDraft {
  reportedDate: string;
  customerId: number | null;
  itemId: number | null;
  ownerName: string;
  defectDescription: string;
}

const statusText: Record<LocalDefect["status"], string> = {
  created: "已建檔",
  processing: "處理中",
  resolved: "已處理",
};

function newDraft(database: ReturnType<typeof useLocalDatabase>): DefectDraft {
  return {
    reportedDate: dateToday(),
    customerId: database.customers.find((row) => row.isActive)?.id ?? null,
    itemId: database.items.find((row) => row.isActive)?.id ?? null,
    ownerName: "本機測試使用者",
    defectDescription: "",
  };
}

export function DefectOperationalPage() {
  const database = useLocalDatabase();
  const defects = database.defects ?? [];
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(defects.find((row) => !row.invalidatedAt)?.id ?? defects[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DefectDraft | null>(null);

  const selected = defects.find((row) => row.id === selectedId) ?? null;
  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return defects.filter((row) => {
      if (!includeInvalid && row.invalidatedAt) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (!keyword) return true;
      return [row.ref, row.customerNameSnapshot, row.itemNoSnapshot, row.itemNameSnapshot, row.defectDescription, row.ownerName]
        .some((value) => value.toLowerCase().includes(keyword));
    });
  }, [defects, includeInvalid, statusFilter, query]);

  function startCreate() {
    setSelectedId(null);
    setCreating(true);
    setEditing(true);
    setDraft(newDraft(database));
  }

  function startEdit() {
    if (!selected || selected.status !== "created" || selected.invalidatedAt) return;
    setCreating(false);
    setEditing(true);
    setDraft({
      reportedDate: selected.reportedDate,
      customerId: selected.customerId,
      itemId: selected.itemId,
      ownerName: selected.ownerName,
      defectDescription: selected.defectDescription,
    });
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
    if (selectedId == null) setSelectedId(rows[0]?.id ?? null);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.customerId || !draft.itemId || !draft.reportedDate || !draft.ownerName.trim() || !draft.defectDescription.trim()) return;
    const customer = database.customers.find((row) => row.id === draft.customerId);
    const item = database.items.find((row) => row.id === draft.itemId);
    if (!customer || !item) return;
    let savedId = selected?.id ?? 0;
    mutateLocalDatabase(creating ? "defect.created" : "defect.updated", `${creating ? "新增" : "修改"}瑕疵：${customer.name} / ${item.itemNo}`, (db) => {
      db.defects ??= [];
      if (creating) {
        savedId = nextLocalId(db);
        db.defects.unshift({
          id: savedId,
          ref: `DF-LOCAL-${String(savedId).padStart(4, "0")}`,
          reportedDate: draft.reportedDate,
          customerId: customer.id,
          customerNameSnapshot: customer.name,
          itemId: item.id,
          itemNoSnapshot: item.itemNo,
          itemNameSnapshot: item.name,
          ownerName: draft.ownerName.trim(),
          defectDescription: draft.defectDescription.trim(),
          handlingNote: null,
          handledAt: null,
          status: "created",
          invalidatedAt: null,
          invalidatedReason: null,
          revision: 1,
          createdAt: timestampNow(),
          updatedAt: timestampNow(),
        });
      } else if (selected) {
        const row = db.defects.find((record) => record.id === selected.id);
        if (!row || row.status !== "created" || row.invalidatedAt) return;
        Object.assign(row, {
          reportedDate: draft.reportedDate,
          customerId: customer.id,
          customerNameSnapshot: customer.name,
          itemId: item.id,
          itemNoSnapshot: item.itemNo,
          itemNameSnapshot: item.name,
          ownerName: draft.ownerName.trim(),
          defectDescription: draft.defectDescription.trim(),
          revision: row.revision + 1,
          updatedAt: timestampNow(),
        });
      }
    });
    setSelectedId(savedId || selectedId);
    setEditing(false);
    setCreating(false);
    setDraft(null);
  }

  function startProcessing() {
    if (!selected || selected.status !== "created" || selected.invalidatedAt) return;
    mutateLocalDatabase("defect.processing.started", `${selected.ref} 開始處理`, (db) => {
      const row = db.defects?.find((record) => record.id === selected.id);
      if (!row || row.status !== "created") return;
      row.status = "processing";
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function resolve() {
    if (!selected || selected.status !== "processing" || selected.invalidatedAt) return;
    const note = window.prompt("請輸入處理結果／備註", selected.handlingNote ?? "");
    if (note == null || !note.trim()) return;
    mutateLocalDatabase("defect.resolved", `${selected.ref} 完成處理`, (db) => {
      const row = db.defects?.find((record) => record.id === selected.id);
      if (!row || row.status !== "processing") return;
      row.status = "resolved";
      row.handlingNote = note.trim();
      row.handledAt = timestampNow();
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function reopen() {
    if (!selected || selected.status !== "resolved" || selected.invalidatedAt) return;
    const reason = window.prompt("重新開啟原因", "需要補充處理");
    if (reason == null) return;
    mutateLocalDatabase("defect.reopened", `${selected.ref} 重新開啟${reason.trim() ? `：${reason.trim()}` : ""}`, (db) => {
      const row = db.defects?.find((record) => record.id === selected.id);
      if (!row || row.status !== "resolved") return;
      row.status = "processing";
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function invalidate() {
    if (!selected || selected.status === "created" || selected.invalidatedAt) return;
    const reason = window.prompt("請輸入作廢原因", "整筆瑕疵資料建立錯誤");
    if (reason == null || !reason.trim()) return;
    if (!window.confirm("作廢後會保留紀錄與原工作狀態，不會硬刪。確定作廢？")) return;
    mutateLocalDatabase("defect.invalidated", `${selected.ref} 作廢：${reason.trim()}`, (db) => {
      const row = db.defects?.find((record) => record.id === selected.id);
      if (!row || row.status === "created") return;
      row.invalidatedAt = timestampNow();
      row.invalidatedReason = reason.trim();
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function deleteCreated() {
    if (!selected || selected.status !== "created" || selected.invalidatedAt) return;
    if (!window.confirm(`確定永久刪除尚未開始處理的 ${selected.ref}？`)) return;
    mutateLocalDatabase("defect.deleted", `刪除瑕疵：${selected.ref}`, (db) => {
      db.defects = (db.defects ?? []).filter((row) => row.id !== selected.id);
    });
    setSelectedId(defects.find((row) => row.id !== selected.id)?.id ?? null);
  }

  return (
    <div className="cy-defect-op">
      <div className="cy-op-page-header">
        <div><h1>瑕疵</h1><p>直接測瑕疵建檔、處理、完成、重新開啟、刪除與作廢；作廢是覆蓋旗標，不是第四個工作狀態。</p></div>
        <div className="cy-op-page-actions"><button className="cy-op-button primary" onClick={startCreate}>新增瑕疵</button></div>
      </div>
      <div className="cy-defect-workspace">
        <section className="cy-op-panel cy-defect-list-pane">
          <div className="cy-defect-search">
            <input className="cy-op-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋編號、客戶、商品、內容" />
            <div className="cy-defect-filters"><select className="cy-op-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">全部狀態</option><option value="created">已建檔</option><option value="processing">處理中</option><option value="resolved">已處理</option></select><label className="cy-defect-check"><input type="checkbox" checked={includeInvalid} onChange={(e) => setIncludeInvalid(e.target.checked)} /> 顯示作廢</label></div>
          </div>
          <div className="cy-op-list">{rows.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => { if (editing && !window.confirm("放棄尚未儲存的修改？")) return; setSelectedId(row.id); setEditing(false); setCreating(false); setDraft(null); }}><strong>{row.ref} · {row.customerNameSnapshot}</strong><span>{row.itemNoSnapshot} · {row.itemNameSnapshot}</span><small>{row.invalidatedAt ? `已作廢 · ${statusText[row.status]}` : statusText[row.status]}</small></button>)}{rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的瑕疵紀錄。</div> : null}</div>
        </section>

        <section className="cy-op-panel cy-defect-detail-pane">
          {editing && draft ? <form className="cy-op-form" onSubmit={save}><div className="cy-op-panel-header"><div><h2>{creating ? "新增瑕疵" : `修改 ${selected?.ref}`}</h2><p>只有尚未開始處理的紀錄可做一般修改。</p></div><div className="cy-defect-inline-actions"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div></div><div className="cy-defect-form-body"><div className="cy-op-form-grid"><label>回報日期<input className="cy-op-input" type="date" value={draft.reportedDate} onChange={(e) => setDraft({ ...draft, reportedDate: e.target.value })} /></label><label>客戶<select className="cy-op-input" value={draft.customerId ?? ""} onChange={(e) => setDraft({ ...draft, customerId: Number(e.target.value) || null })}>{database.customers.filter((row) => row.isActive || row.id === draft.customerId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>商品<select className="cy-op-input" value={draft.itemId ?? ""} onChange={(e) => setDraft({ ...draft, itemId: Number(e.target.value) || null })}>{database.items.filter((row) => row.isActive || row.id === draft.itemId).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}</option>)}</select></label><label>負責人<input className="cy-op-input" value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} /></label><label className="wide">瑕疵內容<textarea className="cy-op-input" rows={5} value={draft.defectDescription} onChange={(e) => setDraft({ ...draft, defectDescription: e.target.value })} required /></label></div></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div></form> : selected ? <div><div className="cy-op-panel-header cy-defect-detail-header"><div><h2>{selected.ref}</h2><p>{selected.customerNameSnapshot} · rev.{selected.revision}</p></div><div className="cy-defect-status-group"><span className={`cy-defect-status ${selected.status}`}>{statusText[selected.status]}</span>{selected.invalidatedAt ? <span className="cy-defect-status invalid">已作廢</span> : null}</div></div><div className="cy-defect-body"><div className="cy-op-detail-grid"><div><span>回報日期</span><strong>{selected.reportedDate}</strong></div><div><span>負責人</span><strong>{selected.ownerName}</strong></div><div><span>客戶</span><strong>{selected.customerNameSnapshot}</strong></div><div><span>商品</span><strong>{selected.itemNoSnapshot} · {selected.itemNameSnapshot}</strong></div><div className="wide"><span>瑕疵內容</span><strong>{selected.defectDescription}</strong></div><div className="wide"><span>處理結果</span><strong>{selected.handlingNote ?? "—"}</strong></div>{selected.invalidatedAt ? <div className="wide cy-defect-invalid-note"><span>作廢資訊</span><strong>{new Date(selected.invalidatedAt).toLocaleString()} · {selected.invalidatedReason}</strong></div> : null}</div><div className="cy-defect-action-bar">{!selected.invalidatedAt && selected.status === "created" ? <><button className="cy-op-button" onClick={startEdit}>修改</button><button className="cy-op-button primary" onClick={startProcessing}>開始處理</button><button className="cy-op-button danger" onClick={deleteCreated}>刪除</button></> : null}{!selected.invalidatedAt && selected.status === "processing" ? <><button className="cy-op-button primary" onClick={resolve}>完成處理</button><button className="cy-op-button danger" onClick={invalidate}>作廢</button></> : null}{!selected.invalidatedAt && selected.status === "resolved" ? <><button className="cy-op-button" onClick={reopen}>重新開啟</button><button className="cy-op-button danger" onClick={invalidate}>作廢</button></> : null}</div></div></div> : <div className="cy-op-empty">請選擇瑕疵紀錄，或新增一筆。</div>}
        </section>
      </div>
    </div>
  );
}
