import { FormEvent, useMemo, useState } from "react";
import {
  customerAddresses,
  customerContacts,
  customerImportantNotes,
  customerPhones,
  type LocalCustomerAddress,
  type LocalCustomerContact,
  type LocalCustomerFrequentItem,
  type LocalCustomerImportantNote,
  type LocalCustomerPhone,
  type LocalCustomerQuote,
  type LocalCustomerVisit,
} from "../advanced-local-types";
import {
  dateToday,
  mutateLocalDatabase,
  nextLocalId,
  timestampNow,
  type LocalCustomer,
  useLocalDatabase,
} from "../local-database";
import "./customer-operational.css";

type RelatedTab = "visits" | "quotes" | "frequent" | "activity";

type CustomerDraft = Omit<LocalCustomer, "id" | "revision" | "updatedAt"> & {
  id?: number;
  phones: LocalCustomerPhone[];
  contacts: LocalCustomerContact[];
  addresses: LocalCustomerAddress[];
  importantNotes: LocalCustomerImportantNote[];
};

interface VisitDraft {
  id: number | null;
  visitDate: string;
  contactId: number | null;
  contactText: string;
  content: string;
}

interface QuoteDraft {
  correctedFromId: number | null;
  itemId: number | null;
  quoteDate: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  note: string;
}

function emptyVisit(): VisitDraft {
  return { id: null, visitDate: dateToday(), contactId: null, contactText: "", content: "" };
}

function emptyQuote(): QuoteDraft {
  return { correctedFromId: null, itemId: null, quoteDate: dateToday(), quantity: 1, unit: "個", unitPrice: 0, note: "" };
}

function normalizeDraft(customer: LocalCustomer): CustomerDraft {
  return {
    ...customer,
    phones: customerPhones(customer).map((row) => ({ ...row })),
    contacts: customerContacts(customer).map((row) => ({ ...row })),
    addresses: customerAddresses(customer).map((row) => ({ ...row })),
    importantNotes: customerImportantNotes(customer).map((row) => ({ ...row })),
  };
}

function newCustomerDraft(database: ReturnType<typeof useLocalDatabase>): CustomerDraft {
  return {
    customerNo: null,
    name: "",
    shortName: null,
    taxId: null,
    phone: null,
    contact: null,
    address: null,
    region: null,
    category: database.settings.customerCategories[0] ?? "其他",
    status: database.settings.customerStatuses[0] ?? "正常",
    note: null,
    isActive: true,
    phones: [],
    contacts: [],
    addresses: [],
    importantNotes: [],
  };
}

function draftId(): number {
  return -Math.floor(Date.now() + Math.random() * 100000);
}

function readableDate(value: string): string {
  if (!value) return "—";
  return value;
}

export function CustomerOperationalPage() {
  const database = useLocalDatabase();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(database.customers[0]?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [relatedTab, setRelatedTab] = useState<RelatedTab>("visits");
  const [visitDraft, setVisitDraft] = useState<VisitDraft | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null);
  const [frequentItemId, setFrequentItemId] = useState<number | null>(null);
  const [frequentText, setFrequentText] = useState("");

  const selected = database.customers.find((row) => row.id === selectedId) ?? null;
  const visits = (database.customerVisits ?? []).filter((row) => row.customerId === selectedId).sort((a, b) => b.visitDate.localeCompare(a.visitDate) || b.id - a.id);
  const quotes = (database.customerQuotes ?? []).filter((row) => row.customerId === selectedId).sort((a, b) => b.quoteDate.localeCompare(a.quoteDate) || b.id - a.id);
  const frequentItems = (database.customerFrequentItems ?? []).filter((row) => row.customerId === selectedId);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return database.customers.filter((customer) => {
      if (categoryFilter && customer.category !== categoryFilter) return false;
      if (statusFilter === "active" && !customer.isActive) return false;
      if (statusFilter === "inactive" && customer.isActive) return false;
      if (!keyword) return true;
      const values = [
        customer.customerNo,
        customer.name,
        customer.shortName,
        customer.taxId,
        customer.phone,
        customer.contact,
        customer.address,
        customer.region,
        ...customerPhones(customer).map((row) => row.phone),
        ...customerContacts(customer).flatMap((row) => [row.name, row.phone, row.mobile]),
      ];
      return values.some((value) => value?.toLowerCase().includes(keyword));
    });
  }, [database.customers, query, categoryFilter, statusFilter]);

  function selectCustomer(id: number) {
    if (editing && !window.confirm("目前有尚未儲存的客戶修改，確定放棄？")) return;
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setVisitDraft(null);
    setQuoteDraft(null);
  }

  function startCreate() {
    if (editing && !window.confirm("放棄目前尚未儲存的修改？")) return;
    setSelectedId(null);
    setCreating(true);
    setEditing(true);
    setDraft(newCustomerDraft(database));
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setDraft(normalizeDraft(selected));
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    setDraft(null);
  }

  function patchDraft(patch: Partial<CustomerDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!draft?.name.trim()) return;
    const name = draft.name.trim();
    const taxId = draft.taxId?.trim() || null;
    const customerNo = creating ? (draft.customerNo?.trim() || null) : selected?.customerNo ?? null;
    if (customerNo && database.customers.some((row) => row.id !== selected?.id && row.customerNo === customerNo)) {
      window.alert("ERP 客戶編號已存在。");
      return;
    }
    const duplicateTax = taxId
      ? database.customers.filter((row) => row.id !== selected?.id && row.taxId?.trim() === taxId)
      : [];
    if (duplicateTax.length && !window.confirm(`已有 ${duplicateTax.length} 筆客戶使用相同統編 ${taxId}。仍要儲存嗎？`)) return;

    let savedId = selected?.id ?? 0;
    mutateLocalDatabase(
      creating ? "customer.created" : "customer.updated",
      `${creating ? "新增" : "修改"}客戶：${name}`,
      (db) => {
        const assignId = <T extends { id: number }>(rows: T[]): T[] => rows.map((row) => row.id > 0 ? row : { ...row, id: nextLocalId(db) });
        const phones = assignId(draft.phones.filter((row) => row.phone.trim()).map((row) => ({ ...row, phone: row.phone.trim(), label: row.label?.trim() || null, extension: row.extension?.trim() || null, note: row.note?.trim() || null })));
        const contacts = assignId(draft.contacts.filter((row) => row.name.trim()).map((row) => ({ ...row, name: row.name.trim(), title: row.title?.trim() || null, phone: row.phone?.trim() || null, mobile: row.mobile?.trim() || null, note: row.note?.trim() || null })));
        const addresses = assignId(draft.addresses.filter((row) => row.address.trim()).map((row) => ({ ...row, label: row.label?.trim() || null, postalCode: row.postalCode?.trim() || null, address: row.address.trim(), note: row.note?.trim() || null })));
        const importantNotes = assignId(draft.importantNotes.filter((row) => row.content.trim()).map((row) => ({ ...row, content: row.content.trim() })));
        const payload = {
          customerNo,
          name,
          shortName: draft.shortName?.trim() || null,
          taxId,
          phone: phones.find((row) => row.isActive)?.phone ?? null,
          contact: contacts.find((row) => row.isActive)?.name ?? null,
          address: addresses.find((row) => row.isActive)?.address ?? null,
          region: draft.region?.trim() || null,
          category: draft.category || "其他",
          status: draft.status || "正常",
          note: importantNotes.find((row) => row.isActive)?.content ?? null,
          isActive: draft.isActive,
          phones,
          contacts,
          addresses,
          importantNotes,
        };
        if (creating) {
          savedId = nextLocalId(db);
          db.customers.unshift({ id: savedId, ...payload, revision: 1, updatedAt: timestampNow() });
        } else if (selected) {
          const row = db.customers.find((customer) => customer.id === selected.id);
          if (!row) return;
          Object.assign(row, payload, { customerNo: row.customerNo, revision: row.revision + 1, updatedAt: timestampNow() });
          savedId = row.id;
        }
      },
    );
    setSelectedId(savedId || selectedId);
    setEditing(false);
    setCreating(false);
    setDraft(null);
  }

  function setCustomerNumber() {
    if (!selected) return;
    const raw = window.prompt("輸入 ERP 客戶編號；留空代表清除目前編號", selected.customerNo ?? "");
    if (raw == null) return;
    const next = raw.trim() || null;
    if (next === selected.customerNo) return;
    if (next && database.customers.some((row) => row.id !== selected.id && row.customerNo === next)) {
      window.alert("ERP 客戶編號已存在。");
      return;
    }
    const reason = window.prompt("請輸入此次 ERP 客戶編號指派／更正原因", selected.customerNo ? "ERP 編號更正" : "ERP 建檔後回填");
    if (reason == null) return;
    mutateLocalDatabase("customer.number.changed", `${selected.name}：${selected.customerNo ?? "未設定"} → ${next ?? "未設定"}${reason.trim() ? `（${reason.trim()}）` : ""}`, (db) => {
      const row = db.customers.find((customer) => customer.id === selected.id);
      if (!row) return;
      row.customerNo = next;
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function hasBusinessUse(customerId: number): boolean {
    return (database.customerVisits ?? []).some((row) => row.customerId === customerId)
      || (database.customerQuotes ?? []).some((row) => row.customerId === customerId)
      || database.salesOrders.some((row) => row.customerId === customerId);
  }

  function lifecycleAction() {
    if (!selected) return;
    if (!hasBusinessUse(selected.id)) {
      if (!window.confirm(`「${selected.name}」尚無業務引用。確定永久刪除此客戶？`)) return;
      mutateLocalDatabase("customer.deleted", `刪除未使用客戶：${selected.name}`, (db) => {
        db.customers = db.customers.filter((row) => row.id !== selected.id);
        db.customerFrequentItems = (db.customerFrequentItems ?? []).filter((row) => row.customerId !== selected.id);
      });
      setSelectedId(database.customers.find((row) => row.id !== selected.id)?.id ?? null);
      return;
    }
    mutateLocalDatabase("customer.active.changed", `${selected.isActive ? "停用" : "啟用"}客戶：${selected.name}`, (db) => {
      const row = db.customers.find((customer) => customer.id === selected.id);
      if (!row) return;
      row.isActive = !row.isActive;
      row.revision += 1;
      row.updatedAt = timestampNow();
    });
  }

  function addPhone() {
    if (!draft) return;
    patchDraft({ phones: [...draft.phones, { id: draftId(), phone: "", label: null, extension: null, note: null, isActive: true }] });
  }

  function addContact() {
    if (!draft) return;
    patchDraft({ contacts: [...draft.contacts, { id: draftId(), name: "", title: null, phone: null, mobile: null, note: null, isActive: true }] });
  }

  function addAddress() {
    if (!draft) return;
    patchDraft({ addresses: [...draft.addresses, { id: draftId(), label: null, postalCode: null, address: "", note: null, isActive: true }] });
  }

  function addImportantNote() {
    if (!draft) return;
    patchDraft({ importantNotes: [...draft.importantNotes, { id: draftId(), content: "", isActive: true }] });
  }

  function saveVisit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !visitDraft?.visitDate || !visitDraft.content.trim()) return;
    const contact = visitDraft.contactId ? customerContacts(selected).find((row) => row.id === visitDraft.contactId) : null;
    mutateLocalDatabase(visitDraft.id ? "customer.visit.updated" : "customer.visit.created", `${visitDraft.id ? "修改" : "新增"}拜訪：${selected.name}`, (db) => {
      db.customerVisits ??= [];
      if (visitDraft.id) {
        const row = db.customerVisits.find((visit) => visit.id === visitDraft.id && visit.customerId === selected.id);
        if (!row) return;
        Object.assign(row, {
          visitDate: visitDraft.visitDate,
          contactId: contact?.id ?? null,
          contactNameSnapshot: contact?.name ?? null,
          contactText: contact ? null : visitDraft.contactText.trim() || null,
          content: visitDraft.content.trim(),
          revision: row.revision + 1,
          updatedAt: timestampNow(),
        });
      } else {
        db.customerVisits.unshift({
          id: nextLocalId(db), customerId: selected.id, visitDate: visitDraft.visitDate,
          contactId: contact?.id ?? null, contactNameSnapshot: contact?.name ?? null,
          contactText: contact ? null : visitDraft.contactText.trim() || null,
          content: visitDraft.content.trim(), operatorName: "本機測試使用者",
          revision: 1, createdAt: timestampNow(), updatedAt: timestampNow(),
        });
      }
    });
    setVisitDraft(null);
  }

  function editVisit(visit: LocalCustomerVisit) {
    setVisitDraft({ id: visit.id, visitDate: visit.visitDate, contactId: visit.contactId, contactText: visit.contactText ?? "", content: visit.content });
  }

  function deleteVisit(visit: LocalCustomerVisit) {
    if (!selected || !window.confirm(`確定刪除 ${visit.visitDate} 的拜訪紀錄？`)) return;
    mutateLocalDatabase("customer.visit.deleted", `刪除拜訪：${selected.name} ${visit.visitDate}`, (db) => {
      db.customerVisits = (db.customerVisits ?? []).filter((row) => row.id !== visit.id);
    });
  }

  function saveQuote(event: FormEvent) {
    event.preventDefault();
    if (!selected || !quoteDraft?.itemId || quoteDraft.quantity <= 0 || quoteDraft.unitPrice < 0 || !quoteDraft.unit.trim()) return;
    const item = database.items.find((row) => row.id === quoteDraft.itemId);
    if (!item) return;
    mutateLocalDatabase(quoteDraft.correctedFromId ? "customer.quote.corrected" : "customer.quote.created", `${quoteDraft.correctedFromId ? "修正" : "新增"}報價：${selected.name} / ${item.itemNo}`, (db) => {
      db.customerQuotes ??= [];
      db.customerQuotes.unshift({
        id: nextLocalId(db), customerId: selected.id, itemId: item.id,
        quoteDate: quoteDraft.quoteDate, operatorName: "本機測試使用者",
        tiers: [{ quantity: quoteDraft.quantity, unit: quoteDraft.unit.trim(), unitPrice: quoteDraft.unitPrice }],
        note: quoteDraft.note.trim() || null, correctedFromId: quoteDraft.correctedFromId,
        revision: 1, createdAt: timestampNow(),
      });
    });
    setQuoteDraft(null);
  }

  function correctQuote(quote: LocalCustomerQuote) {
    const tier = quote.tiers[0];
    setQuoteDraft({
      correctedFromId: quote.id,
      itemId: quote.itemId,
      quoteDate: dateToday(),
      quantity: tier?.quantity ?? 1,
      unit: tier?.unit ?? database.items.find((row) => row.id === quote.itemId)?.baseUnit ?? "個",
      unitPrice: tier?.unitPrice ?? 0,
      note: quote.note ?? "",
    });
  }

  function addFrequentItem(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if ((frequentItemId == null) === !frequentText.trim()) {
      window.alert("請選擇正式商品，或輸入未建檔品項；兩者擇一。");
      return;
    }
    mutateLocalDatabase("customer.frequent_item.created", `新增常用商品：${selected.name}`, (db) => {
      db.customerFrequentItems ??= [];
      db.customerFrequentItems.push({
        id: nextLocalId(db), customerId: selected.id,
        itemId: frequentItemId, freeText: frequentItemId == null ? frequentText.trim() : null,
        note: null, createdAt: timestampNow(),
      });
    });
    setFrequentItemId(null);
    setFrequentText("");
  }

  function removeFrequent(row: LocalCustomerFrequentItem) {
    if (!selected) return;
    mutateLocalDatabase("customer.frequent_item.removed", `移除常用商品：${selected.name}`, (db) => {
      db.customerFrequentItems = (db.customerFrequentItems ?? []).filter((item) => item.id !== row.id);
    });
  }

  const activity = selected
    ? database.audit.filter((event) => event.summary.includes(selected.name)).slice(0, 30)
    : [];

  return (
    <div className="cy-customer-op">
      <div className="cy-op-page-header cy-customer-page-header">
        <div>
          <h1>客戶</h1>
          <p>同一個正式操作介面直接測主檔、聯絡資料、拜訪、報價與常用商品；資料目前保存在此瀏覽器。</p>
        </div>
        <div className="cy-op-page-actions"><button className="cy-op-button primary" onClick={startCreate}>新增客戶</button></div>
      </div>

      <div className="cy-customer-workspace">
        <section className="cy-op-panel cy-customer-search-pane">
          <div className="cy-customer-search-controls">
            <input className="cy-op-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋編號、名稱、統編、電話、聯絡人" />
            <div className="cy-customer-filter-row">
              <select className="cy-op-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">全部分類</option>
                {database.settings.customerCategories.map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className="cy-op-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">全部狀態</option><option value="active">使用中</option><option value="inactive">已停用</option>
              </select>
            </div>
            <div className="cy-customer-result-count">搜尋結果 {rows.length} 筆</div>
          </div>
          <div className="cy-op-list cy-customer-result-list">
            {rows.map((customer) => (
              <button key={customer.id} className={`cy-customer-result-row ${selectedId === customer.id ? "active" : ""}`} onClick={() => selectCustomer(customer.id)}>
                <div className="cy-customer-result-main"><strong>{customer.name}</strong><span>{customer.customerNo ?? "尚無 ERP 編號"}</span></div>
                <span className="cy-customer-result-region">{customer.region ?? customer.address?.match(/^(..市|..縣)/)?.[0] ?? "—"}</span>
                <span className={`cy-customer-result-status ${customer.isActive ? "" : "inactive"}`}>{customer.isActive ? customer.status : "已停用"}</span>
              </button>
            ))}
            {rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的客戶。</div> : null}
          </div>
        </section>

        <section className="cy-op-panel cy-customer-detail-pane">
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={saveCustomer}>
              <div className="cy-op-panel-header cy-customer-edit-header">
                <div><h2>{creating ? "新增客戶" : `修改 ${selected?.name ?? "客戶"}`}</h2><p>{creating ? "ERP 客戶編號可先留空" : "既有 ERP 客戶編號請用受控動作更正"}</p></div>
                <div className="cy-customer-inline-actions"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div>
              </div>
              <div className="cy-customer-form-body">
                <div className="cy-op-form-grid">
                  <label>客戶名稱<input className="cy-op-input" value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} required /></label>
                  <label>ERP 客戶編號<input className="cy-op-input" value={creating ? draft.customerNo ?? "" : selected?.customerNo ?? ""} onChange={(e) => creating && patchDraft({ customerNo: e.target.value || null })} disabled={!creating} placeholder="可稍後回填" /></label>
                  <label>簡稱<input className="cy-op-input" value={draft.shortName ?? ""} onChange={(e) => patchDraft({ shortName: e.target.value || null })} /></label>
                  <label>統編<input className="cy-op-input" value={draft.taxId ?? ""} onChange={(e) => patchDraft({ taxId: e.target.value || null })} /></label>
                  <label>地區<input className="cy-op-input" value={draft.region ?? ""} onChange={(e) => patchDraft({ region: e.target.value || null })} placeholder="例如：高雄市" /></label>
                  <label>分類<select className="cy-op-input" value={draft.category} onChange={(e) => patchDraft({ category: e.target.value })}>{database.settings.customerCategories.map((value) => <option key={value}>{value}</option>)}</select></label>
                  <label>狀態<select className="cy-op-input" value={draft.status} onChange={(e) => patchDraft({ status: e.target.value })}>{database.settings.customerStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
                </div>

                <EditableRows title="電話" addLabel="增加電話" onAdd={addPhone}>
                  {draft.phones.map((row, index) => <div className="cy-customer-edit-row phone" key={row.id}><input className="cy-op-input" placeholder="電話" value={row.phone} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, phone: e.target.value } : item) })} /><input className="cy-op-input" placeholder="標籤" value={row.label ?? ""} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, label: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="分機" value={row.extension ?? ""} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, extension: e.target.value || null } : item) })} /><button type="button" className="cy-op-button danger" onClick={() => patchDraft({ phones: draft.phones.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="聯絡人" addLabel="增加聯絡人" onAdd={addContact}>
                  {draft.contacts.map((row, index) => <div className="cy-customer-edit-row contact" key={row.id}><input className="cy-op-input" placeholder="姓名" value={row.name} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /><input className="cy-op-input" placeholder="職稱" value={row.title ?? ""} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, title: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="電話" value={row.phone ?? ""} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, phone: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="手機" value={row.mobile ?? ""} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, mobile: e.target.value || null } : item) })} /><button type="button" className="cy-op-button danger" onClick={() => patchDraft({ contacts: draft.contacts.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="地址" addLabel="增加地址" onAdd={addAddress}>
                  {draft.addresses.map((row, index) => <div className="cy-customer-edit-row address" key={row.id}><input className="cy-op-input" placeholder="標籤" value={row.label ?? ""} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, label: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="郵遞區號" value={row.postalCode ?? ""} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, postalCode: e.target.value || null } : item) })} /><input className="cy-op-input grow" placeholder="地址" value={row.address} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, address: e.target.value } : item) })} /><button type="button" className="cy-op-button danger" onClick={() => patchDraft({ addresses: draft.addresses.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="重要備註" addLabel="增加備註" onAdd={addImportantNote}>
                  {draft.importantNotes.map((row, index) => <div className="cy-customer-edit-row note" key={row.id}><textarea className="cy-op-input" rows={2} value={row.content} onChange={(e) => patchDraft({ importantNotes: draft.importantNotes.map((item, i) => i === index ? { ...item, content: e.target.value } : item) })} /><button type="button" className="cy-op-button danger" onClick={() => patchDraft({ importantNotes: draft.importantNotes.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>
              </div>
              <div className="cy-op-form-footer cy-customer-form-footer"><button type="button" className="cy-op-button" onClick={cancelEdit}>取消</button><button className="cy-op-button primary">儲存</button></div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-op-panel-header cy-customer-detail-header">
                <div><h2>{selected.name}</h2><p>{selected.customerNo ?? "尚未建立 ERP 客戶編號"} · rev.{selected.revision}</p></div>
                <div className="cy-customer-action-stack"><button className="cy-op-button primary" onClick={startEdit}>修改</button><button className={`cy-op-button ${selected.isActive ? "danger" : ""}`} onClick={lifecycleAction}>{hasBusinessUse(selected.id) ? (selected.isActive ? "停用" : "啟用") : "刪除"}</button></div>
              </div>
              <div className="cy-customer-detail-body">
                <section className="cy-customer-profile-grid">
                  <InfoCard title="基本資料"><Info label="簡稱" value={selected.shortName} /><Info label="統編" value={selected.taxId} /><Info label="地區" value={selected.region} /><Info label="分類" value={selected.category} /><Info label="狀態" value={selected.isActive ? selected.status : "已停用"} /><div className="cy-customer-number-row"><Info label="ERP 客戶編號" value={selected.customerNo} /><button className="cy-op-button compact" onClick={setCustomerNumber}>{selected.customerNo ? "更正" : "回填"}</button></div></InfoCard>
                  <InfoCard title="聯絡方式">{customerPhones(selected).length ? customerPhones(selected).filter((row) => row.isActive).map((row) => <Info key={row.id} label={row.label ?? "電話"} value={`${row.phone}${row.extension ? ` #${row.extension}` : ""}`} />) : <p className="cy-customer-muted">尚無電話</p>}{customerContacts(selected).filter((row) => row.isActive).map((row) => <Info key={row.id} label={row.title ?? "聯絡人"} value={`${row.name}${row.mobile ? ` · ${row.mobile}` : row.phone ? ` · ${row.phone}` : ""}`} />)}</InfoCard>
                  <InfoCard title="地址">{customerAddresses(selected).filter((row) => row.isActive).map((row) => <Info key={row.id} label={row.label ?? "地址"} value={`${row.postalCode ? `${row.postalCode} ` : ""}${row.address}`} />)}{!customerAddresses(selected).length ? <p className="cy-customer-muted">尚無地址</p> : null}</InfoCard>
                  <InfoCard title="重要備註">{customerImportantNotes(selected).filter((row) => row.isActive).map((row) => <p className="cy-customer-important-note" key={row.id}>{row.content}</p>)}{!customerImportantNotes(selected).length ? <p className="cy-customer-muted">尚無重要備註</p> : null}</InfoCard>
                </section>

                <section className="cy-customer-related">
                  <div className="cy-customer-related-tabs">{(["visits", "quotes", "frequent", "activity"] as RelatedTab[]).map((tab) => <button key={tab} className={relatedTab === tab ? "active" : ""} onClick={() => { setRelatedTab(tab); setVisitDraft(null); setQuoteDraft(null); }}>{tab === "visits" ? "拜訪紀錄" : tab === "quotes" ? "報價紀錄" : tab === "frequent" ? "常用商品" : "動態／歷史"}</button>)}</div>
                  {relatedTab === "visits" ? <VisitsPanel selected={selected} visits={visits} draft={visitDraft} setDraft={setVisitDraft} save={saveVisit} edit={editVisit} remove={deleteVisit} /> : null}
                  {relatedTab === "quotes" ? <QuotesPanel database={database} quotes={quotes} draft={quoteDraft} setDraft={setQuoteDraft} save={saveQuote} correct={correctQuote} /> : null}
                  {relatedTab === "frequent" ? <FrequentPanel database={database} rows={frequentItems} itemId={frequentItemId} setItemId={setFrequentItemId} freeText={frequentText} setFreeText={setFrequentText} add={addFrequentItem} remove={removeFrequent} /> : null}
                  {relatedTab === "activity" ? <div className="cy-customer-related-content"><h3>重要操作</h3>{activity.length ? activity.map((event) => <div className="cy-customer-activity" key={event.id}><strong>{event.summary}</strong><span>{new Date(event.at).toLocaleString()}</span></div>) : <p className="cy-customer-muted">尚無可顯示的重要操作。</p>}</div> : null}
                </section>
              </div>
            </div>
          ) : <div className="cy-op-empty">請從左側選擇客戶，或新增一筆客戶。</div>}
        </section>
      </div>
    </div>
  );
}

function EditableRows({ title, addLabel, onAdd, children }: { title: string; addLabel: string; onAdd: () => void; children: React.ReactNode }) {
  return <section className="cy-customer-edit-section"><div className="cy-customer-edit-section-head"><h3>{title}</h3><button type="button" className="cy-op-button" onClick={onAdd}>＋ {addLabel}</button></div><div className="cy-customer-edit-rows">{children}</div></section>;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="cy-customer-info-card"><h3>{title}</h3><div className="cy-customer-info-list">{children}</div></div>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="cy-customer-info"><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function VisitsPanel({ selected, visits, draft, setDraft, save, edit, remove }: {
  selected: LocalCustomer; visits: LocalCustomerVisit[]; draft: VisitDraft | null;
  setDraft: (value: VisitDraft | null) => void; save: (event: FormEvent) => void;
  edit: (visit: LocalCustomerVisit) => void; remove: (visit: LocalCustomerVisit) => void;
}) {
  const contacts = customerContacts(selected).filter((row) => row.isActive);
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>拜訪紀錄</h3><button className="cy-op-button primary" onClick={() => setDraft(emptyVisit())}>新增拜訪</button></div>{draft ? <form className="cy-customer-related-form" onSubmit={save}><label>日期<input className="cy-op-input" type="date" value={draft.visitDate} onChange={(e) => setDraft({ ...draft, visitDate: e.target.value })} /></label><label>聯絡人<select className="cy-op-input" value={draft.contactId ?? ""} onChange={(e) => setDraft({ ...draft, contactId: e.target.value ? Number(e.target.value) : null })}><option value="">自由輸入</option>{contacts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{draft.contactId == null ? <label>拜訪對象<input className="cy-op-input" value={draft.contactText} onChange={(e) => setDraft({ ...draft, contactText: e.target.value })} /></label> : null}<label className="wide">內容<textarea className="cy-op-input" rows={3} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} required /></label><div className="cy-customer-related-form-actions"><button type="button" className="cy-op-button" onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary">儲存</button></div></form> : null}<div className="cy-customer-timeline">{visits.map((visit) => <div className="cy-customer-visit" key={visit.id}><div><strong>{visit.visitDate} · {visit.contactNameSnapshot ?? visit.contactText ?? "未指定對象"}</strong><p>{visit.content}</p><span>{visit.operatorName} · rev.{visit.revision}</span></div><div className="cy-customer-row-actions"><button className="cy-op-button compact" onClick={() => edit(visit)}>修改</button><button className="cy-op-button compact danger" onClick={() => remove(visit)}>刪除</button></div></div>)}{visits.length === 0 ? <p className="cy-customer-muted">尚無拜訪紀錄。</p> : null}</div></div>;
}

function QuotesPanel({ database, quotes, draft, setDraft, save, correct }: {
  database: ReturnType<typeof useLocalDatabase>; quotes: LocalCustomerQuote[]; draft: QuoteDraft | null;
  setDraft: (value: QuoteDraft | null) => void; save: (event: FormEvent) => void; correct: (quote: LocalCustomerQuote) => void;
}) {
  function startNew() {
    const first = database.items.find((row) => row.isActive);
    setDraft({ ...emptyQuote(), itemId: first?.id ?? null, unit: first?.baseUnit ?? "個" });
  }
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>報價紀錄</h3><button className="cy-op-button primary" onClick={startNew}>新增報價</button></div>{draft ? <form className="cy-customer-related-form quote" onSubmit={save}><label>日期<input className="cy-op-input" type="date" value={draft.quoteDate} onChange={(e) => setDraft({ ...draft, quoteDate: e.target.value })} /></label><label>商品<select className="cy-op-input" value={draft.itemId ?? ""} onChange={(e) => { const id = Number(e.target.value); const item = database.items.find((row) => row.id === id); setDraft({ ...draft, itemId: id, unit: item?.baseUnit ?? draft.unit }); }}>{database.items.filter((row) => row.isActive).map((row) => <option value={row.id} key={row.id}>{row.itemNo} · {row.name}</option>)}</select></label><label>數量<input className="cy-op-input" type="number" min="0.0001" step="0.0001" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} /></label><label>單位<input className="cy-op-input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label><label>單價<input className="cy-op-input" type="number" min="0" step="0.0001" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })} /></label><label className="wide">備註<input className="cy-op-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label><div className="cy-customer-related-form-actions"><button type="button" className="cy-op-button" onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary">{draft.correctedFromId ? "建立修正紀錄" : "儲存報價"}</button></div></form> : null}<div className="cy-customer-quote-list">{quotes.map((quote) => { const item = database.items.find((row) => row.id === quote.itemId); return <div className="cy-customer-quote" key={quote.id}><div><strong>{quote.quoteDate} · {item?.itemNo ?? "?"} {item?.name ?? "商品"}</strong>{quote.tiers.map((tier, index) => <p key={index}>{tier.quantity} {tier.unit} · 單價 {tier.unitPrice}</p>)}<span>{quote.operatorName}{quote.correctedFromId ? ` · 修正 #${quote.correctedFromId}` : ""}</span></div><button className="cy-op-button compact" onClick={() => correct(quote)}>修正紀錄</button></div>; })}{quotes.length === 0 ? <p className="cy-customer-muted">尚無報價紀錄。</p> : null}</div></div>;
}

function FrequentPanel({ database, rows, itemId, setItemId, freeText, setFreeText, add, remove }: {
  database: ReturnType<typeof useLocalDatabase>; rows: LocalCustomerFrequentItem[]; itemId: number | null;
  setItemId: (value: number | null) => void; freeText: string; setFreeText: (value: string) => void;
  add: (event: FormEvent) => void; remove: (row: LocalCustomerFrequentItem) => void;
}) {
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>常用商品</h3></div><form className="cy-customer-frequent-form" onSubmit={add}><select className="cy-op-input" value={itemId ?? ""} onChange={(e) => { setItemId(e.target.value ? Number(e.target.value) : null); if (e.target.value) setFreeText(""); }}><option value="">未建檔品項</option>{database.items.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}</option>)}</select><input className="cy-op-input" placeholder="選未建檔品項時輸入名稱" value={freeText} disabled={itemId != null} onChange={(e) => setFreeText(e.target.value)} /><button className="cy-op-button primary">加入</button></form><div className="cy-customer-frequent-list">{rows.map((row) => { const item = row.itemId ? database.items.find((record) => record.id === row.itemId) : null; return <div className="cy-customer-frequent-row" key={row.id}><div><strong>{item ? `${item.itemNo} · ${item.name}` : row.freeText}</strong><span>{item ? "正式商品" : "未建檔自由文字"}</span></div><button className="cy-op-button compact danger" onClick={() => remove(row)}>移除</button></div>; })}{rows.length === 0 ? <p className="cy-customer-muted">尚無常用商品。</p> : null}</div></div>;
}
