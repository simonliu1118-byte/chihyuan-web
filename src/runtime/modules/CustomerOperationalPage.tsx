import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import type { CustomerItemOption, CustomerModuleLookups } from "../../../shared/business-lookups";
import type {
  CustomerAddressInput,
  CustomerContactInput,
  CustomerDetail,
  CustomerNoteInput,
  CustomerPhoneInput,
  CustomerProfileInput,
  CustomerSummary,
} from "../../../shared/customer";
import type {
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerItemQuoteSummary,
  CustomerVisitRecord,
} from "../../../shared/customer-related";
import { ApiClientError } from "../../api/client";
import {
  changeCustomerNumber,
  checkCustomerTaxId,
  correctCustomerQuote,
  createCustomer,
  createCustomerFrequentItem,
  createCustomerQuote,
  createCustomerVisit,
  deleteCustomerFrequentItem,
  deleteCustomerVisit,
  loadCustomerDetail,
  loadCustomerFrequentItems,
  loadCustomerLookups,
  loadCustomerQuote,
  loadCustomerQuotes,
  loadCustomerVisits,
  searchCustomerItemOptions,
  searchCustomers,
  updateCustomer,
  updateCustomerVisit,
} from "../api/customer-runtime-client";
import "./customer-operational.css";

type RelatedTab = "visits" | "quotes" | "frequent" | "activity";

interface CustomerDraft {
  customerNo: string;
  shortName: string;
  fullName: string;
  taxId: string;
  customerCategoryId: number | null;
  regionId: number | null;
  ownerDepartmentId: number | null;
  ownerEmployeeId: number | null;
  fax: string;
  customerStatusId: number | null;
  phones: CustomerPhoneInput[];
  contacts: CustomerContactInput[];
  addresses: CustomerAddressInput[];
  notes: CustomerNoteInput[];
}

interface VisitDraft {
  record: CustomerVisitRecord | null;
  visitDate: string;
  contactId: number | null;
  personSnapshot: string;
  content: string;
}

interface QuoteDraft {
  corrected: CustomerItemQuoteDetail | null;
  itemId: number | null;
  quoteDate: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  note: string;
  correctionReason: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function activeLookupId(rows: readonly { id: number; isActive: boolean }[]): number | null {
  return rows.find((row) => row.isActive)?.id ?? null;
}

function newDraft(lookups: CustomerModuleLookups | null): CustomerDraft {
  return {
    customerNo: "",
    shortName: "",
    fullName: "",
    taxId: "",
    customerCategoryId: activeLookupId(lookups?.customerCategories ?? []),
    regionId: null,
    ownerDepartmentId: null,
    ownerEmployeeId: null,
    fax: "",
    customerStatusId: activeLookupId(lookups?.customerStatuses ?? []),
    phones: [],
    contacts: [],
    addresses: [],
    notes: [],
  };
}

function draftFromDetail(customer: CustomerDetail): CustomerDraft {
  return {
    customerNo: customer.customerNo ?? "",
    shortName: customer.shortName,
    fullName: customer.fullName ?? "",
    taxId: customer.taxId ?? "",
    customerCategoryId: customer.category?.id ?? null,
    regionId: customer.region?.id ?? null,
    ownerDepartmentId: customer.ownerDepartment?.id ?? null,
    ownerEmployeeId: customer.ownerEmployee?.id ?? null,
    fax: customer.fax ?? "",
    customerStatusId: customer.status?.id ?? null,
    phones: customer.phones.map((row) => ({
      id: row.id,
      phoneNumber: row.phoneNumber,
      extension: row.extension,
      note: row.note,
      sortOrder: row.sortOrder,
    })),
    contacts: customer.contacts.map((row) => ({
      id: row.id,
      name: row.name,
      departmentName: row.departmentName,
      title: row.title,
      phone: row.phone,
      mobile: row.mobile,
      note: row.note,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    })),
    addresses: customer.addresses.map((row) => ({
      id: row.id,
      postalCode: row.postalCode,
      address: row.address,
      note: row.note,
      sortOrder: row.sortOrder,
    })),
    notes: customer.notes.map((row) => ({
      id: row.id,
      content: row.content,
      sortOrder: row.sortOrder,
    })),
  };
}

function profileFromDraft(
  draft: CustomerDraft,
  customerNo: string | null,
  confirmDuplicateTaxId: boolean,
): CustomerProfileInput {
  return {
    customerNo,
    shortName: draft.shortName.trim(),
    fullName: draft.fullName.trim() || null,
    taxId: draft.taxId.trim() || null,
    customerCategoryId: draft.customerCategoryId,
    regionId: draft.regionId,
    ownerDepartmentId: draft.ownerDepartmentId,
    ownerEmployeeId: draft.ownerEmployeeId,
    fax: draft.fax.trim() || null,
    customerStatusId: draft.customerStatusId,
    phones: draft.phones
      .filter((row) => row.phoneNumber.trim())
      .map((row, index) => ({
        ...row,
        phoneNumber: row.phoneNumber.trim(),
        extension: row.extension?.trim() || null,
        note: row.note?.trim() || null,
        sortOrder: index,
      })),
    contacts: draft.contacts
      .filter((row) => row.name.trim())
      .map((row, index) => ({
        ...row,
        name: row.name.trim(),
        departmentName: row.departmentName?.trim() || null,
        title: row.title?.trim() || null,
        phone: row.phone?.trim() || null,
        mobile: row.mobile?.trim() || null,
        note: row.note?.trim() || null,
        sortOrder: index,
      })),
    addresses: draft.addresses
      .filter((row) => row.address.trim())
      .map((row, index) => ({
        ...row,
        postalCode: row.postalCode?.trim() || null,
        address: row.address.trim(),
        note: row.note?.trim() || null,
        sortOrder: index,
      })),
    notes: draft.notes
      .filter((row) => row.content.trim())
      .map((row, index) => ({
        ...row,
        content: row.content.trim(),
        sortOrder: index,
      })),
    confirmDuplicateTaxId,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT") || error.status === 409) {
      return "資料已被其他人修改，請重新載入後再操作。";
    }
    if (error.code === "ACCESS_DENIED") return "你目前沒有客戶模組使用權。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    if (error.code === "IDENTITY_UNAVAILABLE") return "身分服務暫時無法使用，請稍後再試。";
    const field = error.fields ? Object.values(error.fields)[0] : null;
    return field || error.message || error.code;
  }
  return "目前無法完成客戶資料操作。";
}

function emptyVisit(): VisitDraft {
  return { record: null, visitDate: today(), contactId: null, personSnapshot: "", content: "" };
}

function emptyQuote(item: CustomerItemOption | null): QuoteDraft {
  return {
    corrected: null,
    itemId: item?.id ?? null,
    quoteDate: today(),
    quantity: "1",
    unit: item?.baseUnit ?? "個",
    unitPrice: "0",
    note: "",
    correctionReason: "",
  };
}

export function CustomerOperationalPage() {
  const [lookups, setLookups] = useState<CustomerModuleLookups | null>(null);
  const [itemOptions, setItemOptions] = useState<readonly CustomerItemOption[]>([]);
  const [rows, setRows] = useState<readonly CustomerSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<CustomerDetail | null>(null);
  const [visits, setVisits] = useState<readonly CustomerVisitRecord[]>([]);
  const [quotes, setQuotes] = useState<readonly CustomerItemQuoteSummary[]>([]);
  const [frequentItems, setFrequentItems] = useState<readonly CustomerFrequentItemRecord[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft | null>(null);
  const [relatedTab, setRelatedTab] = useState<RelatedTab>("visits");
  const [visitDraft, setVisitDraft] = useState<VisitDraft | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null);
  const [frequentItemId, setFrequentItemId] = useState<number | null>(null);
  const [frequentText, setFrequentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [relatedEpoch, setRelatedEpoch] = useState(0);
  const { confirm, confirmationDialog } = useConfirmation();
  const unsavedGuard = useUnsavedChangesGuard({ active: editing, blocked: busy, message: "目前有尚未儲存的客戶修改，確定放棄？" });
  useUnsavedChangesGuard({ active: visitDraft !== null || quoteDraft !== null || frequentText.trim() !== "" || frequentItemId !== null });
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", confirmTone: "danger",
  }))).allowed;
  const [numberDraft, setNumberDraft] = useState<{ record: CustomerDetail; number: string; reason: string } | null>(null);
  const numberFormId = useId();
  const numberGuard = useUnsavedChangesGuard({ active: !!numberDraft &&
    (numberDraft.number !== (numberDraft.record.customerNo ?? "") || numberDraft.reason !== (numberDraft.record.customerNo ? "ERP 編號更正" : "ERP 建檔後回填")) });
  async function closeNumber() {
    if (busy) return;
    if ((await numberGuard.confirmNavigationAsync(description => confirm({ title: "放棄客戶編號修改", description,
      confirmLabel: "放棄修改", confirmTone: "danger" }))).allowed) setNumberDraft(null);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCustomerLookups(), searchCustomerItemOptions("", 100)])
      .then(([lookupValue, items]) => {
        if (cancelled) return;
        setLookups(lookupValue);
        setItemOptions(items);
      })
      .catch((error) => {
        if (!cancelled) setMessage(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      const categoryId = categoryFilter ? Number(categoryFilter) : undefined;
      const statusId = statusFilter ? Number(statusFilter) : undefined;
      void searchCustomers({
        q: query.trim() || undefined,
        customerCategoryId: Number.isSafeInteger(categoryId) && (categoryId ?? 0) > 0 ? categoryId : undefined,
        customerStatusId: Number.isSafeInteger(statusId) && (statusId ?? 0) > 0 ? statusId : undefined,
        limit: 100,
      })
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          if (!editing && !creating) {
            setSelectedId((current) => (
              current != null && result.items.some((row) => row.id === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => {
          if (!cancelled) setMessage(errorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setLoadingList(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, categoryFilter, statusFilter, refreshEpoch, editing, creating]);

  useEffect(() => {
    if (selectedId == null || creating) {
      setSelected(null);
      setVisits([]);
      setQuotes([]);
      setFrequentItems([]);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void Promise.all([
      loadCustomerDetail(selectedId),
      loadCustomerVisits(selectedId, 100),
      loadCustomerQuotes(selectedId, 100),
      loadCustomerFrequentItems(selectedId),
    ])
      .then(([detail, visitPage, quotePage, frequent]) => {
        if (cancelled) return;
        setSelected(detail);
        setVisits(visitPage.items);
        setQuotes(quotePage.items);
        setFrequentItems(frequent);
      })
      .catch((error) => {
        if (!cancelled) {
          setSelected(null);
          setVisits([]);
          setQuotes([]);
          setFrequentItems([]);
          setMessage(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, refreshEpoch, relatedEpoch]);

  const categories = useMemo(() => lookups?.customerCategories ?? [], [lookups]);
  const statuses = useMemo(() => lookups?.customerStatuses ?? [], [lookups]);
  const regions = useMemo(() => lookups?.regions ?? [], [lookups]);

  async function selectCustomer(id: number) {
    if (busy || !(await canLeave())) return;
    setSelectedId(id);
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setVisitDraft(null);
    setQuoteDraft(null);
    setMessage(null);
  }

  async function startCreate() {
    if (busy || !(await canLeave())) return;
    setSelectedId(null);
    setSelected(null);
    setCreating(true);
    setEditing(true);
    setDraft(newDraft(lookups));
    setMessage(null);
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setDraft(draftFromDetail(selected));
    setMessage(null);
  }

  async function cancelEdit() {
    if (busy || !(await canLeave())) return;
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
    setMessage(null);
  }

  function patchDraft(patch: Partial<CustomerDraft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    if (!draft?.shortName.trim()) return;

    setBusy(true);
    setMessage(null);
    try {
      let confirmDuplicateTaxId = false;
      const taxId = draft.taxId.trim();
      if (taxId) {
        const check = await checkCustomerTaxId(taxId, creating ? undefined : selected?.id);
        if (check.requiresConfirmation) {
          confirmDuplicateTaxId = await confirm({ title: "確認重複統編",
            description: `已有 ${check.matches.length} 筆客戶使用相同統編 ${taxId}。仍要儲存嗎？`, confirmLabel: "仍要儲存" });
          if (!confirmDuplicateTaxId) return;
        }
      }

      const customerNo = creating ? draft.customerNo.trim() || null : selected?.customerNo ?? null;
      const profile = profileFromDraft(draft, customerNo, confirmDuplicateTaxId);
      const saved = creating
        ? await createCustomer(profile)
        : selected
          ? await updateCustomer(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelectedId(saved.id);
      setSelected(saved);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(creating ? "客戶已新增。" : "客戶已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function setCustomerNumber() {
    if (!selected || busy) return;
    setMessage(null);
    setNumberDraft({ record: selected, number: selected.customerNo ?? "", reason: selected.customerNo ? "ERP 編號更正" : "ERP 建檔後回填" });
  }

  async function saveCustomerNumber(event: FormEvent) {
    event.preventDefault();
    if (!numberDraft || busy) return;
    const { record, number, reason } = numberDraft;
    const next = number.trim() || null;
    if (next === record.customerNo) { setNumberDraft(null); return; }

    setBusy(true);
    setMessage(null);
    try {
      const saved = await changeCustomerNumber(record.id, {
        newCustomerNo: next,
        expectedRevision: record.revision,
        changeReason: reason.trim() || null,
      });
      setSelected(saved);
      setNumberDraft(null);
      setMessage("ERP 客戶編號已更新。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function addPhone() {
    if (!draft) return;
    patchDraft({
      phones: [...draft.phones, { phoneNumber: "", extension: null, note: null, sortOrder: draft.phones.length }],
    });
  }

  function addContact() {
    if (!draft) return;
    patchDraft({
      contacts: [...draft.contacts, {
        name: "", departmentName: null, title: null, phone: null, mobile: null,
        note: null, sortOrder: draft.contacts.length, isActive: true,
      }],
    });
  }

  function addAddress() {
    if (!draft) return;
    patchDraft({
      addresses: [...draft.addresses, { postalCode: null, address: "", note: null, sortOrder: draft.addresses.length }],
    });
  }

  function addNote() {
    if (!draft) return;
    patchDraft({ notes: [...draft.notes, { content: "", sortOrder: draft.notes.length }] });
  }

  async function saveVisit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !visitDraft?.visitDate || !visitDraft.content.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        visitDate: visitDraft.visitDate,
        contactId: visitDraft.contactId,
        personSnapshot: visitDraft.personSnapshot.trim() || null,
        content: visitDraft.content.trim(),
      };
      if (visitDraft.record) {
        await updateCustomerVisit(selected.id, visitDraft.record.id, {
          ...payload,
          expectedRevision: visitDraft.record.revision,
        });
      } else {
        await createCustomerVisit(selected.id, payload);
      }
      setVisitDraft(null);
      setRelatedEpoch((value) => value + 1);
      setMessage("拜訪紀錄已儲存。");
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function editVisit(visit: CustomerVisitRecord) {
    setVisitDraft({
      record: visit,
      visitDate: visit.visitDate,
      contactId: visit.contactId,
      personSnapshot: visit.personSnapshot ?? "",
      content: visit.content ?? "",
    });
  }

  async function removeVisit(visit: CustomerVisitRecord) {
    if (!selected || busy) return;
    if (!(await confirm({ title: "刪除拜訪紀錄", description: `確定刪除 ${visit.visitDate} 的拜訪紀錄？此操作無法復原。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteCustomerVisit(selected.id, visit.id, { expectedRevision: visit.revision });
      setRelatedEpoch((value) => value + 1);
      setMessage("拜訪紀錄已刪除。");
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function startQuote() {
    setQuoteDraft(emptyQuote(itemOptions[0] ?? null));
  }

  async function startQuoteCorrection(summary: CustomerItemQuoteSummary) {
    if (!selected || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const detail = await loadCustomerQuote(selected.id, summary.id);
      const first = detail.priceBreaks[0];
      setQuoteDraft({
        corrected: detail,
        itemId: detail.itemId,
        quoteDate: detail.quoteDate,
        quantity: first?.quantity ?? "1",
        unit: first?.unit ?? itemOptions.find((row) => row.id === detail.itemId)?.baseUnit ?? "個",
        unitPrice: first?.unitPrice ?? "0",
        note: first?.note ?? "",
        correctionReason: "",
      });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveQuote(event: FormEvent) {
    event.preventDefault();
    if (!selected || !quoteDraft?.itemId || busy) return;
    const quantity = quoteDraft.quantity.trim();
    const unitPrice = quoteDraft.unitPrice.trim();
    if (!quantity || !unitPrice || !quoteDraft.unit.trim()) return;

    setBusy(true);
    setMessage(null);
    try {
      const base = {
        itemId: quoteDraft.itemId,
        quoteDate: quoteDraft.quoteDate,
        priceBreaks: [{
          quantity,
          unit: quoteDraft.unit.trim(),
          unitPrice,
          note: quoteDraft.note.trim() || null,
          sortOrder: 0,
        }],
      };
      if (quoteDraft.corrected) {
        await correctCustomerQuote(selected.id, quoteDraft.corrected.id, {
          ...base,
          expectedRevision: quoteDraft.corrected.revision,
          correctionReason: quoteDraft.correctionReason.trim() || null,
        });
      } else {
        await createCustomerQuote(selected.id, base);
      }
      setQuoteDraft(null);
      setRelatedEpoch((value) => value + 1);
      setMessage("報價紀錄已儲存。");
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function addFrequentItem(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    const custom = frequentText.trim();
    if ((frequentItemId == null) === !custom) {
      setMessage("請選擇正式商品，或輸入未建檔品項；兩者擇一。");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      await createCustomerFrequentItem(selected.id, {
        itemId: frequentItemId,
        customItemName: frequentItemId == null ? custom : null,
        customCategoryName: null,
        sortOrder: frequentItems.length,
      });
      setFrequentItemId(null);
      setFrequentText("");
      setRelatedEpoch((value) => value + 1);
      setMessage("常用商品已加入。");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeFrequent(row: CustomerFrequentItemRecord) {
    if (!selected || busy) return;
    if (!(await confirm({ title: "移除常用商品", description: "確定移除此常用商品？", confirmLabel: "移除", confirmTone: "danger" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteCustomerFrequentItem(selected.id, row.id, { expectedUpdatedAt: row.updatedAt });
      setRelatedEpoch((value) => value + 1);
      setMessage("常用商品已移除。");
    } catch (error) {
      setMessage(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cy-customer-op">
      {confirmationDialog}
      {numberDraft ? <Dialog open title="ERP 客戶編號" size="small" dismissible={!busy} onClose={() => void closeNumber()}
        description="輸入 ERP 客戶編號；留空代表清除目前編號。"
        footer={<div className="cy-dialog-action-row"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void closeNumber()}>取消</button><button type="submit" form={numberFormId} className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button></div>}>
        <form id={numberFormId} className="cy-op-form-grid" onSubmit={event => void saveCustomerNumber(event)}>
          <label className="wide">ERP 客戶編號<input className="cy-op-input" disabled={busy} value={numberDraft.number} onChange={event => setNumberDraft({ ...numberDraft, number: event.target.value })} /></label>
          <label className="wide">指派／更正原因<textarea className="cy-op-input" disabled={busy} value={numberDraft.reason} onChange={event => setNumberDraft({ ...numberDraft, reason: event.target.value })} /></label>
          {message ? <p role="alert">{message}</p> : null}
        </form>
      </Dialog> : null}
      <div className="cy-op-page-header cy-customer-page-header">
        <div>
          <h1>客戶</h1>
          <p>管理客戶資料、聯絡人、拜訪紀錄、報價與常用商品。</p>
        </div>
        <div className="cy-op-page-actions">
          <button className="cy-op-button primary" disabled={busy} onClick={startCreate}>新增客戶</button>
        </div>
      </div>

      {message ? <div className="cy-notice cy-notice-warning"><div className="cy-notice-body">{message}</div></div> : null}

      <div className="cy-customer-workspace">
        <section className="cy-op-panel cy-customer-search-pane">
          <div className="cy-customer-search-controls">
            <input
              className="cy-op-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋編號、名稱、統編"
            />
            <div className="cy-customer-filter-row">
              <select className="cy-op-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">全部分類</option>
                {categories.map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}
              </select>
              <select className="cy-op-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">全部狀態</option>
                {statuses.map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}
              </select>
            </div>
            <div className="cy-customer-result-count">{loadingList ? "讀取客戶中…" : `搜尋結果 ${rows.length} 筆`}</div>
          </div>

          <div className="cy-op-list cy-customer-result-list">
            {rows.map((customer) => (
              <button
                key={customer.id}
                className={`cy-customer-result-row ${selectedId === customer.id ? "active" : ""}`}
                onClick={() => selectCustomer(customer.id)}
              >
                <div className="cy-customer-result-main">
                  <strong>{customer.shortName}</strong>
                  <span>{customer.customerNo ?? "尚無 ERP 編號"}</span>
                </div>
                <span className="cy-customer-result-region">{customer.region?.name ?? "—"}</span>
                <span className="cy-customer-result-status">{customer.status?.name ?? "未設定"}</span>
              </button>
            ))}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的客戶。</div> : null}
          </div>
        </section>

        <section className="cy-op-panel cy-customer-detail-pane">
          {editing && draft ? (
            <form className="cy-op-form" onSubmit={(event) => void saveCustomer(event)}>
              <div className="cy-op-panel-header cy-customer-edit-header">
                <div>
                  <h2>{creating ? "新增客戶" : `修改 ${selected?.shortName ?? "客戶"}`}</h2>
                  <p>{creating ? "ERP 客戶編號可先留空" : "既有 ERP 客戶編號請使用受控動作更正"}</p>
                </div>
                <div className="cy-customer-inline-actions">
                  <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
                  <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
                </div>
              </div>

              <div className="cy-customer-form-body">
                <div className="cy-op-form-grid">
                  <label>客戶名稱／簡稱<input className="cy-op-input" value={draft.shortName} disabled={busy} onChange={(e) => patchDraft({ shortName: e.target.value })} required /></label>
                  <label>完整名稱<input className="cy-op-input" value={draft.fullName} disabled={busy} onChange={(e) => patchDraft({ fullName: e.target.value })} /></label>
                  <label>ERP 客戶編號<input className="cy-op-input" value={creating ? draft.customerNo : selected?.customerNo ?? ""} disabled={!creating || busy} onChange={(e) => creating && patchDraft({ customerNo: e.target.value })} placeholder="可稍後回填" /></label>
                  <label>統編<input className="cy-op-input" inputMode="numeric" value={draft.taxId} disabled={busy} onChange={(e) => patchDraft({ taxId: e.target.value })} /></label>
                  <label>地區<select className="cy-op-input" value={draft.regionId ?? ""} disabled={busy} onChange={(e) => patchDraft({ regionId: e.target.value ? Number(e.target.value) : null })}><option value="">未設定</option>{regions.filter((row) => row.isActive || row.id === draft.regionId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>分類<select className="cy-op-input" value={draft.customerCategoryId ?? ""} disabled={busy} onChange={(e) => patchDraft({ customerCategoryId: e.target.value ? Number(e.target.value) : null })}><option value="">未分類</option>{categories.filter((row) => row.isActive || row.id === draft.customerCategoryId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>狀態<select className="cy-op-input" value={draft.customerStatusId ?? ""} disabled={busy} onChange={(e) => patchDraft({ customerStatusId: e.target.value ? Number(e.target.value) : null })}><option value="">未設定</option>{statuses.filter((row) => row.isActive || row.id === draft.customerStatusId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>傳真<input className="cy-op-input" value={draft.fax} disabled={busy} onChange={(e) => patchDraft({ fax: e.target.value })} /></label>
                </div>

                <EditableRows title="電話" addLabel="增加電話" onAdd={addPhone}>
                  {draft.phones.map((row, index) => <div className="cy-customer-edit-row phone" key={row.id ?? `phone-${index}`}><input className="cy-op-input" placeholder="電話" value={row.phoneNumber} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, phoneNumber: e.target.value } : item) })} /><input className="cy-op-input" placeholder="分機" value={row.extension ?? ""} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, extension: e.target.value || null } : item) })} /><input className="cy-op-input grow" placeholder="備註" value={row.note ?? ""} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, note: e.target.value || null } : item) })} /><button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patchDraft({ phones: draft.phones.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="聯絡人" addLabel="增加聯絡人" onAdd={addContact}>
                  {draft.contacts.map((row, index) => <div className="cy-customer-edit-row contact" key={row.id ?? `contact-${index}`}><input className="cy-op-input" placeholder="姓名" value={row.name} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /><input className="cy-op-input" placeholder="職稱" value={row.title ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, title: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="電話" value={row.phone ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, phone: e.target.value || null } : item) })} /><input className="cy-op-input" placeholder="手機" value={row.mobile ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, mobile: e.target.value || null } : item) })} /><button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patchDraft({ contacts: draft.contacts.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="地址" addLabel="增加地址" onAdd={addAddress}>
                  {draft.addresses.map((row, index) => <div className="cy-customer-edit-row address" key={row.id ?? `address-${index}`}><input className="cy-op-input" placeholder="郵遞區號" value={row.postalCode ?? ""} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, postalCode: e.target.value || null } : item) })} /><input className="cy-op-input grow" placeholder="地址" value={row.address} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, address: e.target.value } : item) })} /><input className="cy-op-input" placeholder="備註" value={row.note ?? ""} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, note: e.target.value || null } : item) })} /><button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patchDraft({ addresses: draft.addresses.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>

                <EditableRows title="重要備註" addLabel="增加備註" onAdd={addNote}>
                  {draft.notes.map((row, index) => <div className="cy-customer-edit-row note" key={row.id ?? `note-${index}`}><textarea className="cy-op-input" rows={2} value={row.content} disabled={busy} onChange={(e) => patchDraft({ notes: draft.notes.map((item, i) => i === index ? { ...item, content: e.target.value } : item) })} /><button type="button" className="cy-op-button danger" disabled={busy} onClick={() => patchDraft({ notes: draft.notes.filter((_, i) => i !== index) })}>移除</button></div>)}
                </EditableRows>
              </div>

              <div className="cy-op-form-footer cy-customer-form-footer">
                <button type="button" className="cy-op-button" disabled={busy} onClick={cancelEdit}>取消</button>
                <button className="cy-op-button primary" disabled={busy}>{busy ? "儲存中…" : "儲存"}</button>
              </div>
            </form>
          ) : selected ? (
            <div>
              <div className="cy-op-panel-header cy-customer-detail-header">
                <div><h2>{selected.shortName}</h2><p>{selected.customerNo ?? "尚未建立 ERP 客戶編號"} · rev.{selected.revision}</p></div>
                <div className="cy-customer-action-stack"><button className="cy-op-button primary" disabled={busy} onClick={startEdit}>修改</button></div>
              </div>

              <div className="cy-customer-detail-body">
                {loadingDetail ? <p className="cy-customer-muted">更新客戶資料中…</p> : null}
                <section className="cy-customer-profile-grid">
                  <InfoCard title="基本資料">
                    <Info label="完整名稱" value={selected.fullName} />
                    <Info label="統編" value={selected.taxId} />
                    <Info label="地區" value={selected.region?.name} />
                    <Info label="分類" value={selected.category?.name} />
                    <Info label="狀態" value={selected.status?.name} />
                    <Info label="傳真" value={selected.fax} />
                    <div className="cy-customer-number-row"><Info label="ERP 客戶編號" value={selected.customerNo} /><button className="cy-op-button compact" disabled={busy} onClick={() => void setCustomerNumber()}>{selected.customerNo ? "更正" : "回填"}</button></div>
                  </InfoCard>
                  <InfoCard title="聯絡方式">
                    {selected.phones.length ? selected.phones.map((row) => <Info key={row.id} label="電話" value={`${row.phoneNumber}${row.extension ? ` #${row.extension}` : ""}`} />) : <p className="cy-customer-muted">尚無電話</p>}
                    {selected.contacts.filter((row) => row.isActive).map((row) => <Info key={row.id} label={row.title ?? "聯絡人"} value={`${row.name}${row.mobile ? ` · ${row.mobile}` : row.phone ? ` · ${row.phone}` : ""}`} />)}
                  </InfoCard>
                  <InfoCard title="地址">
                    {selected.addresses.map((row) => <Info key={row.id} label="地址" value={`${row.postalCode ? `${row.postalCode} ` : ""}${row.address}`} />)}
                    {!selected.addresses.length ? <p className="cy-customer-muted">尚無地址</p> : null}
                  </InfoCard>
                  <InfoCard title="重要備註">
                    {selected.notes.map((row) => <p className="cy-customer-important-note" key={row.id}>{row.content}</p>)}
                    {!selected.notes.length ? <p className="cy-customer-muted">尚無重要備註</p> : null}
                  </InfoCard>
                </section>

                <section className="cy-customer-related">
                  <div className="cy-customer-related-tabs">
                    {(["visits", "quotes", "frequent", "activity"] as RelatedTab[]).map((tab) => <button key={tab} className={relatedTab === tab ? "active" : ""} onClick={() => { setRelatedTab(tab); setVisitDraft(null); setQuoteDraft(null); }}>{tab === "visits" ? "拜訪紀錄" : tab === "quotes" ? "報價紀錄" : tab === "frequent" ? "常用商品" : "動態／歷史"}</button>)}
                  </div>

                  {relatedTab === "visits" ? <VisitsPanel selected={selected} rows={visits} draft={visitDraft} setDraft={setVisitDraft} save={saveVisit} edit={editVisit} remove={removeVisit} busy={busy} /> : null}
                  {relatedTab === "quotes" ? <QuotesPanel items={itemOptions} rows={quotes} draft={quoteDraft} setDraft={setQuoteDraft} startNew={startQuote} save={saveQuote} correct={startQuoteCorrection} busy={busy} /> : null}
                  {relatedTab === "frequent" ? <FrequentPanel items={itemOptions} rows={frequentItems} itemId={frequentItemId} setItemId={setFrequentItemId} freeText={frequentText} setFreeText={setFrequentText} add={addFrequentItem} remove={removeFrequent} busy={busy} /> : null}
                  {relatedTab === "activity" ? <div className="cy-customer-related-content"><h3>重要操作</h3><p className="cy-customer-muted">重要異動已保存至稽核紀錄；管理員可在「稽核／操作記錄」依客戶與操作類型查詢。</p></div> : null}
                </section>
              </div>
            </div>
          ) : loadingDetail ? <div className="cy-op-empty">讀取客戶資料中…</div> : <div className="cy-op-empty">請從左側選擇客戶，或新增一筆客戶。</div>}
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

function VisitsPanel({ selected, rows, draft, setDraft, save, edit, remove, busy }: {
  selected: CustomerDetail;
  rows: readonly CustomerVisitRecord[];
  draft: VisitDraft | null;
  setDraft: (value: VisitDraft | null) => void;
  save: (event: FormEvent) => void;
  edit: (visit: CustomerVisitRecord) => void;
  remove: (visit: CustomerVisitRecord) => void;
  busy: boolean;
}) {
  const contacts = selected.contacts.filter((row) => row.isActive);
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>拜訪紀錄</h3><button className="cy-op-button primary" disabled={busy} onClick={() => setDraft(emptyVisit())}>新增拜訪</button></div>{draft ? <form className="cy-customer-related-form" onSubmit={save}><label>日期<input className="cy-op-input" type="date" value={draft.visitDate} disabled={busy} onChange={(e) => setDraft({ ...draft, visitDate: e.target.value })} /></label><label>聯絡人<select className="cy-op-input" value={draft.contactId ?? ""} disabled={busy} onChange={(e) => setDraft({ ...draft, contactId: e.target.value ? Number(e.target.value) : null, personSnapshot: e.target.value ? "" : draft.personSnapshot })}><option value="">自由輸入</option>{contacts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{draft.contactId == null ? <label>拜訪對象<input className="cy-op-input" value={draft.personSnapshot} disabled={busy} onChange={(e) => setDraft({ ...draft, personSnapshot: e.target.value })} /></label> : null}<label className="wide">內容<textarea className="cy-op-input" rows={3} value={draft.content} disabled={busy} onChange={(e) => setDraft({ ...draft, content: e.target.value })} required /></label><div className="cy-customer-related-form-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>儲存</button></div></form> : null}<div className="cy-customer-timeline">{rows.map((visit) => <div className="cy-customer-visit" key={visit.id}><div><strong>{visit.visitDate} · {visit.personSnapshot ?? "未指定對象"}</strong><p>{visit.content || "—"}</p><span>{visit.employee.displayName ?? visit.employee.employeeNo ?? "使用者"} · rev.{visit.revision}</span></div><div className="cy-customer-row-actions"><button className="cy-op-button compact" disabled={busy} onClick={() => edit(visit)}>修改</button><button className="cy-op-button compact danger" disabled={busy} onClick={() => void remove(visit)}>刪除</button></div></div>)}{rows.length === 0 ? <p className="cy-customer-muted">尚無拜訪紀錄。</p> : null}</div></div>;
}

function QuotesPanel({ items, rows, draft, setDraft, startNew, save, correct, busy }: {
  items: readonly CustomerItemOption[];
  rows: readonly CustomerItemQuoteSummary[];
  draft: QuoteDraft | null;
  setDraft: (value: QuoteDraft | null) => void;
  startNew: () => void;
  save: (event: FormEvent) => void;
  correct: (quote: CustomerItemQuoteSummary) => void;
  busy: boolean;
}) {
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>報價紀錄</h3><button className="cy-op-button primary" disabled={busy || items.length === 0} onClick={startNew}>新增報價</button></div>{draft ? <form className="cy-customer-related-form quote" onSubmit={save}><label>日期<input className="cy-op-input" type="date" value={draft.quoteDate} disabled={busy} onChange={(e) => setDraft({ ...draft, quoteDate: e.target.value })} /></label><label>商品<select className="cy-op-input" value={draft.itemId ?? ""} disabled={busy} onChange={(e) => { const id = Number(e.target.value); const item = items.find((row) => row.id === id); setDraft({ ...draft, itemId: id, unit: item?.baseUnit ?? draft.unit }); }}>{items.map((row) => <option value={row.id} key={row.id}>{row.itemNo} · {row.name}</option>)}</select></label><label>數量<input className="cy-op-input" inputMode="decimal" value={draft.quantity} disabled={busy} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} /></label><label>單位<input className="cy-op-input" value={draft.unit} disabled={busy} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></label><label>單價<input className="cy-op-input" inputMode="decimal" value={draft.unitPrice} disabled={busy} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} /></label><label className="wide">備註<input className="cy-op-input" value={draft.note} disabled={busy} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>{draft.corrected ? <label className="wide">修正原因<input className="cy-op-input" value={draft.correctionReason} disabled={busy} onChange={(e) => setDraft({ ...draft, correctionReason: e.target.value })} /></label> : null}<div className="cy-customer-related-form-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => setDraft(null)}>取消</button><button className="cy-op-button primary" disabled={busy}>{draft.corrected ? "儲存修正" : "儲存報價"}</button></div></form> : null}<div className="cy-customer-quote-list">{rows.map((quote) => <div className="cy-customer-quote" key={quote.id}><div><strong>{quote.quoteDate} · {quote.itemNoSnapshot} {quote.itemNameSnapshot}</strong><p>{quote.specSnapshot ?? "無規格"}</p><span>{quote.employee.displayName ?? quote.employee.employeeNo ?? "使用者"} · rev.{quote.revision}</span></div><button className="cy-op-button compact" disabled={busy} onClick={() => void correct(quote)}>修正紀錄</button></div>)}{rows.length === 0 ? <p className="cy-customer-muted">尚無報價紀錄。</p> : null}</div></div>;
}

function FrequentPanel({ items, rows, itemId, setItemId, freeText, setFreeText, add, remove, busy }: {
  items: readonly CustomerItemOption[];
  rows: readonly CustomerFrequentItemRecord[];
  itemId: number | null;
  setItemId: (value: number | null) => void;
  freeText: string;
  setFreeText: (value: string) => void;
  add: (event: FormEvent) => void;
  remove: (row: CustomerFrequentItemRecord) => void;
  busy: boolean;
}) {
  return <div className="cy-customer-related-content"><div className="cy-customer-related-head"><h3>常用商品</h3></div><form className="cy-customer-frequent-form" onSubmit={add}><select className="cy-op-input" value={itemId ?? ""} disabled={busy} onChange={(e) => { setItemId(e.target.value ? Number(e.target.value) : null); if (e.target.value) setFreeText(""); }}><option value="">未建檔品項</option>{items.map((row) => <option key={row.id} value={row.id}>{row.itemNo} · {row.name}</option>)}</select><input className="cy-op-input" placeholder="選未建檔品項時輸入名稱" value={freeText} disabled={busy || itemId != null} onChange={(e) => setFreeText(e.target.value)} /><button className="cy-op-button primary" disabled={busy}>加入</button></form><div className="cy-customer-frequent-list">{rows.map((row) => <div className="cy-customer-frequent-row" key={row.id}><div><strong>{row.item ? `${row.item.itemNo} · ${row.item.name}` : row.customItemName ?? "未命名品項"}</strong><span>{row.item ? "正式商品" : "未建檔自由文字"}</span></div><button className="cy-op-button compact danger" disabled={busy} onClick={() => void remove(row)}>移除</button></div>)}{rows.length === 0 ? <p className="cy-customer-muted">尚無常用商品。</p> : null}</div></div>;
}
