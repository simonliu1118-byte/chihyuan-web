import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { DataView, type DataColumn } from "../../ui/data/DataView";
import { DataViewToolbar } from "../../ui/data/DataViewToolbar";
import {
  createEditableListRow,
  createEditableListState,
  editableListReducer,
  serializeEditableList,
} from "../../ui/foundation/editable-list";
import { advanceFocusOnEnter } from "../../ui/foundation/enter-advance";
import {
  createEmptyRecordEditorState,
  hasUnsavedRecordChanges,
  isRecordEditorEditable,
  recordEditorReducer,
} from "../../ui/foundation/record-editor";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { ToastRegion } from "../../ui/feedback/ToastRegion";
import { useToastQueue } from "../../ui/feedback/useToastQueue";
import { ConfirmDialog } from "../../ui/overlays/ConfirmDialog";
import { Button } from "../../ui/primitives/Button";
import { Notice } from "../../ui/primitives/Notice";
import { SelectField } from "../../ui/primitives/SelectField";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { TextArea } from "../../ui/primitives/TextArea";
import { TextInput } from "../../ui/primitives/TextInput";

interface PreviewCustomer {
  id: number;
  customerNo: string | null;
  shortName: string;
  fullName: string;
  taxId: string | null;
  category: string;
  region: string;
  owner: string;
  department: string;
  status: "往來中" | "潛在客戶" | "已歇業";
  phones: readonly string[];
  fax: string | null;
  contacts: readonly { name: string; detail: string; mobile: string | null }[];
  addresses: readonly { postalCode: string; address: string; note?: string }[];
  notes: readonly string[];
  updatedAt: string;
}

interface CustomerCoreDraft {
  customerNo: string;
  shortName: string;
  fullName: string;
  taxId: string;
  category: string;
  region: string;
  owner: string;
  department: string;
  status: PreviewCustomer["status"];
  fax: string;
}

interface PhoneDraft {
  value: string;
}

interface ContactDraft {
  name: string;
  detail: string;
  mobile: string;
}

interface AddressDraft {
  postalCode: string;
  address: string;
  note: string;
}

interface NoteDraft {
  content: string;
}

type RelatedKey = "visits" | "quotes" | "frequent" | "history";
type PendingNavigation =
  | { kind: "select"; customerId: number }
  | { kind: "create" }
  | { kind: "cancel" }
  | null;

interface CoreErrors {
  customerNo?: string;
  shortName?: string;
  taxId?: string;
}

const previewSeed: readonly PreviewCustomer[] = [
  {
    id: 1,
    customerNo: "C-00128",
    shortName: "示範中醫診所",
    fullName: "示範中醫診所有限公司",
    taxId: "12345678",
    category: "中醫診所",
    region: "高雄市",
    owner: "王○○",
    department: "南區業務",
    status: "往來中",
    phones: ["07-555-0188 #12", "07-555-0199"],
    fax: "07-555-0100",
    contacts: [
      { name: "林小姐", detail: "採購 / 管理", mobile: "09xx-xxx-128" },
      { name: "陳先生", detail: "院務", mobile: null },
    ],
    addresses: [
      { postalCode: "807", address: "高雄市三民區示範路 100 號", note: "主要收貨" },
      { postalCode: "802", address: "高雄市苓雅區範例街 20 號", note: "帳單" },
    ],
    notes: ["每月月底前寄送對帳單", "收貨前請先電話聯絡"],
    updatedAt: "2026-09-26 16:40",
  },
  {
    id: 2,
    customerNo: null,
    shortName: "測試養生館",
    fullName: "測試養生館",
    taxId: null,
    category: "潛在客戶",
    region: "台南市",
    owner: "李○○",
    department: "南區業務",
    status: "潛在客戶",
    phones: ["06-222-0111"],
    fax: null,
    contacts: [{ name: "黃小姐", detail: "負責人", mobile: "09xx-xxx-622" }],
    addresses: [{ postalCode: "700", address: "台南市中西區測試路 8 號" }],
    notes: ["尚未建立 SMART ERP 客戶編號"],
    updatedAt: "2026-09-25 11:18",
  },
  {
    id: 3,
    customerNo: "C-00041",
    shortName: "範例診所",
    fullName: "範例診所",
    taxId: "87654321",
    category: "中醫診所",
    region: "屏東縣",
    owner: "王○○",
    department: "南區業務",
    status: "已歇業",
    phones: ["08-777-0123"],
    fax: null,
    contacts: [],
    addresses: [{ postalCode: "900", address: "屏東縣屏東市範例路 3 號" }],
    notes: ["保留歷史資料，不作為應用層交易阻擋條件"],
    updatedAt: "2026-08-11 09:05",
  },
];

const emptyCoreDraft: CustomerCoreDraft = {
  customerNo: "",
  shortName: "",
  fullName: "",
  taxId: "",
  category: "中醫診所",
  region: "高雄市",
  owner: "王○○",
  department: "南區業務",
  status: "潛在客戶",
  fax: "",
};

const columns: readonly DataColumn<PreviewCustomer>[] = [
  {
    key: "customer",
    header: "客戶",
    render: (customer) => (
      <div className="cy-customer-result-identity">
        <strong>{customer.shortName}</strong>
        <span>{customer.customerNo ?? "尚無 ERP 編號"}</span>
      </div>
    ),
  },
  { key: "region", header: "地區", render: (customer) => customer.region },
  {
    key: "status",
    header: "狀態",
    align: "end",
    render: (customer) => <CustomerStatus status={customer.status} />,
  },
];

const relatedLabels: Record<RelatedKey, string> = {
  visits: "拜訪紀錄",
  quotes: "報價紀錄",
  frequent: "常用商品",
  history: "動態 / 歷史",
};

function CustomerStatus({ status }: { status: PreviewCustomer["status"] }) {
  const tone = status === "往來中" ? "success" : status === "潛在客戶" ? "info" : "neutral";
  return <StatusChip tone={tone}>{status}</StatusChip>;
}

function DetailValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cy-customer-detail-value">
      <span>{label}</span>
      <strong>{children || "—"}</strong>
    </div>
  );
}

function coreFromCustomer(customer: PreviewCustomer): CustomerCoreDraft {
  return {
    customerNo: customer.customerNo ?? "",
    shortName: customer.shortName,
    fullName: customer.fullName,
    taxId: customer.taxId ?? "",
    category: customer.category,
    region: customer.region,
    owner: customer.owner,
    department: customer.department,
    status: customer.status,
    fax: customer.fax ?? "",
  };
}

function phoneRows(customer: PreviewCustomer) {
  return customer.phones.map((value, index) =>
    createEditableListRow<PhoneDraft>(`customer-${customer.id}-phone-${index + 1}`, { value }),
  );
}

function contactRows(customer: PreviewCustomer) {
  return customer.contacts.map((contact, index) =>
    createEditableListRow<ContactDraft>(`customer-${customer.id}-contact-${index + 1}`, {
      name: contact.name,
      detail: contact.detail,
      mobile: contact.mobile ?? "",
    }),
  );
}

function addressRows(customer: PreviewCustomer) {
  return customer.addresses.map((address, index) =>
    createEditableListRow<AddressDraft>(`customer-${customer.id}-address-${index + 1}`, {
      postalCode: address.postalCode,
      address: address.address,
      note: address.note ?? "",
    }),
  );
}

function noteRows(customer: PreviewCustomer) {
  return customer.notes.map((content, index) =>
    createEditableListRow<NoteDraft>(`customer-${customer.id}-note-${index + 1}`, { content }),
  );
}

function nowPreviewLabel() {
  return "剛剛（靜態預覽）";
}

export function CustomerWorkspacePreview() {
  const [customers, setCustomers] = useState<readonly PreviewCustomer[]>(previewSeed);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(previewSeed[0].id);
  const [returnToId, setReturnToId] = useState<number | null>(null);
  const [relatedKey, setRelatedKey] = useState<RelatedKey>("visits");
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [coreErrors, setCoreErrors] = useState<CoreErrors>({});

  const [editor, dispatchEditor] = useReducer(
    recordEditorReducer<CustomerCoreDraft>,
    createEmptyRecordEditorState<CustomerCoreDraft>(),
  );
  const [phones, dispatchPhones] = useReducer(
    editableListReducer<PhoneDraft>,
    createEditableListState<PhoneDraft>(),
  );
  const [contacts, dispatchContacts] = useReducer(
    editableListReducer<ContactDraft>,
    createEditableListState<ContactDraft>(),
  );
  const [addresses, dispatchAddresses] = useReducer(
    editableListReducer<AddressDraft>,
    createEditableListState<AddressDraft>(),
  );
  const [notes, dispatchNotes] = useReducer(
    editableListReducer<NoteDraft>,
    createEditableListState<NoteDraft>(),
  );
  const { toasts, pushToast, dismissToast } = useToastQueue();

  const selected = selectedId == null ? null : customers.find((customer) => customer.id === selectedId) ?? null;
  const childDirty = phones.dirty || contacts.dirty || addresses.dirty || notes.dirty;
  const hasUnsaved = hasUnsavedRecordChanges(editor) || childDirty;
  const editable = isRecordEditorEditable(editor);
  useUnsavedChangesGuard({ active: hasUnsaved });

  useEffect(() => {
    if (!selected) return;
    dispatchEditor({ type: "load", value: coreFromCustomer(selected) });
    dispatchPhones({ type: "load", rows: phoneRows(selected) });
    dispatchContacts({ type: "load", rows: contactRows(selected) });
    dispatchAddresses({ type: "load", rows: addressRows(selected) });
    dispatchNotes({ type: "load", rows: noteRows(selected) });
    setCoreErrors({});
  }, [selectedId]); // selected data is intentionally loaded when selection changes in this static preview.

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return customers;
    return customers.filter((customer) =>
      [customer.customerNo, customer.shortName, customer.fullName, customer.taxId, customer.region]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(value),
    );
  }, [customers, query]);

  function loadSelectedCustomer(customerId: number) {
    setSelectedId(customerId);
    setReturnToId(null);
    setRelatedKey("visits");
  }

  function beginCreate() {
    setReturnToId(selectedId);
    setSelectedId(null);
    dispatchEditor({ type: "start-create", value: { ...emptyCoreDraft } });
    dispatchPhones({ type: "load", rows: [] });
    dispatchContacts({ type: "load", rows: [] });
    dispatchAddresses({ type: "load", rows: [] });
    dispatchNotes({ type: "load", rows: [] });
    setCoreErrors({});
    setRelatedKey("visits");
  }

  function beginEdit() {
    dispatchEditor({ type: "start-edit" });
    setCoreErrors({});
  }

  function requestSelect(customerId: number) {
    if (selectedId === customerId && editor.mode !== "create") return;
    if (hasUnsaved) {
      setPendingNavigation({ kind: "select", customerId });
      return;
    }
    loadSelectedCustomer(customerId);
  }

  function requestCreate() {
    if (hasUnsaved) {
      setPendingNavigation({ kind: "create" });
      return;
    }
    beginCreate();
  }

  function cancelEditorClean() {
    if (editor.mode === "create") {
      const fallback = returnToId ?? customers[0]?.id ?? null;
      if (fallback != null) {
        loadSelectedCustomer(fallback);
      } else {
        dispatchEditor({ type: "reset" });
      }
      return;
    }

    dispatchEditor({ type: "cancel" });
    dispatchPhones({ type: "reset" });
    dispatchContacts({ type: "reset" });
    dispatchAddresses({ type: "reset" });
    dispatchNotes({ type: "reset" });
    setCoreErrors({});
  }

  function requestCancel() {
    if (hasUnsaved) {
      setPendingNavigation({ kind: "cancel" });
      return;
    }
    cancelEditorClean();
  }

  function confirmDiscard() {
    const pending = pendingNavigation;
    setPendingNavigation(null);
    if (!pending) return;

    if (pending.kind === "select") {
      loadSelectedCustomer(pending.customerId);
      return;
    }
    if (pending.kind === "create") {
      beginCreate();
      return;
    }
    cancelEditorClean();
  }

  function changeCore<K extends keyof CustomerCoreDraft>(key: K, value: CustomerCoreDraft[K]) {
    if (!editor.value) return;
    dispatchEditor({ type: "change", value: { ...editor.value, [key]: value } });
    if (key === "customerNo" || key === "shortName" || key === "taxId") {
      setCoreErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function validateCore(): boolean {
    if (!editor.value) return false;
    const nextErrors: CoreErrors = {};
    const customerNo = editor.value.customerNo.trim();
    if (editor.mode === "create" && customerNo && customers.some((customer) => customer.customerNo === customerNo)) {
      nextErrors.customerNo = "此客戶編號已存在；正式 API 會以衝突拒絕。";
    }
    if (!editor.value.shortName.trim()) nextErrors.shortName = "請輸入客戶簡稱。";
    if (editor.value.taxId && !/^\d{8}$/.test(editor.value.taxId)) {
      nextErrors.taxId = "統一編號需為 8 碼數字。";
    }
    setCoreErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function hasDuplicateTaxId(): boolean {
    const taxId = editor.value?.taxId.trim();
    if (!taxId) return false;
    return customers.some((customer) => customer.taxId === taxId && customer.id !== selectedId);
  }

  function buildCustomer(id: number): PreviewCustomer {
    const value = editor.value ?? emptyCoreDraft;
    return {
      id,
      customerNo: value.customerNo.trim() || null,
      shortName: value.shortName.trim(),
      fullName: value.fullName.trim() || value.shortName.trim(),
      taxId: value.taxId.trim() || null,
      category: value.category,
      region: value.region,
      owner: value.owner,
      department: value.department,
      status: value.status,
      phones: serializeEditableList(phones).map((row) => row.value.trim()).filter(Boolean),
      fax: value.fax.trim() || null,
      contacts: serializeEditableList(contacts)
        .filter((row) => row.name.trim())
        .map((row) => ({
          name: row.name.trim(),
          detail: row.detail.trim(),
          mobile: row.mobile.trim() || null,
        })),
      addresses: serializeEditableList(addresses)
        .filter((row) => row.address.trim())
        .map((row) => ({
          postalCode: row.postalCode.trim(),
          address: row.address.trim(),
          note: row.note.trim() || undefined,
        })),
      notes: serializeEditableList(notes).map((row) => row.content.trim()).filter(Boolean),
      updatedAt: nowPreviewLabel(),
    };
  }

  function savePreview(forceDuplicate = false) {
    if (!validateCore() || !editor.value) return;
    if (!forceDuplicate && hasDuplicateTaxId()) {
      setDuplicateConfirmOpen(true);
      return;
    }

    dispatchEditor({ type: "save-start" });

    if (editor.mode === "create") {
      const id = Math.max(0, ...customers.map((customer) => customer.id)) + 1;
      const created = buildCustomer(id);
      setCustomers((current) => [...current, created]);
      setSelectedId(id);
      setReturnToId(null);
      dispatchEditor({ type: "save-success", value: coreFromCustomer(created) });
      dispatchPhones({ type: "commit" });
      dispatchContacts({ type: "commit" });
      dispatchAddresses({ type: "commit" });
      dispatchNotes({ type: "commit" });
      pushToast({ tone: "success", title: "已建立客戶（預覽）", message: "此操作只更新瀏覽器內的靜態示範資料。" });
      return;
    }

    if (selectedId != null) {
      const updated = buildCustomer(selectedId);
      setCustomers((current) => current.map((customer) => (customer.id === selectedId ? updated : customer)));
      dispatchEditor({ type: "save-success", value: coreFromCustomer(updated) });
      dispatchPhones({ type: "commit" });
      dispatchContacts({ type: "commit" });
      dispatchAddresses({ type: "commit" });
      dispatchNotes({ type: "commit" });
      pushToast({ tone: "success", title: "已儲存（預覽）", message: "正式版將改由受保護 API 寫入 D1。" });
    }
  }

  const displayCustomer = selected;
  const displayCore = editor.value;

  return (
    <div className="cy-page cy-customer-preview-page">
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />

      <header className="cy-page-header cy-customer-page-header">
        <div>
          <p className="cy-page-eyebrow">Customer · Interaction Preview</p>
          <h1>客戶管理</h1>
          <p className="cy-page-description">
            新 Web 客戶主檔的查看／新增／修改互動預覽。所有儲存只作用在目前瀏覽器的靜態示範資料，不會連線正式 Customer API。
          </p>
        </div>
        <Button type="button" onClick={requestCreate} disabled={editor.saving}>
          新增客戶
        </Button>
      </header>

      <Notice tone="info" title="現在可直接測試新增與修改流程">
        編輯狀態使用共用 Record Editor、未儲存保護、Editable List、表單元件、確認 Dialog 與 Toast；不是為 Customer 另外寫一套頁面狀態機。
      </Notice>

      <div className="cy-customer-toolbar-wrap">
        <DataViewToolbar
          searchValue={query}
          onSearchChange={setQuery}
          searchLabel="搜尋客戶"
          searchPlaceholder="客戶編號、名稱、統編、地區…"
          resultSummary={`示範結果 ${filtered.length} 筆`}
          filters={
            <div className="cy-customer-filter-preview" aria-label="示範篩選器">
              <button type="button" disabled>分類</button>
              <button type="button" disabled>狀態</button>
              <button type="button" disabled>地區</button>
              <button type="button" disabled>負責人</button>
            </div>
          }
        />
      </div>

      <div className="cy-customer-workspace">
        <section className="cy-customer-results" aria-label="客戶搜尋結果">
          <div className="cy-customer-panel-heading">
            <div>
              <span className="cy-customer-panel-kicker">搜尋結果</span>
              <strong>選擇客戶</strong>
            </div>
            <span>{filtered.length}</span>
          </div>
          <DataView
            ariaLabel="客戶搜尋結果"
            items={filtered}
            getKey={(customer) => customer.id}
            columns={columns}
            selectedKey={selectedId}
            onSelect={(customer) => requestSelect(customer.id)}
            emptyTitle="沒有符合的客戶"
            emptyDescription="調整搜尋條件後再試一次。"
            renderCard={(customer) => (
              <div className="cy-customer-result-card">
                <div>
                  <strong>{customer.shortName}</strong>
                  <span>{customer.customerNo ?? "尚無 ERP 編號"}</span>
                </div>
                <CustomerStatus status={customer.status} />
                <small>{customer.region} · {customer.owner}</small>
              </div>
            )}
          />
        </section>

        <section className="cy-customer-detail" aria-label="客戶主檔預覽">
          {editor.mode === "empty" || !displayCore ? (
            <div className="cy-customer-empty-detail">
              <strong>尚未選擇客戶</strong>
              <span>從左側選擇客戶，或建立新的客戶主檔。</span>
            </div>
          ) : (
            <>
              <div className="cy-customer-detail-header">
                <div className="cy-customer-detail-titleblock">
                  <div className="cy-customer-detail-titleline">
                    <h2>{editor.mode === "create" ? "新增客戶" : displayCore.shortName || "未命名客戶"}</h2>
                    {editor.mode !== "create" ? <CustomerStatus status={displayCore.status} /> : <StatusChip tone="info">新增中</StatusChip>}
                    {hasUnsaved ? <StatusChip tone="warning">未儲存</StatusChip> : null}
                  </div>
                  <div className="cy-customer-detail-subtitle">
                    {editor.mode === "create" ? "建立新的 Customer；ERP 客戶編號可稍後補上。" : displayCore.fullName}
                  </div>
                  {editor.mode !== "create" ? (
                    <div className="cy-customer-detail-meta">
                      <span>{displayCore.customerNo || "尚未建立 ERP 客戶編號"}</span>
                      <span>{displayCore.category}</span>
                      <span>{displayCore.region}</span>
                      <span>{displayCore.department} / {displayCore.owner}</span>
                    </div>
                  ) : null}
                </div>
                <div className="cy-customer-detail-actions">
                  {editor.mode === "view" ? (
                    <Button type="button" tone="secondary" onClick={beginEdit}>修改</Button>
                  ) : (
                    <>
                      <Button type="button" tone="secondary" onClick={requestCancel} disabled={editor.saving}>取消</Button>
                      <Button type="button" onClick={() => savePreview(false)} busy={editor.saving}>儲存</Button>
                    </>
                  )}
                </div>
              </div>

              {editable ? (
                <div className="cy-customer-edit-surface" onKeyDown={advanceFocusOnEnter}>
                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-info-card-title">基本資料</div>
                    <div className="cy-customer-form-grid">
                      <TextInput
                        label="客戶編號"
                        value={displayCore.customerNo}
                        onChange={(event) => changeCore("customerNo", event.target.value)}
                        error={coreErrors.customerNo}
                        readOnly={editor.mode === "edit"}
                        description={editor.mode === "edit" ? "既有客戶編號的指派／更正屬受控業務動作，正式版不在一般修改中直接覆寫。" : "可先留空；正式編號由 SMART ERP 管理。"}
                        data-enter-advance={editor.mode === "create" ? "true" : undefined}
                      />
                      <TextInput
                        label="客戶簡稱"
                        value={displayCore.shortName}
                        onChange={(event) => changeCore("shortName", event.target.value)}
                        error={coreErrors.shortName}
                        required
                        data-enter-advance="true"
                      />
                      <TextInput
                        label="客戶全名"
                        value={displayCore.fullName}
                        onChange={(event) => changeCore("fullName", event.target.value)}
                        data-enter-advance="true"
                      />
                      <TextInput
                        label="統一編號"
                        inputMode="numeric"
                        maxLength={8}
                        value={displayCore.taxId}
                        onChange={(event) => changeCore("taxId", event.target.value.replace(/\D/g, "").slice(0, 8))}
                        error={coreErrors.taxId}
                        description="允許重複，但正式儲存時必須明確確認。"
                        data-enter-advance="true"
                      />
                      <SelectField label="客戶分類" value={displayCore.category} onChange={(event) => changeCore("category", event.target.value)}>
                        <option>中醫診所</option>
                        <option>潛在客戶</option>
                        <option>其他</option>
                      </SelectField>
                      <SelectField label="客戶狀態" value={displayCore.status} onChange={(event) => changeCore("status", event.target.value as PreviewCustomer["status"])}>
                        <option>往來中</option>
                        <option>潛在客戶</option>
                        <option>已歇業</option>
                      </SelectField>
                    </div>
                  </section>

                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-info-card-title">負責資訊</div>
                    <div className="cy-customer-form-grid cy-customer-form-grid-3">
                      <SelectField label="地區" value={displayCore.region} onChange={(event) => changeCore("region", event.target.value)}>
                        <option>高雄市</option><option>台南市</option><option>屏東縣</option>
                      </SelectField>
                      <SelectField label="負責部門" value={displayCore.department} onChange={(event) => changeCore("department", event.target.value)}>
                        <option>南區業務</option><option>門市</option><option>其他</option>
                      </SelectField>
                      <SelectField label="業務人員" value={displayCore.owner} onChange={(event) => changeCore("owner", event.target.value)}>
                        <option>王○○</option><option>李○○</option><option>未指定</option>
                      </SelectField>
                    </div>
                  </section>

                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-edit-section-head">
                      <div className="cy-customer-info-card-title">電話 / 傳真</div>
                      <Button
                        type="button"
                        tone="quiet"
                        size="small"
                        onClick={() => dispatchPhones({ type: "add", row: createEditableListRow(`phone-${crypto.randomUUID()}`, { value: "" }) })}
                      >
                        ＋ 電話
                      </Button>
                    </div>
                    <div className="cy-customer-repeat-list">
                      {phones.rows.map((row, index) => (
                        <div className="cy-customer-repeat-row cy-customer-repeat-row-phone" key={row.key}>
                          <TextInput
                            label={`聯絡電話 ${index + 1}`}
                            value={row.value.value}
                            onChange={(event) => dispatchPhones({ type: "update", key: row.key, value: { value: event.target.value } })}
                            data-enter-advance="true"
                          />
                          <Button type="button" tone="quiet" size="small" onClick={() => dispatchPhones({ type: "remove", key: row.key })}>移除</Button>
                        </div>
                      ))}
                      {phones.rows.length === 0 ? <div className="cy-customer-edit-empty">尚未新增聯絡電話。</div> : null}
                    </div>
                    <div className="cy-customer-form-grid cy-customer-form-grid-3">
                      <TextInput label="傳真" value={displayCore.fax} onChange={(event) => changeCore("fax", event.target.value)} data-enter-advance="true" />
                    </div>
                  </section>

                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-edit-section-head">
                      <div className="cy-customer-info-card-title">聯絡人</div>
                      <Button
                        type="button"
                        tone="quiet"
                        size="small"
                        onClick={() => dispatchContacts({ type: "add", row: createEditableListRow(`contact-${crypto.randomUUID()}`, { name: "", detail: "", mobile: "" }) })}
                      >
                        ＋ 聯絡人
                      </Button>
                    </div>
                    <div className="cy-customer-repeat-list">
                      {contacts.rows.map((row, index) => (
                        <div className="cy-customer-repeat-card" key={row.key}>
                          <div className="cy-customer-repeat-card-grid">
                            <TextInput label={`聯絡人 ${index + 1}`} value={row.value.name} onChange={(event) => dispatchContacts({ type: "update", key: row.key, value: { ...row.value, name: event.target.value } })} data-enter-advance="true" />
                            <TextInput label="部門 / 職務" value={row.value.detail} onChange={(event) => dispatchContacts({ type: "update", key: row.key, value: { ...row.value, detail: event.target.value } })} data-enter-advance="true" />
                            <TextInput label="行動電話" value={row.value.mobile} onChange={(event) => dispatchContacts({ type: "update", key: row.key, value: { ...row.value, mobile: event.target.value } })} data-enter-advance="true" />
                          </div>
                          <Button type="button" tone="quiet" size="small" onClick={() => dispatchContacts({ type: "remove", key: row.key })}>移除</Button>
                        </div>
                      ))}
                      {contacts.rows.length === 0 ? <div className="cy-customer-edit-empty">尚未新增聯絡人。</div> : null}
                    </div>
                  </section>

                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-edit-section-head">
                      <div className="cy-customer-info-card-title">地址</div>
                      <Button
                        type="button"
                        tone="quiet"
                        size="small"
                        onClick={() => dispatchAddresses({ type: "add", row: createEditableListRow(`address-${crypto.randomUUID()}`, { postalCode: "", address: "", note: "" }) })}
                      >
                        ＋ 地址
                      </Button>
                    </div>
                    <div className="cy-customer-repeat-list">
                      {addresses.rows.map((row, index) => (
                        <div className="cy-customer-repeat-card" key={row.key}>
                          <div className="cy-customer-address-edit-grid">
                            <TextInput label={`郵遞區號 ${index + 1}`} value={row.value.postalCode} onChange={(event) => dispatchAddresses({ type: "update", key: row.key, value: { ...row.value, postalCode: event.target.value } })} data-enter-advance="true" />
                            <TextInput label="地址" value={row.value.address} onChange={(event) => dispatchAddresses({ type: "update", key: row.key, value: { ...row.value, address: event.target.value } })} data-enter-advance="true" />
                            <TextInput label="備註" value={row.value.note} onChange={(event) => dispatchAddresses({ type: "update", key: row.key, value: { ...row.value, note: event.target.value } })} data-enter-advance="true" />
                          </div>
                          <Button type="button" tone="quiet" size="small" onClick={() => dispatchAddresses({ type: "remove", key: row.key })}>移除</Button>
                        </div>
                      ))}
                      {addresses.rows.length === 0 ? <div className="cy-customer-edit-empty">尚未新增地址。地址不會自動改寫客戶地區。</div> : null}
                    </div>
                  </section>

                  <section className="cy-customer-edit-section">
                    <div className="cy-customer-edit-section-head">
                      <div className="cy-customer-info-card-title">重要備註</div>
                      <Button
                        type="button"
                        tone="quiet"
                        size="small"
                        onClick={() => dispatchNotes({ type: "add", row: createEditableListRow(`note-${crypto.randomUUID()}`, { content: "" }) })}
                      >
                        ＋ 備註
                      </Button>
                    </div>
                    <div className="cy-customer-repeat-list">
                      {notes.rows.map((row, index) => (
                        <div className="cy-customer-repeat-card" key={row.key}>
                          <TextArea label={`重要備註 ${index + 1}`} rows={2} value={row.value.content} onChange={(event) => dispatchNotes({ type: "update", key: row.key, value: { content: event.target.value } })} />
                          <Button type="button" tone="quiet" size="small" onClick={() => dispatchNotes({ type: "remove", key: row.key })}>移除</Button>
                        </div>
                      ))}
                      {notes.rows.length === 0 ? <div className="cy-customer-edit-empty">尚無重要備註。</div> : null}
                    </div>
                  </section>
                </div>
              ) : displayCustomer ? (
                <>
                  <div className="cy-customer-overview-grid">
                    <div className="cy-customer-info-card">
                      <div className="cy-customer-info-card-title">基本資料</div>
                      <div className="cy-customer-value-grid">
                        <DetailValue label="客戶編號">{displayCustomer.customerNo ?? "尚未建立"}</DetailValue>
                        <DetailValue label="統一編號">{displayCustomer.taxId ?? "未填寫"}</DetailValue>
                        <DetailValue label="客戶分類">{displayCustomer.category}</DetailValue>
                        <DetailValue label="客戶狀態">{displayCustomer.status}</DetailValue>
                      </div>
                    </div>
                    <div className="cy-customer-info-card">
                      <div className="cy-customer-info-card-title">負責資訊</div>
                      <div className="cy-customer-value-grid">
                        <DetailValue label="地區">{displayCustomer.region}</DetailValue>
                        <DetailValue label="負責部門">{displayCustomer.department}</DetailValue>
                        <DetailValue label="業務人員">{displayCustomer.owner}</DetailValue>
                        <DetailValue label="最後更新">{displayCustomer.updatedAt}</DetailValue>
                      </div>
                    </div>
                    <div className="cy-customer-info-card cy-customer-info-card-wide">
                      <div className="cy-customer-info-card-title">聯絡方式</div>
                      <div className="cy-customer-contact-layout">
                        <div>
                          <span className="cy-customer-subheading">電話 / 傳真</span>
                          {displayCustomer.phones.map((phone) => <div className="cy-customer-line" key={phone}>{phone}</div>)}
                          {displayCustomer.phones.length === 0 ? <div className="cy-customer-muted">尚無電話</div> : null}
                          <div className="cy-customer-line cy-customer-muted">傳真：{displayCustomer.fax ?? "—"}</div>
                        </div>
                        <div>
                          <span className="cy-customer-subheading">聯絡人</span>
                          {displayCustomer.contacts.length > 0 ? displayCustomer.contacts.map((contact) => (
                            <div className="cy-customer-contact-row" key={`${displayCustomer.id}-${contact.name}`}>
                              <strong>{contact.name}</strong><span>{contact.detail}</span><small>{contact.mobile ?? "未填行動電話"}</small>
                            </div>
                          )) : <div className="cy-customer-muted">尚無聯絡人</div>}
                        </div>
                      </div>
                    </div>
                    <div className="cy-customer-info-card cy-customer-info-card-wide">
                      <div className="cy-customer-info-card-title">地址</div>
                      <div className="cy-customer-address-list">
                        {displayCustomer.addresses.map((address) => (
                          <div className="cy-customer-address-row" key={`${displayCustomer.id}-${address.address}`}>
                            <span>{address.postalCode}</span><strong>{address.address}</strong><small>{address.note ?? ""}</small>
                          </div>
                        ))}
                        {displayCustomer.addresses.length === 0 ? <div className="cy-customer-muted">尚無地址</div> : null}
                      </div>
                    </div>
                    <div className="cy-customer-info-card cy-customer-info-card-wide cy-customer-note-card">
                      <div className="cy-customer-info-card-title">重要備註</div>
                      <div className="cy-customer-note-list">
                        {displayCustomer.notes.map((note) => <div key={note}>{note}</div>)}
                        {displayCustomer.notes.length === 0 ? <div className="cy-customer-muted">尚無重要備註</div> : null}
                      </div>
                    </div>
                  </div>

                  <div className="cy-customer-related">
                    <div className="cy-customer-related-tabs" role="tablist" aria-label="客戶相關紀錄">
                      {(Object.keys(relatedLabels) as RelatedKey[]).map((key) => (
                        <button key={key} type="button" role="tab" aria-selected={relatedKey === key} className={relatedKey === key ? "is-active" : ""} onClick={() => setRelatedKey(key)}>
                          {relatedLabels[key]}
                        </button>
                      ))}
                    </div>
                    <div className="cy-customer-related-content" role="tabpanel">
                      <div><strong>{relatedLabels[relatedKey]}</strong><p>正式版只在需要時透過 Worker / D1 查詢此區，不重新載入整個 Customer 模組。</p></div>
                      <StatusChip tone="info">按需載入</StatusChip>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingNavigation != null}
        title="捨棄未儲存變更？"
        description="目前客戶主檔已有尚未儲存的修改。離開後這些變更會消失。"
        confirmLabel="捨棄變更"
        cancelLabel="繼續編輯"
        confirmTone="danger"
        onConfirm={confirmDiscard}
        onCancel={() => setPendingNavigation(null)}
      />

      <ConfirmDialog
        open={duplicateConfirmOpen}
        title="統一編號已有其他客戶"
        description="統一編號可以重複，但這是需要明確確認的情況。"
        confirmLabel="確認仍要儲存"
        cancelLabel="回去檢查"
        onConfirm={() => {
          setDuplicateConfirmOpen(false);
          savePreview(true);
        }}
        onCancel={() => setDuplicateConfirmOpen(false)}
      >
        <div className="cy-customer-duplicate-list">
          {customers
            .filter((customer) => customer.taxId === editor.value?.taxId.trim() && customer.id !== selectedId)
            .map((customer) => (
              <div key={customer.id}><strong>{customer.shortName}</strong><span>{customer.customerNo ?? "尚無 ERP 編號"}</span></div>
            ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}
