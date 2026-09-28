import { FormEvent, useMemo, useState } from "react";
import {
  dateToday,
  exportLocalDatabase,
  importLocalDatabase,
  mutateLocalDatabase,
  nextLocalId,
  resetLocalDatabase,
  timestampNow,
  type LocalBom,
  type LocalCustomer,
  type LocalDatabase,
  type LocalItem,
  type LocalOutsourcingOrder,
  type LocalSalesOrder,
  type LocalWorkLog,
  useLocalDatabase,
} from "./local-database";

export type OperationalRoute =
  | "customers"
  | "items"
  | "orders"
  | "outsourcing"
  | "worklogs"
  | "settings"
  | "audit";

interface PageProps {
  database: LocalDatabase;
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="cy-op-page-header">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="cy-op-page-actions">{action}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="cy-op-empty">{children}</div>;
}

function CustomerPage({ database }: PageProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(database.customers[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<LocalCustomer> | null>(null);

  const customers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return database.customers.filter((customer) =>
      !keyword || [customer.customerNo, customer.name, customer.shortName, customer.phone, customer.contact]
        .some((value) => value?.toLowerCase().includes(keyword)),
    );
  }, [database.customers, query]);
  const selected = database.customers.find((customer) => customer.id === selectedId) ?? null;

  function startCreate() {
    setDraft({
      customerNo: null,
      name: "",
      shortName: null,
      taxId: null,
      phone: null,
      contact: null,
      address: null,
      category: database.settings.customerCategories[0] ?? "其他",
      status: database.settings.customerStatuses[0] ?? "正常",
      note: null,
      isActive: true,
    });
    setEditing(true);
  }

  function startEdit() {
    if (!selected) return;
    setDraft({ ...selected });
    setEditing(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name?.trim()) return;
    let savedId = selected?.id ?? null;
    mutateLocalDatabase(
      selected ? "customer.updated" : "customer.created",
      `${selected ? "修改" : "新增"}客戶：${draft.name.trim()}`,
      (db) => {
        const duplicateNo = draft.customerNo?.trim()
          ? db.customers.some((row) => row.id !== selected?.id && row.customerNo === draft.customerNo?.trim())
          : false;
        if (duplicateNo) throw new Error("客戶編號已存在");
        if (selected) {
          const row = db.customers.find((customer) => customer.id === selected.id);
          if (!row) return;
          Object.assign(row, {
            customerNo: draft.customerNo?.trim() || null,
            name: draft.name!.trim(),
            shortName: draft.shortName?.trim() || null,
            taxId: draft.taxId?.trim() || null,
            phone: draft.phone?.trim() || null,
            contact: draft.contact?.trim() || null,
            address: draft.address?.trim() || null,
            category: draft.category || "其他",
            status: draft.status || "正常",
            note: draft.note?.trim() || null,
            isActive: draft.isActive !== false,
            revision: row.revision + 1,
            updatedAt: timestampNow(),
          });
        } else {
          savedId = nextLocalId(db);
          db.customers.unshift({
            id: savedId,
            customerNo: draft.customerNo?.trim() || null,
            name: draft.name!.trim(),
            shortName: draft.shortName?.trim() || null,
            taxId: draft.taxId?.trim() || null,
            phone: draft.phone?.trim() || null,
            contact: draft.contact?.trim() || null,
            address: draft.address?.trim() || null,
            category: draft.category || "其他",
            status: draft.status || "正常",
            note: draft.note?.trim() || null,
            isActive: draft.isActive !== false,
            revision: 1,
            updatedAt: timestampNow(),
          });
        }
      },
    );
    if (savedId) setSelectedId(savedId);
    setEditing(false);
    setDraft(null);
  }

  function toggleActive() {
    if (!selected) return;
    mutateLocalDatabase("customer.active.changed", `${selected.isActive ? "停用" : "啟用"}客戶：${selected.name}`, (db) => {
      const row = db.customers.find((customer) => customer.id === selected.id);
      if (!row) return;
      row.isActive = !row.isActive;
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  return (
    <>
      <PageHeader
        title="客戶"
        description="本機操作資料會保留在瀏覽器。可直接建檔、修改、補 ERP 客戶編號與停用。"
        action={<button className="cy-op-button primary" onClick={startCreate}>新增客戶</button>}
      />
      <div className="cy-op-split">
        <section className="cy-op-panel cy-op-list-panel">
          <input className="cy-op-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋編號、名稱、電話、聯絡人" />
          <div className="cy-op-list">
            {customers.map((customer) => (
              <button key={customer.id} className={`cy-op-list-row ${selectedId === customer.id ? "active" : ""}`} onClick={() => { setSelectedId(customer.id); setEditing(false); }}>
                <strong>{customer.name}</strong>
                <span>{customer.customerNo ?? "尚無 ERP 編號"} · {customer.category}</span>
                <small>{customer.isActive ? customer.status : "已停用"}</small>
              </button>
            ))}
            {customers.length === 0 ? <EmptyState>沒有符合條件的客戶。</EmptyState> : null}
          </div>
        </section>
        <section className="cy-op-panel">
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={save}>
              <div className="cy-op-panel-header"><h2>{selected ? "修改客戶" : "新增客戶"}</h2><div><button type="button" className="cy-op-button" onClick={() => { setEditing(false); setDraft(null); }}>取消</button><button className="cy-op-button primary">儲存</button></div></div>
              <div className="cy-op-form-grid">
                <label>客戶名稱<input className="cy-op-input" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
                <label>ERP 客戶編號<input className="cy-op-input" value={draft.customerNo ?? ""} onChange={(e) => setDraft({ ...draft, customerNo: e.target.value || null })} placeholder="可稍後補上" /></label>
                <label>簡稱<input className="cy-op-input" value={draft.shortName ?? ""} onChange={(e) => setDraft({ ...draft, shortName: e.target.value || null })} /></label>
                <label>統編<input className="cy-op-input" value={draft.taxId ?? ""} onChange={(e) => setDraft({ ...draft, taxId: e.target.value || null })} /></label>
                <label>電話<input className="cy-op-input" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })} /></label>
                <label>聯絡人<input className="cy-op-input" value={draft.contact ?? ""} onChange={(e) => setDraft({ ...draft, contact: e.target.value || null })} /></label>
                <label>分類<select className="cy-op-input" value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{database.settings.customerCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label>狀態<select className="cy-op-input" value={draft.status ?? ""} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{database.settings.customerStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                <label className="wide">地址<input className="cy-op-input" value={draft.address ?? ""} onChange={(e) => setDraft({ ...draft, address: e.target.value || null })} /></label>
                <label className="wide">備註<textarea className="cy-op-input" rows={4} value={draft.note ?? ""} onChange={(e) => setDraft({ ...draft, note: e.target.value || null })} /></label>
              </div>
              <div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => { setEditing(false); setDraft(null); }}>取消</button><button className="cy-op-button primary">儲存</button></div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-op-panel-header"><div><h2>{selected.name}</h2><p>{selected.customerNo ?? "尚未建立 ERP 客戶編號"} · rev.{selected.revision}</p></div><div><button className="cy-op-button" onClick={startEdit}>修改</button><button className="cy-op-button" onClick={toggleActive}>{selected.isActive ? "停用" : "啟用"}</button></div></div>
              <div className="cy-op-detail-grid">
                <div><span>簡稱</span><strong>{selected.shortName ?? "—"}</strong></div><div><span>統編</span><strong>{selected.taxId ?? "—"}</strong></div>
                <div><span>電話</span><strong>{selected.phone ?? "—"}</strong></div><div><span>聯絡人</span><strong>{selected.contact ?? "—"}</strong></div>
                <div><span>分類</span><strong>{selected.category}</strong></div><div><span>狀態</span><strong>{selected.isActive ? selected.status : "已停用"}</strong></div>
                <div className="wide"><span>地址</span><strong>{selected.address ?? "—"}</strong></div><div className="wide"><span>備註</span><strong>{selected.note ?? "—"}</strong></div>
              </div>
            </div>
          ) : <EmptyState>選擇左側客戶，或新增一筆客戶。</EmptyState>}
        </section>
      </div>
    </>
  );
}

function ItemPage({ database }: PageProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(database.items[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<LocalItem> | null>(null);
  const rows = database.items.filter((row) => !query.trim() || `${row.itemNo} ${row.name} ${row.spec ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = database.items.find((row) => row.id === selectedId) ?? null;

  function startCreate() {
    setDraft({ itemNo: "", name: "", spec: null, category: database.settings.itemCategories[0] ?? "其他", baseUnit: "個", isActive: true, conversions: [] });
    setEditing(true);
  }
  function startEdit() { if (selected) { setDraft({ ...selected, conversions: selected.conversions.map((row) => ({ ...row })) }); setEditing(true); } }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.itemNo?.trim() || !draft.name?.trim() || !draft.baseUnit?.trim()) return;
    let savedId = selected?.id ?? null;
    mutateLocalDatabase(selected ? "item.updated" : "item.created", `${selected ? "修改" : "新增"}商品：${draft.itemNo}`, (db) => {
      if (db.items.some((row) => row.id !== selected?.id && row.itemNo === draft.itemNo?.trim())) throw new Error("品號已存在");
      const payload = {
        itemNo: draft.itemNo!.trim(), name: draft.name!.trim(), spec: draft.spec?.trim() || null,
        category: draft.category || "其他", baseUnit: draft.baseUnit!.trim(), isActive: draft.isActive !== false,
        conversions: (draft.conversions ?? []).filter((row) => row.fromUnit.trim() && row.toUnit.trim() && row.quantity > 0),
      };
      if (selected) {
        const row = db.items.find((item) => item.id === selected.id); if (!row) return;
        Object.assign(row, payload, { revision: row.revision + 1, updatedAt: timestampNow() });
      } else {
        savedId = nextLocalId(db);
        db.items.unshift({ id: savedId, ...payload, revision: 1, updatedAt: timestampNow() });
      }
    });
    if (savedId) setSelectedId(savedId); setEditing(false); setDraft(null);
  }
  function addConversion() { if (draft) setDraft({ ...draft, conversions: [...(draft.conversions ?? []), { fromUnit: "箱", quantity: 1, toUnit: draft.baseUnit ?? "個" }] }); }
  function updateConversion(index: number, key: "fromUnit" | "quantity" | "toUnit", value: string) {
    if (!draft) return; const conversions = (draft.conversions ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, [key]: key === "quantity" ? numberValue(value) : value } : row); setDraft({ ...draft, conversions });
  }

  return <>
    <PageHeader title="商品" description="商品主檔與單位換算現在已是可持久操作的本機資料，不再是一次性預覽。" action={<button className="cy-op-button primary" onClick={startCreate}>新增商品</button>} />
    <div className="cy-op-split"><section className="cy-op-panel cy-op-list-panel"><input className="cy-op-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋品號、名稱、規格" /><div className="cy-op-list">{rows.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => { setSelectedId(row.id); setEditing(false); }}><strong>{row.itemNo} · {row.name}</strong><span>{row.spec ?? "無規格"} · {row.baseUnit}</span><small>{row.isActive ? row.category : "已停用"}</small></button>)}</div></section>
      <section className="cy-op-panel">{editing && draft ? <form className="cy-op-form" onSubmit={save}><div className="cy-op-panel-header"><h2>{selected ? "修改商品" : "新增商品"}</h2><div><button type="button" className="cy-op-button" onClick={() => setEditing(false)}>取消</button><button className="cy-op-button primary">儲存</button></div></div><div className="cy-op-form-grid"><label>品號<input className="cy-op-input" value={draft.itemNo ?? ""} onChange={(e) => setDraft({ ...draft, itemNo: e.target.value })} required /></label><label>名稱<input className="cy-op-input" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label><label>規格<input className="cy-op-input" value={draft.spec ?? ""} onChange={(e) => setDraft({ ...draft, spec: e.target.value || null })} /></label><label>分類<select className="cy-op-input" value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{database.settings.itemCategories.map((value) => <option key={value}>{value}</option>)}</select></label><label>基準單位<input className="cy-op-input" value={draft.baseUnit ?? ""} onChange={(e) => setDraft({ ...draft, baseUnit: e.target.value })} /></label></div><div className="cy-op-subsection"><div className="cy-op-panel-header"><h3>單位換算</h3><button type="button" className="cy-op-button" onClick={addConversion}>增加換算</button></div>{(draft.conversions ?? []).map((row, index) => <div className="cy-op-inline-row" key={index}><span>1</span><input className="cy-op-input" value={row.fromUnit} onChange={(e) => updateConversion(index, "fromUnit", e.target.value)} /><span>=</span><input className="cy-op-input" value={row.quantity} onChange={(e) => updateConversion(index, "quantity", e.target.value)} inputMode="decimal" /><input className="cy-op-input" value={row.toUnit} onChange={(e) => updateConversion(index, "toUnit", e.target.value)} /></div>)}</div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setEditing(false)}>取消</button><button className="cy-op-button primary">儲存</button></div></form> : selected ? <div><div className="cy-op-panel-header"><div><h2>{selected.itemNo} · {selected.name}</h2><p>rev.{selected.revision}</p></div><button className="cy-op-button" onClick={startEdit}>修改</button></div><div className="cy-op-detail-grid"><div><span>規格</span><strong>{selected.spec ?? "—"}</strong></div><div><span>分類</span><strong>{selected.category}</strong></div><div><span>基準單位</span><strong>{selected.baseUnit}</strong></div><div><span>狀態</span><strong>{selected.isActive ? "使用中" : "已停用"}</strong></div></div><div className="cy-op-subsection"><h3>單位換算</h3>{selected.conversions.length ? selected.conversions.map((row, index) => <div key={index} className="cy-op-read-row">1 {row.fromUnit} = {row.quantity} {row.toUnit}</div>) : <p>沒有額外換算。</p>}</div></div> : <EmptyState>請選擇商品。</EmptyState>}</section></div>
  </>;
}

function SalesOrderPage({ database }: PageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(database.salesOrders[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(database.customers.find((row) => row.isActive)?.id ?? null);
  const [customerName, setCustomerName] = useState("");
  const [itemId, setItemId] = useState<number | null>(database.items.find((row) => row.isActive)?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const selected = database.salesOrders.find((row) => row.id === selectedId) ?? null;

  function createOrder(event: FormEvent) {
    event.preventDefault();
    const linkedCustomer = customerId ? database.customers.find((row) => row.id === customerId) : null;
    const name = linkedCustomer?.name ?? customerName.trim();
    const item = itemId ? database.items.find((row) => row.id === itemId) : null;
    if (!name || !item || quantity <= 0) return;
    let id = 0;
    mutateLocalDatabase("sales_order.created", `新增銷售工單：${name}`, (db) => {
      id = nextLocalId(db); const lineId = nextLocalId(db);
      db.salesOrders.unshift({ id, ref: `SO-LOCAL-${String(id).padStart(4, "0")}`, orderDate: dateToday(), customerId: linkedCustomer?.id ?? null, customerNameSnapshot: name, erpRef: null, status: "created", note: null, lines: [{ id: lineId, itemId: item.id, quantity, unit: item.baseUnit, unitPrice: null }], revision: 1, updatedAt: timestampNow() });
    });
    setSelectedId(id); setCreating(false);
  }

  function fillErp() {
    if (!selected || selected.status !== "created") return;
    const value = window.prompt("輸入 ERP 單號", selected.erpRef ?? ""); if (!value?.trim()) return;
    mutateLocalDatabase("sales_order.erp_filled", `ERP 回填：${selected.ref} → ${value.trim()}`, (db) => { const row = db.salesOrders.find((order) => order.id === selected.id); if (!row) return; row.erpRef = value.trim(); row.status = "issued"; row.revision += 1; row.updatedAt = timestampNow(); });
  }
  function transition(next: LocalSalesOrder["status"]) {
    if (!selected) return;
    mutateLocalDatabase("sales_order.status.changed", `${selected.ref}：${selected.status} → ${next}`, (db) => { const row = db.salesOrders.find((order) => order.id === selected.id); if (!row) return; row.status = next; row.revision += 1; row.updatedAt = timestampNow(); });
  }
  const statusText: Record<LocalSalesOrder["status"], string> = { created: "待 ERP", issued: "已開單", waiting_stock: "待貨", picked: "已撿貨", shipped: "已出貨", voided: "已作廢" };

  return <><PageHeader title="銷售工單" description="工單可直接建立、ERP 回填並推進撿貨／出貨狀態。" action={<button className="cy-op-button primary" onClick={() => setCreating(true)}>新增工單</button>} />
    {creating ? <section className="cy-op-panel cy-op-form-card"><form onSubmit={createOrder}><div className="cy-op-panel-header"><h2>新增銷售工單</h2><button type="button" className="cy-op-button" onClick={() => setCreating(false)}>取消</button></div><div className="cy-op-form-grid"><label>客戶<select className="cy-op-input" value={customerId ?? ""} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : null)}><option value="">名稱-only</option>{database.customers.filter((row) => row.isActive).map((row) => <option value={row.id} key={row.id}>{row.customerNo ?? "—"} · {row.name}</option>)}</select></label>{customerId == null ? <label>客戶名稱<input className="cy-op-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label> : null}<label>商品<select className="cy-op-input" value={itemId ?? ""} onChange={(e) => setItemId(Number(e.target.value))}>{database.items.filter((row) => row.isActive).map((row) => <option value={row.id} key={row.id}>{row.itemNo} · {row.name}</option>)}</select></label><label>數量<input className="cy-op-input" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(e) => setQuantity(numberValue(e.target.value))} /></label></div><div className="cy-op-form-footer"><button className="cy-op-button primary">建立工單</button></div></form></section> : null}
    <div className="cy-op-split"><section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{database.salesOrders.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => setSelectedId(row.id)}><strong>{row.ref}</strong><span>{row.customerNameSnapshot}</span><small>{statusText[row.status]} · {row.orderDate}</small></button>)}</div></section><section className="cy-op-panel">{selected ? <div><div className="cy-op-panel-header"><div><h2>{selected.ref}</h2><p>{selected.customerNameSnapshot} · rev.{selected.revision}</p></div><span className="cy-op-badge">{statusText[selected.status]}</span></div><div className="cy-op-detail-grid"><div><span>ERP 單號</span><strong>{selected.erpRef ?? "尚未回填"}</strong></div><div><span>日期</span><strong>{selected.orderDate}</strong></div></div><div className="cy-op-subsection"><h3>明細</h3><table className="cy-op-table"><thead><tr><th>品號</th><th>商品</th><th>數量</th><th>單位</th></tr></thead><tbody>{selected.lines.map((line) => { const item = database.items.find((row) => row.id === line.itemId); return <tr key={line.id}><td>{item?.itemNo}</td><td>{item?.name}</td><td>{line.quantity}</td><td>{line.unit}</td></tr>; })}</tbody></table></div><div className="cy-op-action-bar">{selected.status === "created" ? <button className="cy-op-button primary" onClick={fillErp}>ERP 回填／開單</button> : null}{selected.status === "issued" ? <><button className="cy-op-button" onClick={() => transition("waiting_stock")}>轉待貨</button><button className="cy-op-button primary" onClick={() => transition("picked")}>直接撿貨</button></> : null}{selected.status === "waiting_stock" ? <button className="cy-op-button primary" onClick={() => transition("picked")}>完成撿貨</button> : null}{selected.status === "picked" ? <button className="cy-op-button primary" onClick={() => transition("shipped")}>確認出貨</button> : null}{selected.status !== "voided" && selected.status !== "shipped" ? <button className="cy-op-button danger" onClick={() => transition("voided")}>作廢</button> : null}</div></div> : <EmptyState>請選擇工單。</EmptyState>}</section></div>
  </>;
}

function OutsourcingPage({ database }: PageProps) {
  const [tab, setTab] = useState<"orders" | "contractors" | "boms" | "stock">("orders");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(database.outsourcingOrders[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [contractorId, setContractorId] = useState(database.contractors[0]?.id ?? 0);
  const [partItemId, setPartItemId] = useState(database.items.find((row) => row.isActive)?.id ?? 0);
  const [partQty, setPartQty] = useState(1);
  const selected = database.outsourcingOrders.find((row) => row.id === selectedOrderId) ?? null;
  const statusText: Record<LocalOutsourcingOrder["status"], string> = { pending_outbound: "待出庫", outbound: "已出庫", received: "已入庫", priced: "已計價", paid: "已付款", voided: "已作廢" };

  function createOrder(event: FormEvent) {
    event.preventDefault(); const item = database.items.find((row) => row.id === partItemId); if (!contractorId || !item || partQty <= 0) return; let id = 0;
    mutateLocalDatabase("outsourcing.created", "新增代工單", (db) => { id = nextLocalId(db); db.outsourcingOrders.unshift({ id, ref: `OUT-LOCAL-${String(id).padStart(4, "0")}`, contractorId, orderDate: dateToday(), outboundDate: null, status: "pending_outbound", parts: [{ itemId: item.id, quantity: partQty, unit: item.baseUnit }], receiptItems: [], pricingTotal: null, paidAt: null, revision: 1, updatedAt: timestampNow() }); }); setSelectedOrderId(id); setCreating(false);
  }
  function confirmOutbound() {
    if (!selected || selected.status !== "pending_outbound") return;
    mutateLocalDatabase("outsourcing.outbound.confirmed", `${selected.ref} 確認出庫`, (db) => { const row = db.outsourcingOrders.find((order) => order.id === selected.id); if (!row) return; row.parts.forEach((part) => db.stockMovements.push({ id: nextLocalId(db), contractorId: row.contractorId, itemId: part.itemId, quantityDelta: part.quantity, type: "outbound_supply", outsourcingOrderId: row.id, reversalOf: null, occurredAt: timestampNow() })); row.status = "outbound"; row.outboundDate = dateToday(); row.revision += 1; row.updatedAt = timestampNow(); });
  }
  function receive() {
    if (!selected || selected.status !== "outbound") return; const finished = database.items.find((row) => row.id === database.boms[0]?.finishedItemId); const bom = database.boms.find((row) => row.finishedItemId === finished?.id && row.isActive); if (!finished) return;
    const raw = window.prompt(`入庫 ${finished.name} 數量`, "1"); const qty = raw ? numberValue(raw) : 0; if (qty <= 0) return;
    mutateLocalDatabase("outsourcing.received", `${selected.ref} 入庫`, (db) => { const row = db.outsourcingOrders.find((order) => order.id === selected.id); if (!row) return; row.receiptItems = [{ itemId: finished.id, bomId: bom?.id ?? null, quantity: qty, unit: finished.baseUnit }]; if (bom) bom.components.forEach((component) => db.stockMovements.push({ id: nextLocalId(db), contractorId: row.contractorId, itemId: component.itemId, quantityDelta: -(component.quantity / bom.outputQuantity) * qty, type: "receipt_consumption", outsourcingOrderId: row.id, reversalOf: null, occurredAt: timestampNow() })); row.status = "received"; row.revision += 1; row.updatedAt = timestampNow(); });
  }
  function price() {
    if (!selected || selected.status !== "received") return; const contractor = database.contractors.find((row) => row.id === selected.contractorId); let total = 0; for (const receipt of selected.receiptItems) { const rate = contractor?.prices.find((row) => row.itemId === receipt.itemId); if (!rate) { window.alert("此代工對象尚未設定入庫成品的代工單價"); return; } total += receipt.quantity * rate.price; }
    mutateLocalDatabase("outsourcing.priced", `${selected.ref} 計價`, (db) => { const row = db.outsourcingOrders.find((order) => order.id === selected.id); if (!row) return; row.pricingTotal = total; row.status = "priced"; row.revision += 1; row.updatedAt = timestampNow(); });
  }
  function pay() { if (!selected || selected.status !== "priced") return; mutateLocalDatabase("outsourcing.paid", `${selected.ref} 付款`, (db) => { const row = db.outsourcingOrders.find((order) => order.id === selected.id); if (!row) return; row.status = "paid"; row.paidAt = timestampNow(); row.revision += 1; row.updatedAt = timestampNow(); }); }
  function stockBalance(contractor: number, item: number) { return database.stockMovements.filter((row) => row.contractorId === contractor && row.itemId === item).reduce((sum, row) => sum + row.quantityDelta, 0); }

  return <><PageHeader title="委外／代工" description="代工單、BOM、代工單價與 movement-derived 庫存已放進同一個可持久操作版本。" action={tab === "orders" ? <button className="cy-op-button primary" onClick={() => setCreating(true)}>新增代工單</button> : undefined} /><div className="cy-op-tabs">{(["orders", "contractors", "boms", "stock"] as const).map((value) => <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)}>{value === "orders" ? "代工單" : value === "contractors" ? "代工對象／單價" : value === "boms" ? "BOM" : "代工庫存"}</button>)}</div>
    {tab === "orders" ? <>{creating ? <section className="cy-op-panel cy-op-form-card"><form onSubmit={createOrder}><div className="cy-op-form-grid"><label>代工對象<select className="cy-op-input" value={contractorId} onChange={(e) => setContractorId(Number(e.target.value))}>{database.contractors.filter((row) => row.isActive).map((row) => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label><label>出庫料件<select className="cy-op-input" value={partItemId} onChange={(e) => setPartItemId(Number(e.target.value))}>{database.items.filter((row) => row.isActive).map((row) => <option value={row.id} key={row.id}>{row.itemNo} · {row.name}</option>)}</select></label><label>數量<input className="cy-op-input" type="number" step="0.0001" value={partQty} onChange={(e) => setPartQty(numberValue(e.target.value))} /></label></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setCreating(false)}>取消</button><button className="cy-op-button primary">建立</button></div></form></section> : null}<div className="cy-op-split"><section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{database.outsourcingOrders.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedOrderId === row.id ? "active" : ""}`} onClick={() => setSelectedOrderId(row.id)}><strong>{row.ref}</strong><span>{database.contractors.find((c) => c.id === row.contractorId)?.name}</span><small>{statusText[row.status]}</small></button>)}</div></section><section className="cy-op-panel">{selected ? <div><div className="cy-op-panel-header"><div><h2>{selected.ref}</h2><p>{database.contractors.find((row) => row.id === selected.contractorId)?.name}</p></div><span className="cy-op-badge">{statusText[selected.status]}</span></div><table className="cy-op-table"><thead><tr><th>料件</th><th>數量</th><th>單位</th></tr></thead><tbody>{selected.parts.map((part, index) => { const item = database.items.find((row) => row.id === part.itemId); return <tr key={index}><td>{item?.itemNo} · {item?.name}</td><td>{part.quantity}</td><td>{part.unit}</td></tr>; })}</tbody></table>{selected.pricingTotal != null ? <div className="cy-op-total">計價總額：NT$ {selected.pricingTotal.toFixed(2)}</div> : null}<div className="cy-op-action-bar">{selected.status === "pending_outbound" ? <button className="cy-op-button primary" onClick={confirmOutbound}>確認出庫</button> : null}{selected.status === "outbound" ? <button className="cy-op-button primary" onClick={receive}>入庫</button> : null}{selected.status === "received" ? <button className="cy-op-button primary" onClick={price}>計價</button> : null}{selected.status === "priced" ? <button className="cy-op-button primary" onClick={pay}>付款</button> : null}</div></div> : <EmptyState>尚無代工單，可先新增一筆。</EmptyState>}</section></div></> : null}
    {tab === "contractors" ? <section className="cy-op-panel"><table className="cy-op-table"><thead><tr><th>代工對象</th><th>電話</th><th>現行單價</th><th>狀態</th></tr></thead><tbody>{database.contractors.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.phone ?? "—"}</td><td>{row.prices.map((price) => `${database.items.find((item) => item.id === price.itemId)?.itemNo} ${price.price}/${price.unit}`).join("、") || "未設定"}</td><td>{row.isActive ? "使用中" : "停用"}</td></tr>)}</tbody></table></section> : null}
    {tab === "boms" ? <section className="cy-op-panel"><table className="cy-op-table"><thead><tr><th>BOM</th><th>成品</th><th>產出</th><th>組成</th></tr></thead><tbody>{database.boms.map((row) => <tr key={row.id}><td>{row.ref}</td><td>{database.items.find((item) => item.id === row.finishedItemId)?.name}</td><td>{row.outputQuantity} {row.outputUnit}</td><td>{row.components.map((component) => `${database.items.find((item) => item.id === component.itemId)?.name} × ${component.quantity}${component.unit}`).join("、")}</td></tr>)}</tbody></table></section> : null}
    {tab === "stock" ? <section className="cy-op-panel"><table className="cy-op-table"><thead><tr><th>代工對象</th><th>商品</th><th>目前庫存</th></tr></thead><tbody>{database.contractors.flatMap((contractor) => database.items.map((item) => ({ contractor, item, balance: stockBalance(contractor.id, item.id) }))).filter((row) => row.balance !== 0).map((row) => <tr key={`${row.contractor.id}-${row.item.id}`}><td>{row.contractor.name}</td><td>{row.item.itemNo} · {row.item.name}</td><td>{row.balance} {row.item.baseUnit}</td></tr>)}</tbody></table><div className="cy-op-subsection"><h3>Movement ledger</h3><table className="cy-op-table"><thead><tr><th>時間</th><th>類型</th><th>商品</th><th>變動</th><th>工單</th></tr></thead><tbody>{database.stockMovements.slice().reverse().map((row) => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString()}</td><td>{row.type}</td><td>{database.items.find((item) => item.id === row.itemId)?.itemNo}</td><td>{row.quantityDelta}</td><td>{database.outsourcingOrders.find((order) => order.id === row.outsourcingOrderId)?.ref}</td></tr>)}</tbody></table></div></section> : null}
  </>;
}

function WorkLogPage({ database }: PageProps) {
  const [selectedId, setSelectedId] = useState<number | null>(database.workLogs[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState("");
  const [workDays, setWorkDays] = useState(1);
  const selected = database.workLogs.find((row) => row.id === selectedId) ?? null;
  const statusText: Record<LocalWorkLog["status"], string> = { created: "已建檔", pending_review: "待審核", reviewed: "已審核" };
  function create(event: FormEvent) { event.preventDefault(); if (!content.trim() || workDays <= 0) return; let id = 0; mutateLocalDatabase("work_log.created", "新增工作日誌", (db) => { id = nextLocalId(db); db.workLogs.unshift({ id, ref: `WL-LOCAL-${String(id).padStart(4, "0")}`, logDate: dateToday(), dateFrom: dateToday(), dateTo: dateToday(), workDays, employeeName: "本機測試使用者", status: "created", entries: [{ id: nextLocalId(db), content: content.trim(), category: db.settings.workLogCategories[0] ?? "一般工作", quantity: 1, reviewScore: null, reviewRemark: null }], reviewRemark: null, finalScore: null, averageDailyScore: null, revision: 1, updatedAt: timestampNow() }); }); setSelectedId(id); setCreating(false); setContent(""); }
  function transition(status: LocalWorkLog["status"], action: string) { if (!selected) return; mutateLocalDatabase(action, `${selected.ref}：${selected.status} → ${status}`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.status = status; row.revision += 1; row.updatedAt = timestampNow(); }); }
  function review() { if (!selected || selected.status !== "pending_review") return; const raw = window.prompt("輸入本次審核總分", "10"); if (raw == null) return; const score = numberValue(raw); const daysRaw = window.prompt("確認工作日數", String(selected.workDays)); if (daysRaw == null) return; const days = numberValue(daysRaw); if (days <= 0) return; mutateLocalDatabase("work_log.reviewed", `${selected.ref} 審核完成`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.workDays = days; row.status = "reviewed"; row.finalScore = score; row.averageDailyScore = Number((score / days).toFixed(4)); row.reviewRemark = "本機操作版審核"; if (row.entries[0]) row.entries[0].reviewScore = score; row.revision += 1; row.updatedAt = timestampNow(); }); }
  function cancelReview() { if (!selected || selected.status !== "reviewed") return; mutateLocalDatabase("work_log.review.cancelled", `${selected.ref} 取消審核`, (db) => { const row = db.workLogs.find((log) => log.id === selected.id); if (!row) return; row.status = "pending_review"; row.finalScore = null; row.averageDailyScore = null; row.reviewRemark = null; row.entries.forEach((entry) => { entry.reviewScore = null; entry.reviewRemark = null; }); row.revision += 1; row.updatedAt = timestampNow(); }); }
  return <><PageHeader title="工作日誌" description="可以直接建立、送審、撤回、審核與取消審核；重新整理後資料仍保留。" action={<button className="cy-op-button primary" onClick={() => setCreating(true)}>新增日誌</button>} />{creating ? <section className="cy-op-panel cy-op-form-card"><form onSubmit={create}><div className="cy-op-form-grid"><label className="wide">工作內容<input className="cy-op-input" value={content} onChange={(e) => setContent(e.target.value)} /></label><label>工作日數<input className="cy-op-input" type="number" step="0.25" min="0.01" value={workDays} onChange={(e) => setWorkDays(numberValue(e.target.value))} /></label></div><div className="cy-op-form-footer"><button type="button" className="cy-op-button" onClick={() => setCreating(false)}>取消</button><button className="cy-op-button primary">建立</button></div></form></section> : null}<div className="cy-op-split"><section className="cy-op-panel cy-op-list-panel"><div className="cy-op-list">{database.workLogs.map((row) => <button key={row.id} className={`cy-op-list-row ${selectedId === row.id ? "active" : ""}`} onClick={() => setSelectedId(row.id)}><strong>{row.ref}</strong><span>{row.logDate} · {row.workDays} 日</span><small>{statusText[row.status]}</small></button>)}</div></section><section className="cy-op-panel">{selected ? <div><div className="cy-op-panel-header"><div><h2>{selected.ref}</h2><p>{selected.employeeName} · rev.{selected.revision}</p></div><span className="cy-op-badge">{statusText[selected.status]}</span></div><div className="cy-op-detail-grid"><div><span>工作日數</span><strong>{selected.workDays}</strong></div><div><span>審核總分</span><strong>{selected.finalScore ?? "—"}</strong></div><div><span>平均日分</span><strong>{selected.averageDailyScore ?? "—"}</strong></div></div><div className="cy-op-subsection"><h3>工作內容</h3>{selected.entries.map((entry) => <div className="cy-op-read-row" key={entry.id}>{entry.content} <small>· {entry.category}{entry.reviewScore != null ? ` · ${entry.reviewScore} 分` : ""}</small></div>)}</div><div className="cy-op-action-bar">{selected.status === "created" ? <button className="cy-op-button primary" onClick={() => transition("pending_review", "work_log.review.submitted")}>送出審核</button> : null}{selected.status === "pending_review" ? <><button className="cy-op-button" onClick={() => transition("created", "work_log.review.withdrawn")}>撤回審核</button><button className="cy-op-button primary" onClick={review}>審核計分</button></> : null}{selected.status === "reviewed" ? <button className="cy-op-button danger" onClick={cancelReview}>取消審核</button> : null}</div></div> : <EmptyState>請選擇工作日誌。</EmptyState>}</section></div></>;
}

function SettingsPage({ database }: PageProps) {
  const [importText, setImportText] = useState("");
  const [newCategory, setNewCategory] = useState("");
  function addCustomerCategory() { const value = newCategory.trim(); if (!value) return; mutateLocalDatabase("setting.customer_category.created", `新增客戶分類：${value}`, (db) => { if (!db.settings.customerCategories.includes(value)) db.settings.customerCategories.push(value); }); setNewCategory(""); }
  return <><PageHeader title="設定／管理" description="目前為本機操作模式。這裡的設定會立即影響其他模組的選單。" /><div className="cy-op-grid-two"><section className="cy-op-panel"><h2>客戶分類</h2><div className="cy-op-chip-list">{database.settings.customerCategories.map((value) => <span className="cy-op-chip" key={value}>{value}</span>)}</div><div className="cy-op-inline-row"><input className="cy-op-input" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="新增分類" /><button className="cy-op-button" onClick={addCustomerCategory}>新增</button></div></section><section className="cy-op-panel"><h2>本機資料工具</h2><p>目前資料存在此瀏覽器的 localStorage。你可以先長期測介面與流程，之後資料 adapter 再切到 D1。</p><div className="cy-op-action-bar"><button className="cy-op-button" onClick={() => downloadText(`cyweb-local-${dateToday()}.json`, exportLocalDatabase())}>匯出 JSON</button><button className="cy-op-button danger" onClick={() => { if (window.confirm("確定重設所有本機測試資料？")) resetLocalDatabase(); }}>重設測試資料</button></div></section></div><section className="cy-op-panel cy-op-form-card"><h2>匯入本機資料</h2><p>貼上先前匯出的 JSON，可把整個操作狀態還原。</p><textarea className="cy-op-input" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} /><div className="cy-op-form-footer"><button className="cy-op-button primary" onClick={() => { try { importLocalDatabase(importText); setImportText(""); window.alert("匯入完成"); } catch (error) { window.alert(error instanceof Error ? error.message : "匯入失敗"); } }}>匯入</button></div></section></>;
}

function AuditPage({ database }: PageProps) {
  return <><PageHeader title="稽核紀錄" description="本機操作版先記錄重要動作，方便你測試流程時追查狀態變化。" /><section className="cy-op-panel"><table className="cy-op-table"><thead><tr><th>時間</th><th>Action</th><th>摘要</th></tr></thead><tbody>{database.audit.map((row) => <tr key={row.id}><td>{new Date(row.at).toLocaleString()}</td><td><code>{row.action}</code></td><td>{row.summary}</td></tr>)}</tbody></table></section></>;
}

export function OperationalWorkspace({ route }: { route: OperationalRoute }) {
  const database = useLocalDatabase();
  if (route === "customers") return <CustomerPage database={database} />;
  if (route === "items") return <ItemPage database={database} />;
  if (route === "orders") return <SalesOrderPage database={database} />;
  if (route === "outsourcing") return <OutsourcingPage database={database} />;
  if (route === "worklogs") return <WorkLogPage database={database} />;
  if (route === "settings") return <SettingsPage database={database} />;
  return <AuditPage database={database} />;
}
