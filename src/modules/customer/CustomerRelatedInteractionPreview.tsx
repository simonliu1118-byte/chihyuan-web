import { useMemo, useReducer, useState } from "react";
import {
  createEditableListRow,
  createEditableListState,
  editableListReducer,
  serializeEditableList,
} from "../../ui/foundation/editable-list";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { ToastRegion } from "../../ui/feedback/ToastRegion";
import { useToastQueue } from "../../ui/feedback/useToastQueue";
import { ConfirmDialog } from "../../ui/overlays/ConfirmDialog";
import { Drawer } from "../../ui/overlays/Dialog";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
import { Button } from "../../ui/primitives/Button";
import { Notice } from "../../ui/primitives/Notice";
import { SelectField } from "../../ui/primitives/SelectField";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { TextArea } from "../../ui/primitives/TextArea";
import { TextInput } from "../../ui/primitives/TextInput";
import { RelatedRecordPanel, type RelatedRecordTab } from "../../ui/related/RelatedRecordPanel";

export type CustomerRelatedInteractionKey = "visits" | "quotes" | "frequent" | "history";

type CustomerOption = {
  id: number;
  name: string;
  no: string;
};

type ContactOption = {
  id: number;
  name: string;
};

type EmployeeOption = {
  id: number;
  name: string;
};

type ItemOption = {
  id: number;
  itemNo: string;
  name: string;
  spec: string;
};

type VisitRecord = {
  id: number;
  date: string;
  contactId: number | null;
  person: string;
  employeeId: number;
  employee: string;
  content: string;
  revision: number;
};

type QuoteBreak = {
  quantity: string;
  unit: string;
  price: string;
  note: string;
};

type QuoteRecord = {
  id: number;
  date: string;
  item: ItemOption;
  employeeId: number;
  employee: string;
  breaks: readonly QuoteBreak[];
  revision: number;
  corrected?: boolean;
};

type FrequentDraft = {
  id: number;
  kind: "formal" | "free-text";
  item: ItemOption | null;
  customName: string;
  category: string;
  updatedAt: string;
};

type VisitDraft = {
  date: string;
  contactId: string;
  person: string;
  employeeId: string;
  content: string;
};

type QuoteHeaderDraft = {
  date: string;
  item: ItemOption | null;
  employeeId: string;
  correctionReason: string;
};

type EditorState =
  | { kind: "visit"; mode: "create" | "edit"; visitId: number | null; draft: VisitDraft; baseline: string }
  | { kind: "quote"; mode: "create" | "correct"; quoteId: number | null; draft: QuoteHeaderDraft; baseline: string }
  | { kind: "frequent"; baseline: string }
  | null;

const relatedTabs: readonly RelatedRecordTab<CustomerRelatedInteractionKey>[] = [
  { key: "visits", label: "拜訪紀錄" },
  { key: "quotes", label: "報價紀錄" },
  { key: "frequent", label: "常用商品" },
  { key: "history", label: "動態 / 歷史" },
];

export const relatedInteractionCustomers: readonly CustomerOption[] = [
  { id: 1, name: "示範中醫診所", no: "C-00128" },
  { id: 2, name: "測試養生館", no: "尚無 ERP 編號" },
  { id: 3, name: "範例診所", no: "C-00041" },
];

const employees: readonly EmployeeOption[] = [
  { id: 1, name: "王○○" },
  { id: 2, name: "李○○" },
];

const contactsByCustomer: Record<number, readonly ContactOption[]> = {
  1: [
    { id: 11, name: "林小姐" },
    { id: 12, name: "陳先生" },
  ],
  2: [{ id: 21, name: "黃小姐" }],
  3: [],
};

const itemOptions: readonly ItemOption[] = [
  { id: 101, itemNo: "A-01021", name: "示範針灸針", spec: "0.25 × 25 mm" },
  { id: 102, itemNo: "A-00405", name: "示範棉球", spec: "中包裝" },
  { id: 103, itemNo: "A-00818", name: "示範彈性繃帶", spec: "7.5 cm" },
  { id: 104, itemNo: "A-01103", name: "示範網套", spec: "中型" },
];

const initialVisits: Record<number, readonly VisitRecord[]> = {
  1: [
    { id: 1, date: "2026-09-24", contactId: 11, person: "林小姐", employeeId: 1, employee: "王○○", content: "確認下月耗材需求，針灸針與棉球用量預計增加。", revision: 1 },
    { id: 2, date: "2026-08-28", contactId: 12, person: "陳先生", employeeId: 1, employee: "王○○", content: "例行拜訪；提醒月底前會先寄對帳資料。", revision: 1 },
    { id: 3, date: "2026-07-15", contactId: null, person: "院長", employeeId: 2, employee: "李○○", content: "詢問新品規格，後續以電話補充尺寸資訊。", revision: 1 },
  ],
  2: [
    { id: 4, date: "2026-09-18", contactId: 21, person: "黃小姐", employeeId: 2, employee: "李○○", content: "初次接觸，先記錄常用品項，尚未建立 SMART ERP 客戶編號。", revision: 1 },
  ],
  3: [],
};

const initialQuotes: Record<number, readonly QuoteRecord[]> = {
  1: [
    {
      id: 101,
      date: "2026-09-20",
      item: itemOptions[0],
      employeeId: 1,
      employee: "王○○",
      breaks: [
        { quantity: "10", unit: "盒", price: "95", note: "" },
        { quantity: "50", unit: "盒", price: "90", note: "" },
        { quantity: "100", unit: "盒", price: "86", note: "" },
      ],
      revision: 1,
    },
    {
      id: 102,
      date: "2026-06-11",
      item: itemOptions[0],
      employeeId: 2,
      employee: "李○○",
      breaks: [
        { quantity: "10", unit: "盒", price: "98", note: "" },
        { quantity: "50", unit: "盒", price: "92", note: "" },
      ],
      revision: 1,
    },
    {
      id: 103,
      date: "2026-05-03",
      item: itemOptions[1],
      employeeId: 1,
      employee: "王○○",
      breaks: [{ quantity: "20", unit: "包", price: "65", note: "" }],
      revision: 1,
    },
  ],
  2: [],
  3: [],
};

const initialFrequent: Record<number, readonly FrequentDraft[]> = {
  1: [
    { id: 201, kind: "formal", item: itemOptions[0], customName: "", category: "", updatedAt: "2026-09-24T08:00:00Z" },
    { id: 202, kind: "formal", item: itemOptions[1], customName: "", category: "", updatedAt: "2026-09-24T08:01:00Z" },
    { id: 203, kind: "free-text", item: null, customName: "院內自用特殊網套", category: "未建檔／客戶情報", updatedAt: "2026-09-24T08:02:00Z" },
  ],
  2: [
    { id: 204, kind: "free-text", item: null, customName: "特殊尺寸洞巾", category: "未建檔／需求追蹤", updatedAt: "2026-09-18T08:00:00Z" },
  ],
  3: [],
};

function employeeName(id: number): string {
  return employees.find((employee) => employee.id === id)?.name ?? "未指定";
}

async function searchPreviewItems(query: string, signal: AbortSignal): Promise<readonly ItemOption[]> {
  if (signal.aborted) return [];
  const normalized = query.trim().toLocaleLowerCase();
  return itemOptions.filter((item) =>
    `${item.itemNo} ${item.name} ${item.spec}`.toLocaleLowerCase().includes(normalized),
  );
}

function quoteRow(key: string, value: QuoteBreak) {
  return createEditableListRow<QuoteBreak>(key, value);
}

function frequentRow(value: FrequentDraft) {
  return createEditableListRow<FrequentDraft>(`frequent-${value.id}`, value);
}

function nextId(records: readonly { id: number }[], floor: number): number {
  return Math.max(floor, ...records.map((record) => record.id)) + 1;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="cy-customer-related-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export interface CustomerRelatedInteractionPreviewProps {
  customerId: number;
  activeKey: CustomerRelatedInteractionKey;
  onChange: (key: CustomerRelatedInteractionKey) => void;
}

export function CustomerRelatedInteractionPreview({
  customerId,
  activeKey,
  onChange,
}: CustomerRelatedInteractionPreviewProps) {
  const [visits, setVisits] = useState<Record<number, readonly VisitRecord[]>>(initialVisits);
  const [quotes, setQuotes] = useState<Record<number, readonly QuoteRecord[]>>(initialQuotes);
  const [frequentItems, setFrequentItems] = useState<Record<number, readonly FrequentDraft[]>>(initialFrequent);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [visitDeleteId, setVisitDeleteId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [quoteBreaks, dispatchQuoteBreaks] = useReducer(
    editableListReducer<QuoteBreak>,
    createEditableListState<QuoteBreak>(),
  );
  const [frequentRows, dispatchFrequentRows] = useReducer(
    editableListReducer<FrequentDraft>,
    createEditableListState<FrequentDraft>(),
  );
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const customerVisits = visits[customerId] ?? [];
  const customerQuotes = quotes[customerId] ?? [];
  const customerFrequent = frequentItems[customerId] ?? [];
  const contacts = contactsByCustomer[customerId] ?? [];

  const editorDirty = useMemo(() => {
    if (!editor) return false;
    if (editor.kind === "visit") return JSON.stringify(editor.draft) !== editor.baseline;
    if (editor.kind === "quote") {
      return JSON.stringify(editor.draft) !== editor.baseline || quoteBreaks.dirty;
    }
    return frequentRows.dirty;
  }, [editor, frequentRows.dirty, quoteBreaks.dirty]);

  useUnsavedChangesGuard({ active: editorDirty });

  function requestCloseEditor() {
    if (editorDirty) {
      setPendingClose(true);
      return;
    }
    setEditor(null);
    setFormErrors({});
  }

  function forceCloseEditor() {
    setPendingClose(false);
    setEditor(null);
    setFormErrors({});
  }

  function openVisitCreate() {
    const draft: VisitDraft = {
      date: "2026-09-27",
      contactId: "",
      person: "",
      employeeId: "1",
      content: "",
    };
    setFormErrors({});
    setEditor({ kind: "visit", mode: "create", visitId: null, draft, baseline: JSON.stringify(draft) });
  }

  function openVisitEdit(visit: VisitRecord) {
    const draft: VisitDraft = {
      date: visit.date,
      contactId: visit.contactId == null ? "" : String(visit.contactId),
      person: visit.person,
      employeeId: String(visit.employeeId),
      content: visit.content,
    };
    setFormErrors({});
    setEditor({ kind: "visit", mode: "edit", visitId: visit.id, draft, baseline: JSON.stringify(draft) });
  }

  function changeVisitDraft<K extends keyof VisitDraft>(key: K, value: VisitDraft[K]) {
    setEditor((current) => current?.kind === "visit"
      ? { ...current, draft: { ...current.draft, [key]: value } }
      : current);
    setFormErrors((current) => ({ ...current, [key]: "" }));
  }

  function saveVisit() {
    if (!editor || editor.kind !== "visit") return;
    const errors: Record<string, string> = {};
    if (!editor.draft.date) errors.date = "請選擇拜訪日期。";
    if (!editor.draft.content.trim()) errors.content = "請輸入拜訪內容。";
    if (!editor.draft.person.trim() && !editor.draft.contactId) errors.person = "請選擇聯絡人或輸入當時拜訪對象。";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const contactId = editor.draft.contactId ? Number(editor.draft.contactId) : null;
    const selectedContact = contacts.find((contact) => contact.id === contactId) ?? null;
    const person = editor.draft.person.trim() || selectedContact?.name || "";
    const employeeId = Number(editor.draft.employeeId);

    if (editor.mode === "create") {
      const created: VisitRecord = {
        id: nextId(customerVisits, 100),
        date: editor.draft.date,
        contactId,
        person,
        employeeId,
        employee: employeeName(employeeId),
        content: editor.draft.content.trim(),
        revision: 1,
      };
      setVisits((current) => ({ ...current, [customerId]: [created, ...customerVisits] }));
      pushToast({ tone: "success", title: "已新增拜訪（預覽）", message: "目前只更新瀏覽器內的示範資料。" });
    } else {
      const id = editor.visitId;
      setVisits((current) => ({
        ...current,
        [customerId]: customerVisits.map((visit) => visit.id === id
          ? {
              ...visit,
              date: editor.draft.date,
              contactId,
              person,
              employeeId,
              employee: employeeName(employeeId),
              content: editor.draft.content.trim(),
              revision: visit.revision + 1,
            }
          : visit),
      }));
      pushToast({ tone: "success", title: "已更新拜訪（預覽）", message: "正式版會以 revision 防止覆蓋他人的新修改。" });
    }
    forceCloseEditor();
  }

  function confirmDeleteVisit() {
    if (visitDeleteId == null) return;
    setVisits((current) => ({
      ...current,
      [customerId]: customerVisits.filter((visit) => visit.id !== visitDeleteId),
    }));
    setVisitDeleteId(null);
    pushToast({ tone: "warning", title: "已刪除拜訪（預覽）", message: "正式版會在同一個交易中寫入刪除 Audit。" });
  }

  function openQuoteCreate() {
    const draft: QuoteHeaderDraft = {
      date: "2026-09-27",
      item: null,
      employeeId: "1",
      correctionReason: "",
    };
    dispatchQuoteBreaks({
      type: "load",
      rows: [quoteRow(`quote-break-${crypto.randomUUID()}`, { quantity: "", unit: "盒", price: "", note: "" })],
    });
    setFormErrors({});
    setEditor({ kind: "quote", mode: "create", quoteId: null, draft, baseline: JSON.stringify(draft) });
  }

  function openQuoteCorrection(quote: QuoteRecord) {
    const draft: QuoteHeaderDraft = {
      date: quote.date,
      item: quote.item,
      employeeId: String(quote.employeeId),
      correctionReason: "",
    };
    dispatchQuoteBreaks({
      type: "load",
      rows: quote.breaks.map((row, index) => quoteRow(`quote-${quote.id}-break-${index}`, { ...row })),
    });
    setFormErrors({});
    setEditor({ kind: "quote", mode: "correct", quoteId: quote.id, draft, baseline: JSON.stringify(draft) });
  }

  function changeQuoteDraft<K extends keyof QuoteHeaderDraft>(key: K, value: QuoteHeaderDraft[K]) {
    setEditor((current) => current?.kind === "quote"
      ? { ...current, draft: { ...current.draft, [key]: value } }
      : current);
    setFormErrors((current) => ({ ...current, [key]: "" }));
  }

  function saveQuote() {
    if (!editor || editor.kind !== "quote") return;
    const errors: Record<string, string> = {};
    if (!editor.draft.date) errors.date = "請選擇報價日期。";
    if (!editor.draft.item) errors.item = "請明確選擇正式商品。";
    if (quoteBreaks.rows.length === 0) errors.breaks = "至少需要一個數量／單價級距。";

    const breaks = serializeEditableList(quoteBreaks).map((row, index) => ({
      quantity: row.quantity.trim(),
      unit: row.unit.trim(),
      price: row.price.trim(),
      note: row.note.trim(),
      index,
    }));
    for (const row of breaks) {
      const quantity = Number(row.quantity);
      const price = Number(row.price);
      if (!row.quantity || !Number.isFinite(quantity) || quantity <= 0) errors[`break-${row.index}`] = "數量必須大於 0。";
      if (!row.unit) errors[`break-${row.index}`] = "請輸入單位。";
      if (!row.price || !Number.isFinite(price) || price < 0) errors[`break-${row.index}`] = "單價必須為 0 以上。";
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const item = editor.draft.item;
    if (!item) return;
    const employeeId = Number(editor.draft.employeeId);
    const savedBreaks = breaks.map(({ index: _index, ...row }) => row);

    if (editor.mode === "create") {
      const created: QuoteRecord = {
        id: nextId(customerQuotes, 200),
        date: editor.draft.date,
        item,
        employeeId,
        employee: employeeName(employeeId),
        breaks: savedBreaks,
        revision: 1,
      };
      setQuotes((current) => ({ ...current, [customerId]: [created, ...customerQuotes] }));
      pushToast({ tone: "success", title: "已新增報價紀錄（預覽）", message: "新的商業價格會建立新歷史，不覆蓋舊報價。" });
    } else {
      const quoteId = editor.quoteId;
      setQuotes((current) => ({
        ...current,
        [customerId]: customerQuotes.map((quote) => quote.id === quoteId
          ? {
              ...quote,
              date: editor.draft.date,
              item,
              employeeId,
              employee: employeeName(employeeId),
              breaks: savedBreaks,
              revision: quote.revision + 1,
              corrected: true,
            }
          : quote),
      }));
      pushToast({
        tone: "warning",
        title: "已修正既有報價（預覽）",
        message: editor.draft.correctionReason.trim()
          ? `正式版會保留修正前後內容與原因：${editor.draft.correctionReason.trim()}`
          : "正式版會在同一個交易中保留修正前後 Audit。",
      });
    }
    forceCloseEditor();
  }

  function openFrequentEditor() {
    dispatchFrequentRows({ type: "load", rows: customerFrequent.map(frequentRow) });
    setFormErrors({});
    setEditor({ kind: "frequent", baseline: JSON.stringify(customerFrequent) });
  }

  function saveFrequent() {
    if (!editor || editor.kind !== "frequent") return;
    const errors: Record<string, string> = {};
    frequentRows.rows.forEach((row, index) => {
      if (row.value.kind === "formal" && !row.value.item) errors[`frequent-${index}`] = "正式商品必須明確選取商品。";
      if (row.value.kind === "free-text" && !row.value.customName.trim()) errors[`frequent-${index}`] = "未建檔項目必須輸入名稱。";
    });
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const saved = serializeEditableList(frequentRows).map((row, index) => ({
      ...row,
      item: row.kind === "formal" ? row.item : null,
      customName: row.kind === "free-text" ? row.customName.trim() : "",
      category: row.kind === "free-text" ? row.category.trim() : "",
      updatedAt: `2026-09-27T06:${String(40 + index).padStart(2, "0")}:00Z`,
    }));
    setFrequentItems((current) => ({ ...current, [customerId]: saved }));
    pushToast({ tone: "success", title: "已更新常用商品（預覽）", message: "自由文字不會因名稱相同而自動變成正式商品。" });
    forceCloseEditor();
  }

  function renderVisits() {
    if (customerVisits.length === 0) {
      return (
        <div className="cy-customer-related-layout">
          <div className="cy-customer-related-heading">
            <div><strong>最近拜訪</strong><span>以拜訪日期由新到舊顯示。</span></div>
            <Button type="button" tone="secondary" size="small" onClick={openVisitCreate}>新增拜訪</Button>
          </div>
          <EmptyState title="尚無拜訪紀錄" description="可直接新增第一筆拜訪。" />
        </div>
      );
    }

    return (
      <div className="cy-customer-related-layout">
        <div className="cy-customer-related-heading">
          <div>
            <strong>最近拜訪</strong>
            <span>人物名稱保留拜訪當時快照；後續聯絡人改名不會改寫歷史。</span>
          </div>
          <Button type="button" tone="secondary" size="small" onClick={openVisitCreate}>新增拜訪</Button>
        </div>
        <div className="cy-customer-visit-list">
          {customerVisits.map((visit) => (
            <article className="cy-customer-visit-row" key={visit.id}>
              <time>{visit.date}</time>
              <div className="cy-customer-visit-marker" aria-hidden="true" />
              <div className="cy-customer-visit-body">
                <div className="cy-customer-visit-meta">
                  <strong>{visit.person}</strong>
                  <span>記錄：{visit.employee}</span>
                  <span>rev. {visit.revision}</span>
                </div>
                <p>{visit.content}</p>
                <div className="cy-customer-related-row-actions">
                  <Button type="button" tone="quiet" size="small" onClick={() => openVisitEdit(visit)}>修改</Button>
                  <Button type="button" tone="quiet" size="small" onClick={() => setVisitDeleteId(visit.id)}>刪除</Button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="cy-customer-related-footnote">正式版新增／修改會走受保護 API；刪除會連同 Audit 在同一個 D1 交易完成。</div>
      </div>
    );
  }

  function renderQuotes() {
    return (
      <div className="cy-customer-related-layout">
        <div className="cy-customer-related-heading">
          <div>
            <strong>報價歷史</strong>
            <span>新的價格用「新增報價紀錄」；只有資料輸入錯誤才使用「修正紀錄」。</span>
          </div>
          <Button type="button" tone="secondary" size="small" onClick={openQuoteCreate}>新增報價紀錄</Button>
        </div>
        {customerQuotes.length === 0 ? (
          <EmptyState title="尚無報價紀錄" description="新增後會保留成獨立的客戶＋商品價格歷史。" />
        ) : (
          <div className="cy-customer-quote-list">
            {customerQuotes.map((quote, index) => (
              <article className="cy-customer-quote-card" key={quote.id}>
                <header>
                  <div>
                    <div className="cy-customer-quote-title">
                      <strong>{quote.item.name}</strong>
                      {index === 0 ? <StatusChip tone="success">較新</StatusChip> : null}
                      {quote.corrected ? <StatusChip tone="warning">曾修正</StatusChip> : null}
                    </div>
                    <span>{quote.item.itemNo} · {quote.item.spec}</span>
                  </div>
                  <div className="cy-customer-quote-date">
                    <strong>{quote.date}</strong>
                    <span>{quote.employee} · rev. {quote.revision}</span>
                  </div>
                </header>
                <div className="cy-customer-price-breaks">
                  <div className="cy-customer-price-break-head"><span>數量</span><span>單位</span><span>單價</span></div>
                  {quote.breaks.map((row, breakIndex) => (
                    <div className="cy-customer-price-break" key={`${quote.id}-${breakIndex}`}>
                      <span>{row.quantity}</span><span>{row.unit}</span><strong>{row.price}</strong>
                    </div>
                  ))}
                </div>
                <div className="cy-customer-quote-actions">
                  <Button type="button" tone="quiet" size="small" onClick={() => openQuoteCorrection(quote)}>修正紀錄</Button>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="cy-customer-related-footnote">這裡故意沒有「刪除報價」；目前新架構先以保留歷史＋受稽核修正為準。</div>
      </div>
    );
  }

  function renderFrequent() {
    return (
      <div className="cy-customer-related-layout">
        <div className="cy-customer-related-heading">
          <div>
            <strong>常用商品</strong>
            <span>正式商品與未建檔需求保留不同身份，不以名稱猜測關聯。</span>
          </div>
          <Button type="button" tone="secondary" size="small" onClick={openFrequentEditor}>編輯常用商品</Button>
        </div>
        {customerFrequent.length === 0 ? (
          <EmptyState title="尚無常用商品" description="可記正式商品，也可先保存尚未建檔的客戶需求。" />
        ) : (
          <div className="cy-customer-frequent-grid">
            {customerFrequent.map((item) => (
              <article className="cy-customer-frequent-card" key={item.id}>
                <div className="cy-customer-frequent-kind">
                  <StatusChip tone={item.kind === "formal" ? "success" : "warning"}>
                    {item.kind === "formal" ? "正式商品" : "未建檔"}
                  </StatusChip>
                </div>
                <strong>{item.kind === "formal" ? item.item?.name : item.customName}</strong>
                {item.item ? <span>{item.item.itemNo}</span> : null}
                {item.item ? <small>{item.item.spec}</small> : null}
                {item.category ? <small>{item.category}</small> : null}
              </article>
            ))}
          </div>
        )}
        <div className="cy-customer-related-footnote">要把未建檔項目轉成正式商品，必須明確搜尋並選到正式 Item。</div>
      </div>
    );
  }

  const panelContent = activeKey === "visits"
    ? renderVisits()
    : activeKey === "quotes"
      ? renderQuotes()
      : activeKey === "frequent"
        ? renderFrequent()
        : (
          <div className="cy-customer-history-preview">
            <div>
              <strong>動態 / 歷史</strong>
              <p>這裡未來只呈現真正的 Audit Timeline；一般欄位修改仍只保留最後更新資訊。</p>
            </div>
            <StatusChip tone="neutral">等待受保護 Audit API</StatusChip>
          </div>
        );

  return (
    <>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      <RelatedRecordPanel
        tabs={relatedTabs}
        activeKey={activeKey}
        onChange={onChange}
        ariaLabel="客戶相關紀錄互動預覽"
        headerActions={<StatusChip tone="info">瀏覽器內預覽</StatusChip>}
      >
        {panelContent}
      </RelatedRecordPanel>

      <Drawer
        open={editor?.kind === "visit"}
        title={editor?.kind === "visit" && editor.mode === "edit" ? "修改拜訪紀錄" : "新增拜訪紀錄"}
        description="正式版會驗證 Customer、Contact、Employee 與 revision；此處只驗證互動方式。"
        onClose={requestCloseEditor}
        footer={
          <div className="cy-dialog-action-row">
            <Button type="button" tone="secondary" onClick={requestCloseEditor}>取消</Button>
            <Button type="button" onClick={saveVisit}>儲存</Button>
          </div>
        }
      >
        {editor?.kind === "visit" ? (
          <div className="cy-related-editor-form">
            <TextInput label="拜訪日期" type="date" value={editor.draft.date} onChange={(event) => changeVisitDraft("date", event.target.value)} error={formErrors.date} required />
            <SelectField label="聯絡人（可選）" value={editor.draft.contactId} onChange={(event) => {
              const value = event.target.value;
              changeVisitDraft("contactId", value);
              const contact = contacts.find((item) => item.id === Number(value));
              if (contact && !editor.draft.person.trim()) changeVisitDraft("person", contact.name);
            }}>
              <option value="">不連結聯絡人</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
            </SelectField>
            <TextInput label="當時拜訪對象" value={editor.draft.person} onChange={(event) => changeVisitDraft("person", event.target.value)} error={formErrors.person} description="這是歷史快照；之後聯絡人改名也不會回頭改寫。" />
            <SelectField label="記錄／負責人" value={editor.draft.employeeId} onChange={(event) => changeVisitDraft("employeeId", event.target.value)}>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </SelectField>
            <TextArea label="拜訪內容" rows={7} value={editor.draft.content} onChange={(event) => changeVisitDraft("content", event.target.value)} error={formErrors.content} required />
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={editor?.kind === "quote"}
        title={editor?.kind === "quote" && editor.mode === "correct" ? "修正既有報價紀錄" : "新增報價紀錄"}
        description={editor?.kind === "quote" && editor.mode === "correct"
          ? "只用於修正原始輸入錯誤；如果今天真的報了新價格，請新增一筆歷史。"
          : "每次新的商業報價建立一筆新的 Customer＋Item 價格歷史。"}
        onClose={requestCloseEditor}
        size="large"
        footer={
          <div className="cy-dialog-action-row">
            <Button type="button" tone="secondary" onClick={requestCloseEditor}>取消</Button>
            <Button type="button" onClick={saveQuote}>{editor?.kind === "quote" && editor.mode === "correct" ? "確認修正" : "新增報價"}</Button>
          </div>
        }
      >
        {editor?.kind === "quote" ? (
          <div className="cy-related-editor-form">
            {editor.mode === "correct" ? (
              <Notice tone="warning" title="這不是建立新價格">
                這個操作會保留同一筆歷史身分，正式版會寫入修正前／後的 Audit。如果是新的價格條件，請取消後改用「新增報價紀錄」。
              </Notice>
            ) : null}
            <div className="cy-related-editor-grid-2">
              <TextInput label="報價日期" type="date" value={editor.draft.date} onChange={(event) => changeQuoteDraft("date", event.target.value)} error={formErrors.date} required />
              <SelectField label="報價人員" value={editor.draft.employeeId} onChange={(event) => changeQuoteDraft("employeeId", event.target.value)}>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </SelectField>
            </div>
            <EntityPicker<ItemOption>
              label="正式商品"
              value={editor.draft.item}
              onSelect={(item) => changeQuoteDraft("item", item)}
              search={searchPreviewItems}
              getKey={(item) => item.id}
              getLabel={(item) => `${item.itemNo} · ${item.name}`}
              getDescription={(item) => item.spec}
              placeholder="輸入品號或商品名稱…"
              error={formErrors.item}
              required
            />
            <div className="cy-related-editor-list-head">
              <div><strong>數量／單價級距</strong><span>最多 10 個級距；正式資料以 scaled4 精確保存。</span></div>
              <Button type="button" tone="quiet" size="small" onClick={() => dispatchQuoteBreaks({ type: "add", row: quoteRow(`quote-break-${crypto.randomUUID()}`, { quantity: "", unit: "盒", price: "", note: "" }) })} disabled={quoteBreaks.rows.length >= 10}>＋ 級距</Button>
            </div>
            {formErrors.breaks ? <div className="cy-related-editor-error">{formErrors.breaks}</div> : null}
            <div className="cy-related-editor-list">
              {quoteBreaks.rows.map((row, index) => (
                <div className="cy-related-editor-card" key={row.key}>
                  <div className="cy-related-editor-grid-3">
                    <TextInput label={`數量 ${index + 1}`} inputMode="decimal" value={row.value.quantity} onChange={(event) => dispatchQuoteBreaks({ type: "update", key: row.key, value: { ...row.value, quantity: event.target.value } })} error={formErrors[`break-${index}`]} />
                    <TextInput label="單位" value={row.value.unit} onChange={(event) => dispatchQuoteBreaks({ type: "update", key: row.key, value: { ...row.value, unit: event.target.value } })} />
                    <TextInput label="單價" inputMode="decimal" value={row.value.price} onChange={(event) => dispatchQuoteBreaks({ type: "update", key: row.key, value: { ...row.value, price: event.target.value } })} />
                  </div>
                  <div className="cy-related-editor-card-bottom">
                    <TextInput label="備註" value={row.value.note} maxLength={120} onChange={(event) => dispatchQuoteBreaks({ type: "update", key: row.key, value: { ...row.value, note: event.target.value } })} />
                    <Button type="button" tone="quiet" size="small" onClick={() => dispatchQuoteBreaks({ type: "remove", key: row.key })}>移除</Button>
                  </div>
                </div>
              ))}
            </div>
            {editor.mode === "correct" ? (
              <TextArea label="修正原因（選填）" rows={3} maxLength={240} value={editor.draft.correctionReason} onChange={(event) => changeQuoteDraft("correctionReason", event.target.value)} description="正式版會放入 Audit metadata；目前不強制填寫。" />
            ) : null}
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={editor?.kind === "frequent"}
        title="編輯常用商品"
        description="正式商品必須明確搜尋選取；未建檔需求保持自由文字，不做名稱自動配對。"
        onClose={requestCloseEditor}
        size="large"
        footer={
          <div className="cy-dialog-action-row">
            <Button type="button" tone="secondary" onClick={requestCloseEditor}>取消</Button>
            <Button type="button" onClick={saveFrequent}>儲存</Button>
          </div>
        }
      >
        {editor?.kind === "frequent" ? (
          <div className="cy-related-editor-form">
            <div className="cy-related-editor-list-head">
              <div><strong>常用商品清單</strong><span>每列只能是正式商品或未建檔自由文字其中一種。</span></div>
              <Button type="button" tone="quiet" size="small" onClick={() => {
                const id = nextId(frequentRows.rows.map((row) => ({ id: row.value.id })), 300);
                dispatchFrequentRows({ type: "add", row: frequentRow({ id, kind: "formal", item: null, customName: "", category: "", updatedAt: "new" }) });
              }}>＋ 新增</Button>
            </div>
            <div className="cy-related-editor-list">
              {frequentRows.rows.map((row, index) => (
                <div className="cy-related-editor-card" key={row.key}>
                  <div className="cy-related-editor-card-head">
                    <SelectField label={`類型 ${index + 1}`} value={row.value.kind} onChange={(event) => {
                      const kind = event.target.value as FrequentDraft["kind"];
                      dispatchFrequentRows({ type: "update", key: row.key, value: { ...row.value, kind, item: kind === "formal" ? row.value.item : null, customName: kind === "free-text" ? row.value.customName : "", category: kind === "free-text" ? row.value.category : "" } });
                    }}>
                      <option value="formal">正式商品</option>
                      <option value="free-text">未建檔／自由文字</option>
                    </SelectField>
                    <Button type="button" tone="quiet" size="small" onClick={() => dispatchFrequentRows({ type: "remove", key: row.key })}>移除</Button>
                  </div>
                  {row.value.kind === "formal" ? (
                    <EntityPicker<ItemOption>
                      label="正式商品"
                      value={row.value.item}
                      onSelect={(item) => dispatchFrequentRows({ type: "update", key: row.key, value: { ...row.value, item } })}
                      search={searchPreviewItems}
                      getKey={(item) => item.id}
                      getLabel={(item) => `${item.itemNo} · ${item.name}`}
                      getDescription={(item) => item.spec}
                      placeholder="輸入品號或商品名稱…"
                      error={formErrors[`frequent-${index}`]}
                      required
                    />
                  ) : (
                    <div className="cy-related-editor-grid-2">
                      <TextInput label="未建檔商品名稱" value={row.value.customName} onChange={(event) => dispatchFrequentRows({ type: "update", key: row.key, value: { ...row.value, customName: event.target.value } })} error={formErrors[`frequent-${index}`]} required />
                      <TextInput label="分類／備註" value={row.value.category} onChange={(event) => dispatchFrequentRows({ type: "update", key: row.key, value: { ...row.value, category: event.target.value } })} />
                    </div>
                  )}
                </div>
              ))}
              {frequentRows.rows.length === 0 ? <EmptyState title="目前沒有項目" description="按「新增」建立常用商品。" /> : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={pendingClose}
        title="捨棄未儲存變更？"
        description="目前相關資料編輯器有尚未儲存的內容。"
        confirmLabel="捨棄變更"
        cancelLabel="繼續編輯"
        confirmTone="danger"
        onConfirm={forceCloseEditor}
        onCancel={() => setPendingClose(false)}
      />

      <ConfirmDialog
        open={visitDeleteId != null}
        title="刪除這筆拜訪紀錄？"
        description="正式版會保留刪除 Audit；這個預覽只從目前瀏覽器的示範資料移除。"
        confirmLabel="刪除拜訪"
        cancelLabel="取消"
        confirmTone="danger"
        onConfirm={confirmDeleteVisit}
        onCancel={() => setVisitDeleteId(null)}
      />
    </>
  );
}
