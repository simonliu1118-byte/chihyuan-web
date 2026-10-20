import { IconButton } from "../../ui/actions/IconButton";
import { recordIdFromHash, replaceRouteParams } from "../navigation/route-params";
import { QuoteCreateForm } from "./customer/QuoteCreateForm";
import { RelatedCard } from "../../ui/records/RelatedCard";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { taipeiToday } from "../../../shared/erp-query-history";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { Dialog } from "../../ui/overlays/Dialog";
import { ChangeLogList } from "./AuditOperationalPage";
import { formatDate, formatDateTime, formatPerson, formatItem } from "../../ui/foundation/format";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
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

type RelatedView = "visits" | "quotes" | "frequent";
type RelatedDialog = { view: RelatedView; mode: "create" | "browse" };

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

interface QuoteLineDraft {
  item: CustomerItemOption | null;
  quantity: string;
  unit: string;
  unitPrice: string;
}
interface QuoteDraft {
  corrected: CustomerItemQuoteDetail | null;
  quoteDate: string;
  lines: QuoteLineDraft[];
  note: string;
  correctionReason: string;
}

/** Business dates follow Taiwan time; toISOString() would give yesterday before 08:00. */
function today(): string {
  return taipeiToday();
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
    if (error.code.includes("REVISION_CONFLICT")) {
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

function emptyQuote(): QuoteDraft {
  return { corrected: null, quoteDate: today(), lines: [emptyQuoteLine()], note: "", correctionReason: "" };
}
function emptyQuoteLine(): QuoteLineDraft {
  return { item: null, quantity: "1", unit: "個", unitPrice: "0" };
}

export function CustomerOperationalPage({ role }: {role:"ADMIN"|"SUPER_ADMIN"|"USER"}) {
  const [lookups, setLookups] = useState<CustomerModuleLookups | null>(null);
  const [rows, setRows] = useState<readonly CustomerSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => recordIdFromHash());
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
  const [relatedView, setRelatedView] = useState<RelatedDialog | null>(null);
  const [relatedFilter, setRelatedFilter] = useState("");
  const [frequentAdding, setFrequentAdding] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const pane = useMasterDetailPane();
  const [visitDraft, setVisitDraft] = useState<VisitDraft | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null);
  const [frequentItemId, setFrequentItemId] = useState<number | null>(null);
  const [frequentText, setFrequentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  // The page appears once its first list page is in; until then only the shared spinner shows.
  const [listReady, setListReady] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const paging = useLoadMore(searchCustomers, setRows, (error) => reportError(errorMessage(error)));
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  useEffect(() => {
    const receiveRecordLink = () => {
      if (!window.location.hash.startsWith("#customers?")) return;
      const id = recordIdFromHash();
      if (id) { setSelectedId(id); pane.open(); }
    };
    receiveRecordLink();
    window.addEventListener("hashchange", receiveRecordLink);
    return () => window.removeEventListener("hashchange", receiveRecordLink);
  }, []);

  const [relatedEpoch, setRelatedEpoch] = useState(0);
  const { confirm, confirmationDialog } = useConfirmation();
  const unsavedGuard = useUnsavedChangesGuard({ active: editing || visitDraft !== null || quoteDraft !== null || frequentText.trim() !== "" || frequentItemId !== null, blocked: busy, message: "放棄尚未儲存的內容？" });
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", confirmTone: "danger",
  }))).allowed;
  async function backToList() {
    if (editing) {
      if (busy || !(await canLeave())) return;
      setEditing(false);
      setCreating(false);
      setDraft(null);
    }
    pane.close();
  }

  useEffect(() => {
    let cancelled = false;
    void loadCustomerLookups()
      .then((lookupValue) => {
        if (cancelled) return;
        setLookups(lookupValue);
      })
      .catch((error) => {
        if (!cancelled) reportError(errorMessage(error));
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
      const listQuery = {
        q: query.trim() || undefined,
        customerCategoryId: Number.isSafeInteger(categoryId) && (categoryId ?? 0) > 0 ? categoryId : undefined,
        customerStatusId: Number.isSafeInteger(statusId) && (statusId ?? 0) > 0 ? statusId : undefined,
        limit: 100,
      };
      void searchCustomers(listQuery)
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          paging.reset(listQuery, result.nextCursor);
          if (!editing && !creating) {
            setSelectedId((current) => (
              current != null && (result.items.some((row) => row.id === current) || recordIdFromHash() === current)
                ? current
                : result.items[0]?.id ?? null
            ));
          }
        })
        .catch((error) => {
          if (!cancelled) reportError(errorMessage(error));
        })
        .finally(() => {
          if (!cancelled) { setLoadingList(false); setListReady(true); }
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
          reportError(errorMessage(error));
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
    pane.open();
    replaceRouteParams({});
    setSelectedId(id);
    setRelatedView(null);
    setHistoryOpen(false);
    setFrequentItemId(null);
    setFrequentText("");
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setVisitDraft(null);
    setQuoteDraft(null);
    setMessage(null);
  }

  async function startCreate() {
    if (busy || !(await canLeave())) return;
    pane.open();
    setSelectedId(null);
    setRelatedView(null);
    setVisitDraft(null);
    setQuoteDraft(null);
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
    if (creating) pane.close();
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
      let saved = creating
        ? await createCustomer(profile)
        : selected
          ? await updateCustomer(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      // The ERP number has its own audited change; it follows the profile save with the new revision.
      const nextCustomerNo = draft.customerNo.trim() || null;
      if (!creating && nextCustomerNo !== saved.customerNo) {
        setSelected(saved);
        saved = await changeCustomerNumber(saved.id, { newCustomerNo: nextCustomerNo, expectedRevision: saved.revision,
          changeReason: saved.customerNo ? "客戶編號更正" : "客戶編號建檔後回填" });
      }
      setSelectedId(saved.id);
      setSelected(saved);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(creating ? "客戶已新增。" : "客戶已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
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
      if (relatedView?.mode === "create") setRelatedView(null);
      setRelatedEpoch((value) => value + 1);
      setMessage("拜訪紀錄已儲存。");
    } catch (error) {
      reportError(errorMessage(error));
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
    if (!(await confirm({ title: "刪除拜訪紀錄", description: `確定刪除 ${formatDate(visit.visitDate)} 的拜訪紀錄？此操作無法復原。`, confirmLabel: "刪除", confirmTone: "danger" }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteCustomerVisit(selected.id, visit.id, { expectedRevision: visit.revision });
      setRelatedEpoch((value) => value + 1);
      setMessage("拜訪紀錄已刪除。");
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  function startQuote() {
    setQuoteDraft(emptyQuote());
  }

  async function startQuoteCorrection(summary: CustomerItemQuoteSummary) {
    if (!selected || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const detail = await loadCustomerQuote(selected.id, summary.id);
      const item: CustomerItemOption = {
        id: detail.itemId, itemNo: detail.itemNoSnapshot, name: detail.itemNameSnapshot,
        spec: detail.specSnapshot, baseUnit: detail.priceBreaks[0]?.unit ?? "個",
      };
      setQuoteDraft({
        corrected: detail, quoteDate: detail.quoteDate,
        lines: detail.priceBreaks.map(tier => ({
          item, quantity: tier.quantity, unit: tier.unit, unitPrice: tier.unitPrice,
        })),
        note: detail.priceBreaks[0]?.note ?? "", correctionReason: "",
      });
    } catch (error) {
      reportError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveQuote(event: FormEvent) {
    event.preventDefault();
    if (!selected || !quoteDraft || busy) return;
    const lines = quoteDraft.lines;
    if (!quoteDraft.quoteDate || !lines.length || lines.some(row => !row.item || !row.quantity.trim() || !row.unit.trim() || !row.unitPrice.trim())) {
      reportError("每列請選擇商品並填寫數量、單位及單價。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const correction = quoteDraft.corrected;
      if (!correction) return;
      const itemId = lines[0].item!.id;
      if (lines.some(row => row.item?.id !== itemId)) {
        reportError("單筆修正只能包含同一個商品的數量級距。");
        return;
      }
      await correctCustomerQuote(selected.id, correction.id, {
        itemId, quoteDate: quoteDraft.quoteDate,
        priceBreaks: lines.map((row, index) => ({
          quantity: row.quantity.trim(), unit: row.unit.trim(), unitPrice: row.unitPrice.trim(),
          note: quoteDraft.note.trim() || null, sortOrder: index,
        })),
        expectedRevision: correction.revision,
        correctionReason: quoteDraft.correctionReason.trim() || null,
      });
      setQuoteDraft(null);
      if (relatedView?.mode === "create") setRelatedView(null);
      setRelatedEpoch(value => value + 1);
      setMessage("報價紀錄已儲存。");
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch(value => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function addFrequentItem(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    const custom = frequentText.trim();
    if ((frequentItemId == null) === !custom) {
      reportError("請選擇正式商品，或輸入未建檔品項；兩者擇一。");
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
      setFrequentAdding(false);
      if (relatedView?.mode === "create") setRelatedView(null);
      setRelatedEpoch((value) => value + 1);
      setMessage("常用商品已加入。");
    } catch (error) {
      reportError(errorMessage(error));
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
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRelatedEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  // Cards and their dialogs list the same records in the same order: newest first.
  const visitsNewestFirst = useMemo(() => [...visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate)), [visits]);
  const quotesNewestFirst = useMemo(() => [...quotes].sort((a, b) => b.quoteDate.localeCompare(a.quoteDate)), [quotes]);

  function openRelated(view: RelatedView, create = false) {
    if (busy) return;
    setVisitDraft(null);
    setQuoteDraft(null);
    setFrequentItemId(null);
    setFrequentText("");
    setFrequentAdding(view === "frequent" && create);
    setRelatedFilter("");
    if (view === "visits" && create) setVisitDraft(emptyVisit());
    if (view === "quotes" && create) startQuote();
    setRelatedView({ view, mode: create ? "create" : "browse" });
  }

  async function closeRelated() {
    if (busy) return;
    if (visitDraft || quoteDraft || frequentItemId !== null || frequentText.trim() !== "") {
      if (!(await confirm({
        title: "放棄尚未儲存的內容？",
        description: "目前的新增或修改內容尚未儲存，確定關閉視窗？",
        confirmLabel: "放棄內容", confirmTone: "danger",
      }))) return;
    }
    setVisitDraft(null);
    setQuoteDraft(null);
    setFrequentItemId(null);
    setFrequentText("");
    setFrequentAdding(false);
    setRelatedView(null);
  }

  if (!listReady) return <Loading />;

  return (
    <div className="cy-customer-op">
      {confirmationDialog}
      {selected && (role === "ADMIN" || role === "SUPER_ADMIN") && historyOpen ?
        <Dialog open size="large" title={`修改紀錄 — ${selected.shortName}`}
          onClose={()=>setHistoryOpen(false)}>
          <ChangeLogList role={role} customerId={selected.id}/>
        </Dialog> : null}
      {selected && relatedView ? <Dialog open size="large"
        title={`${relatedView.view === "visits" ? "拜訪紀錄" : relatedView.view === "quotes" ? "報價紀錄" : "常用商品"} — ${selected.shortName}`}
        onClose={() => void closeRelated()}>
        {relatedView.mode === "browse" ? <div className="cy-related-toolbar">
          <button className="cy-op-button primary compact" type="button" aria-label={relatedView.view === "visits" ? "新增拜訪" : relatedView.view === "quotes" ? "新增報價" : "新增常用商品"} disabled={busy || visitDraft !== null || quoteDraft !== null || frequentAdding} onClick={() => {
            if (relatedView.view === "visits") setVisitDraft(emptyVisit());
            if (relatedView.view === "quotes") startQuote();
            if (relatedView.view === "frequent") setFrequentAdding(true);
          }}>＋ 新增</button>
          <input type="search" className="cy-op-input" aria-label="搜尋相關紀錄" value={relatedFilter}
            onChange={event => setRelatedFilter(event.target.value)}
            placeholder={relatedView.view === "visits" ? "搜尋內容、拜訪對象、聯絡人" : "搜尋品號、品名或自訂名稱"} />
        </div> : null}
        {relatedView.view === "visits" ? <VisitsPanel selected={selected} rows={visitsNewestFirst} draft={visitDraft}
          setDraft={setVisitDraft} save={saveVisit} edit={editVisit} remove={removeVisit} busy={busy}
          filter={relatedFilter} mode={relatedView.mode} onCancel={() => {
            setVisitDraft(null); if (relatedView.mode === "create") setRelatedView(null);
          }} /> : null}
        {relatedView.view === "quotes" ? <QuotesPanel customerId={selected.id} rows={quotesNewestFirst} draft={quoteDraft} setDraft={setQuoteDraft}
          save={saveQuote} correct={startQuoteCorrection} busy={busy} filter={relatedFilter} mode={relatedView.mode}
          onCreated={() => { setQuoteDraft(null); if (relatedView.mode === "create") setRelatedView(null); setRelatedEpoch(v => v + 1); setMessage("報價紀錄已儲存。"); }}
          onCancel={() => { setQuoteDraft(null); if (relatedView.mode === "create") setRelatedView(null); }} /> : null}
        {relatedView.view === "frequent" ? <FrequentPanel rows={frequentItems} itemId={frequentItemId}
          setItemId={setFrequentItemId} freeText={frequentText} setFreeText={setFrequentText}
          add={addFrequentItem} remove={removeFrequent} busy={busy} filter={relatedFilter}
          mode={relatedView.mode} adding={frequentAdding} onCancel={() => {
            setFrequentAdding(false); setFrequentItemId(null); setFrequentText("");
            if (relatedView.mode === "create") setRelatedView(null);
          }} /> : null}
      </Dialog> : null}

      <FeedbackBanner message={message} tone={messageTone} />

      <div className="cy-md cy-customer-workspace" data-pane={pane.pane}>
        <section className="cy-op-panel cy-md-list" aria-label="客戶清單">
          <div className="cy-md-toolbar">
            <div className="cy-md-toolbar-lead">
              <button type="button" className="cy-op-button primary" disabled={busy} onClick={() => void startCreate()}>＋ 新增客戶</button>
              <input
                className="cy-op-input"
                type="search"
                aria-label="搜尋客戶"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋編號、名稱、統編"
              />
            </div>
            <div className="cy-md-toolbar-row">
              <select className="cy-op-input" aria-label="客戶分類" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">全部分類</option>
                {categories.map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}
              </select>
              <select className="cy-op-input" aria-label="客戶狀態" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">全部狀態</option>
                {statuses.map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}
              </select>
            </div>
            <div className="cy-md-count">{loadingList ? <Loading inline /> : (paging.hasMore ? `已載入 ${rows.length} 筆，還有更多` : `共 ${rows.length} 筆`)}</div>
          </div>

          <div className="cy-op-list cy-customer-result-list">
            {rows.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`cy-customer-result-row ${selectedId === customer.id ? "active" : ""}`}
                aria-current={selectedId === customer.id ? "true" : undefined}
                onClick={() => void selectCustomer(customer.id)}
              >
                <span className="cy-customer-result-main">
                  <span>{customer.customerNo ?? "未設定編號"}</span>
                  <strong>{customer.shortName}</strong>
                </span>
                <span className={`cy-status-chip ${customer.status ? "cy-status-chip-success" : ""}`}>{customer.status?.name ?? "未設定"}</span>
              </button>
            ))}
            {loadingList && rows.length === 0 ? <Loading /> : null}
            {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的客戶。</div> : null}
            <LoadMoreRow hasMore={paging.hasMore} loading={paging.loading} onMore={() => void paging.more()} />
          </div>
        </section>

        <section className="cy-op-panel cy-md-detail cy-customer-detail-pane">
          <MasterDetailBack label="客戶清單" onBack={() => void backToList()} disabled={busy} />
          {editing && draft ? (
            <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={(event) => void saveCustomer(event)}>
              <div className="cy-record-header cy-edit-header">
                <div>
                  <h2>{creating ? "新增客戶" : `修改 ${selected?.shortName ?? "客戶"}`}</h2>
                </div>
              <div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button>
                <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立客戶" : "儲存修改"}</button></div></div>

              <div className="cy-customer-form-body">
                <div className="cy-op-form-grid">
                  <label>客戶名稱／簡稱<input className="cy-op-input" value={draft.shortName} disabled={busy} onChange={(e) => patchDraft({ shortName: e.target.value })} required /></label>
                  <label>完整名稱<input className="cy-op-input" value={draft.fullName} disabled={busy} onChange={(e) => patchDraft({ fullName: e.target.value })} /></label>
                  <label>客戶編號<input className="cy-op-input" value={draft.customerNo} disabled={busy} onChange={(e) => patchDraft({ customerNo: e.target.value })} placeholder="可稍後補填" /></label>
                  <label>統編<input className="cy-op-input" inputMode="numeric" value={draft.taxId} disabled={busy} onChange={(e) => patchDraft({ taxId: e.target.value })} /></label>
                  <label>地區<select className="cy-op-input" value={draft.regionId ?? ""} disabled={busy} onChange={(e) => patchDraft({ regionId: e.target.value ? Number(e.target.value) : null })}><option value="">未設定</option>{regions.filter((row) => row.isActive || row.id === draft.regionId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>分類<select className="cy-op-input" value={draft.customerCategoryId ?? ""} disabled={busy} onChange={(e) => patchDraft({ customerCategoryId: e.target.value ? Number(e.target.value) : null })}><option value="">未分類</option>{categories.filter((row) => row.isActive || row.id === draft.customerCategoryId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>狀態<select className="cy-op-input" value={draft.customerStatusId ?? ""} disabled={busy} onChange={(e) => patchDraft({ customerStatusId: e.target.value ? Number(e.target.value) : null })}><option value="">未設定</option>{statuses.filter((row) => row.isActive || row.id === draft.customerStatusId).map((row) => <option key={row.id} value={row.id}>{row.isActive ? row.name : `${row.name}（已停用）`}</option>)}</select></label>
                  <label>傳真<input className="cy-op-input" value={draft.fax} disabled={busy} onChange={(e) => patchDraft({ fax: e.target.value })} /></label>
                </div>

                <EditableRows title="電話" addLabel="增加電話" onAdd={addPhone} empty={!draft.phones.length} busy={busy}>
                  {draft.phones.map((row, index) => <div className="cy-customer-edit-row phone" key={row.id ?? `phone-${index}`}><input className="cy-op-input" aria-label="電話" placeholder="電話" value={row.phoneNumber} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, phoneNumber: e.target.value } : item) })} /><input className="cy-op-input" aria-label="分機" placeholder="分機" value={row.extension ?? ""} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, extension: e.target.value || null } : item) })} /><input className="cy-op-input grow" aria-label="電話備註" placeholder="備註" value={row.note ?? ""} disabled={busy} onChange={(e) => patchDraft({ phones: draft.phones.map((item, i) => i === index ? { ...item, note: e.target.value || null } : item) })} /><RemoveRow busy={busy} onRemove={() => patchDraft({ phones: draft.phones.filter((_, i) => i !== index) })} /></div>)}
                </EditableRows>

                <EditableRows title="聯絡人" addLabel="增加聯絡人" onAdd={addContact} empty={!draft.contacts.length} busy={busy}>
                  {draft.contacts.map((row, index) => <div className="cy-customer-edit-row contact" key={row.id ?? `contact-${index}`}><input className="cy-op-input" aria-label="姓名" placeholder="姓名" value={row.name} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} /><input className="cy-op-input" aria-label="職稱" placeholder="職稱" value={row.title ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, title: e.target.value || null } : item) })} /><input className="cy-op-input" aria-label="聯絡人電話" placeholder="電話" value={row.phone ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, phone: e.target.value || null } : item) })} /><input className="cy-op-input" aria-label="手機" placeholder="手機" value={row.mobile ?? ""} disabled={busy} onChange={(e) => patchDraft({ contacts: draft.contacts.map((item, i) => i === index ? { ...item, mobile: e.target.value || null } : item) })} /><RemoveRow busy={busy} onRemove={() => patchDraft({ contacts: draft.contacts.filter((_, i) => i !== index) })} /></div>)}
                </EditableRows>

                <EditableRows title="地址" addLabel="增加地址" onAdd={addAddress} empty={!draft.addresses.length} busy={busy}>
                  {draft.addresses.map((row, index) => <div className="cy-customer-edit-row address" key={row.id ?? `address-${index}`}><input className="cy-op-input" aria-label="郵遞區號" placeholder="郵遞區號" value={row.postalCode ?? ""} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, postalCode: e.target.value || null } : item) })} /><input className="cy-op-input grow" aria-label="地址" placeholder="地址" value={row.address} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, address: e.target.value } : item) })} /><input className="cy-op-input" aria-label="地址備註" placeholder="備註" value={row.note ?? ""} disabled={busy} onChange={(e) => patchDraft({ addresses: draft.addresses.map((item, i) => i === index ? { ...item, note: e.target.value || null } : item) })} /><RemoveRow busy={busy} onRemove={() => patchDraft({ addresses: draft.addresses.filter((_, i) => i !== index) })} /></div>)}
                </EditableRows>

                <EditableRows title="重要備註" hint="會以醒目提示顯示在客戶資料最上方，例如付款條件、出貨注意事項。" addLabel="增加備註" onAdd={addNote} empty={!draft.notes.length} busy={busy}>
                  {draft.notes.map((row, index) => <div className="cy-customer-edit-row note" key={row.id ?? `note-${index}`}><textarea className="cy-op-input" aria-label="重要備註" rows={2} value={row.content} disabled={busy} onChange={(e) => patchDraft({ notes: draft.notes.map((item, i) => i === index ? { ...item, content: e.target.value } : item) })} /><RemoveRow busy={busy} onRemove={() => patchDraft({ notes: draft.notes.filter((_, i) => i !== index) })} /></div>)}
                </EditableRows>
              </div>

            </form>
          ) : loadingDetail ? <Loading /> : selected ? (
            <div>
              <div className="cy-record-header">
                <div>
                  <h2>{selected.customerNo ? `${selected.customerNo} ` : ""}{selected.shortName}{selected.fullName ? <small className="cy-record-title-note">（{selected.fullName}）</small> : null}</h2>
                  <p className="cy-record-meta">最後修改：{formatDateTime(selected.updatedAt)}{selected.updatedBy ? ` · ${formatPerson(selected.updatedBy)}` : ""}</p>
                </div>
                <div className="cy-record-actions">
                  {selected.status ? <span className="cy-status-chip cy-status-chip-success">{selected.status.name}</span> : null}
                  <button type="button" className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                  {role !== "USER" ? <IconButton icon="🕘" label="修改紀錄" onClick={() => setHistoryOpen(true)} disabled={busy} /> : null}
                </div>
              </div>

              {selected.notes.length ? <div className="cy-customer-alert" role="note">
                <strong>重要備註</strong>
                {selected.notes.map((row) => <p key={row.id}>{row.content}</p>)}
              </div> : null}

              <section className="cy-customer-profile" aria-label="基本資料">
                <dl className="cy-customer-facts">
                  <Info label="統編" value={selected.taxId} mono />
                  <Info label="分類" value={selected.category?.name} />
                  <Info label="地區" value={selected.region?.name} />
                  <Info label="負責業務" value={selected.ownerEmployee ? formatPerson(selected.ownerEmployee) : null} />
                  <Info label="傳真" value={selected.fax} mono />
                </dl>
                <div className="cy-customer-contact-grid">
                  <div>
                    <h3>電話與聯絡人</h3>
                    {selected.phones.map((row) => <p key={`p${row.id}`} className="cy-customer-line"><span className="cy-mono">{row.phoneNumber}{row.extension ? ` #${row.extension}` : ""}</span>{row.note ? <small>{row.note}</small> : null}</p>)}
                    {selected.contacts.filter((row) => row.isActive).map((row) => <p key={`c${row.id}`} className="cy-customer-line"><span>{row.name}{row.title ? `（${row.title}）` : ""}</span><small className="cy-mono">{row.mobile ?? row.phone ?? ""}</small></p>)}
                    {!selected.phones.length && !selected.contacts.some((row) => row.isActive) ? <p className="cy-customer-muted">尚無電話或聯絡人</p> : null}
                  </div>
                  <div>
                    <h3>地址</h3>
                    {selected.addresses.map((row) => <p key={row.id} className="cy-customer-line"><span>{`${row.postalCode ? `${row.postalCode} ` : ""}${row.address}`}</span>{row.note ? <small>{row.note}</small> : null}</p>)}
                    {!selected.addresses.length ? <p className="cy-customer-muted">尚無地址</p> : null}
                  </div>
                </div>
              </section>

              <section className="cy-customer-cards" aria-label="客戶相關紀錄">
                <RelatedCard title="拜訪紀錄" count={visits.length} empty="尚無拜訪紀錄。"
                  onView={() => openRelated("visits")} onAdd={() => openRelated("visits", true)}
                  rows={visitsNewestFirst.slice(0, 3).map(row =>
                    <span key={row.id} title={row.content ?? ""}>{formatDate(row.visitDate)} · {row.personSnapshot || selected.contacts.find(c => c.id === row.contactId)?.name || "未指定對象"} · {row.content?.split("\n")[0] || "—"}</span>)} />
                <RelatedCard title="報價紀錄" count={quotes.length} empty="尚無報價紀錄。"
                  onView={() => openRelated("quotes")} onAdd={() => openRelated("quotes", true)}
                  rows={quotesNewestFirst.slice(0, 3).map(row =>
                    <span key={row.id}>{formatDate(row.quoteDate)} {formatItem(row.itemNoSnapshot, row.itemNameSnapshot)}</span>)} />
                <RelatedCard title="常用商品" count={frequentItems.length} empty="尚無常用商品。"
                  onView={() => openRelated("frequent")} onAdd={() => openRelated("frequent", true)}
                  rows={[...frequentItems].sort((a,b) => a.sortOrder-b.sortOrder).slice(0,3).map(row =>
                    <span key={row.id}>{row.item ? formatItem(row.item.itemNo, row.item.name) : row.customItemName || "未命名品項"}</span>)} />
              </section>
            </div>
          ) : <MasterDetailEmpty title="尚未選擇客戶" hint="從左側清單選一位客戶，或按清單上方的「＋ 新增客戶」。" />}
        </section>
      </div>
    </div>
  );
}


function EditableRows({ title, hint, addLabel, onAdd, empty, busy, children }: { title: string; hint?: string; addLabel: string; onAdd: () => void; empty: boolean; busy: boolean; children: React.ReactNode }) {
  return <section className="cy-form-block"><div className="cy-form-block-head"><div><h3>{title}</h3>{hint ? <p>{hint}</p> : null}</div><button type="button" className="cy-op-button compact" disabled={busy} onClick={onAdd}>＋ {addLabel}</button></div><div className="cy-form-block-body">{empty ? <p className="cy-form-block-empty">尚未填寫。</p> : children}</div></section>;
}

function RemoveRow({ busy, onRemove }: { busy: boolean; onRemove: () => void }) {
  return <button type="button" className="cy-op-button compact quiet cy-row-remove" aria-label="移除這一列" title="移除這一列" disabled={busy} onClick={onRemove}>移除</button>;
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return <div className="cy-customer-info"><dt>{label}</dt><dd className={mono && value ? "cy-mono" : undefined}>{value || "—"}</dd></div>;
}

function VisitsPanel({ selected, rows, draft, setDraft, save, edit, remove, busy, mode, filter, onCancel }: {
  selected: CustomerDetail;
  rows: readonly CustomerVisitRecord[];
  draft: VisitDraft | null;
  setDraft: (value: VisitDraft | null) => void;
  save: (event: FormEvent) => void;
  edit: (visit: CustomerVisitRecord) => void;
  remove: (visit: CustomerVisitRecord) => void;
  busy: boolean;
  mode: "create" | "browse";
  filter: string;
  onCancel: () => void;
}) {
  const contacts = selected.contacts.filter(row => row.isActive);
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(visit => !q || [
    visit.content, visit.personSnapshot,
    contacts.find(row => row.id === visit.contactId)?.name,
  ].some(text => text?.toLowerCase().includes(q)));
  return <div className="cy-customer-related-content">
    {draft ? <form onKeyDown={enterAdvancesFields} className="cy-customer-related-form" onSubmit={save}>
      <label>日期<input className="cy-op-input" type="date" max="9999-12-31" value={draft.visitDate} disabled={busy}
        onChange={event => setDraft({ ...draft, visitDate: event.target.value })} required /></label>
      <label>聯絡人<select className="cy-op-input" value={draft.contactId ?? ""} disabled={busy}
        onChange={event => setDraft({ ...draft, contactId: event.target.value ? Number(event.target.value) : null,
          personSnapshot: event.target.value ? "" : draft.personSnapshot })}>
        <option value="">自由輸入</option>
        {contacts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      {draft.contactId == null ? <label>拜訪對象<input className="cy-op-input" value={draft.personSnapshot}
        disabled={busy} onChange={event => setDraft({ ...draft, personSnapshot: event.target.value })} /></label> : null}
      <label className="wide">內容<textarea className="cy-op-input" rows={3} value={draft.content} required
        disabled={busy} onChange={event => setDraft({ ...draft, content: event.target.value })} /></label>
      <div className="cy-customer-related-form-actions">
        <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy}>儲存</button>
      </div>
    </form> : null}
    {mode === "browse" ? <div className="cy-customer-timeline">
      {visible.map(visit => <div className="cy-customer-visit" key={visit.id}>
        <div><strong>{formatDate(visit.visitDate)} · {visit.personSnapshot ??
          contacts.find(row => row.id === visit.contactId)?.name ?? "未指定對象"}</strong>
          <p>{visit.content || "—"}</p>
          <span>{formatPerson(visit.employee)} · rev.{visit.revision}</span>
        </div>
        <div className="cy-customer-row-actions">
          <button className="cy-op-button compact" disabled={busy} onClick={() => edit(visit)}>修改</button>
          <button className="cy-op-button compact danger" disabled={busy} onClick={() => void remove(visit)}>刪除</button>
        </div>
      </div>)}
      {!visible.length ? <p className="cy-customer-muted">沒有符合條件的拜訪紀錄。</p> : null}
    </div> : null}
  </div>;
}

const searchQuoteItem = async (query: string) => searchCustomerItemOptions(query, 20);
const quoteItemLabel = (row: CustomerItemOption) => formatItem(row.itemNo, row.name);

function QuotesPanel({ customerId, rows, draft, setDraft, save, correct, busy, mode, filter, onCancel, onCreated }: {
  customerId: number;
  onCreated: () => void;
  rows: readonly CustomerItemQuoteSummary[];
  draft: QuoteDraft | null;
  setDraft: (value: QuoteDraft | null) => void;
  save: (event: FormEvent) => void;
  correct: (quote: CustomerItemQuoteSummary) => void;
  busy: boolean;
  mode: "create" | "browse";
  filter: string;
  onCancel: () => void;
}) {
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(row => !q || formatItem(row.itemNoSnapshot, row.itemNameSnapshot).toLowerCase().includes(q));
  const groups = new Map<string, CustomerItemQuoteSummary[]>();
  for (const quote of visible) {
    const key = `${quote.quoteDate}|${quote.employee.id}`;
    const group = groups.get(key) ?? [];
    group.push(quote);
    groups.set(key, group);
  }
  const patchLine = (index: number, patch: Partial<QuoteLineDraft>) => {
    if (draft) setDraft({ ...draft, lines: draft.lines.map((row, i) => i === index ? { ...row, ...patch } : row) });
  };
  return <div className="cy-customer-related-content">
    {draft && !draft.corrected ? <QuoteCreateForm customerId={customerId} onSaved={onCreated} onCancel={onCancel} /> : null}
    {draft?.corrected ? <form onKeyDown={enterAdvancesFields} className="cy-customer-quote-form" onSubmit={save}>
      <div className="cy-customer-quote-header-fields">
        <label>日期<input type="date" max="9999-12-31" className="cy-op-input" value={draft.quoteDate} disabled={busy}
          required onChange={event => setDraft({ ...draft, quoteDate: event.target.value })} /></label>
        <label>備註<input className="cy-op-input" value={draft.note} disabled={busy} maxLength={120}
          onChange={event => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <div className="cy-customer-quote-lines">
        {draft.lines.map((line, index) => <div key={index} className="cy-customer-quote-line">
          <EntityPicker<CustomerItemOption>
            label="商品" value={line.item} disabled={busy} required
            search={searchQuoteItem} getKey={row => row.id} getLabel={quoteItemLabel}
            minQueryLength={1} placeholder="輸入品號或品名搜尋"
            onSelect={item => patchLine(index, { item, unit: item?.baseUnit ?? line.unit })} />
          <label>數量<input className="cy-op-input" inputMode="decimal" value={line.quantity}
            disabled={busy} required onChange={event => patchLine(index, { quantity: event.target.value })} /></label>
          <label>單位<input className="cy-op-input" value={line.unit}
            disabled={busy} required onChange={event => patchLine(index, { unit: event.target.value })} /></label>
          <label>單價<input className="cy-op-input" inputMode="decimal" value={line.unitPrice}
            disabled={busy} required onChange={event => patchLine(index, { unitPrice: event.target.value })} /></label>
          <button className="cy-op-button compact" type="button" disabled={busy} title="移除品項"
            onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}>移除</button>
        </div>)}
      </div>
      <button type="button" className="cy-op-button compact" disabled={busy || draft.lines.length >= 100}
        onClick={() => setDraft({ ...draft, lines: [...draft.lines, {
          ...emptyQuoteLine(), item: draft.corrected ? draft.lines[0]?.item ?? null : null,
        }] })}>＋ 加一列</button>
      {draft.corrected ? <label className="cy-customer-quote-reason">修正原因
        <input className="cy-op-input" value={draft.correctionReason} disabled={busy}
          onChange={event => setDraft({ ...draft, correctionReason: event.target.value })} />
      </label> : null}
      <div className="cy-customer-related-form-actions">
        <button className="cy-op-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy || draft.lines.length === 0}>
          {draft.corrected ? "儲存修正" : "儲存報價"}
        </button>
      </div>
    </form> : null}
    {mode === "browse" ? <div className="cy-customer-quote-list">
      {Array.from(groups, ([key, group]) => <section key={key} className="cy-customer-quote-group">
        <h3>{formatDate(group[0].quoteDate)}　{formatPerson(group[0].employee)}</h3>
        {group.map(quote => <div className="cy-customer-quote" key={quote.id}>
          <div><strong>{formatItem(quote.itemNoSnapshot, quote.itemNameSnapshot)}</strong>
            {quote.priceBreaks.map(tier => <p key={tier.id}>
              {tier.quantity} {tier.unit}　${tier.unitPrice}
            </p>)}
            <span>rev.{quote.revision}</span>
          </div>
          <button type="button" className="cy-op-button compact" disabled={busy}
            onClick={() => void correct(quote)}>修正紀錄</button>
        </div>)}
      </section>)}
      {!groups.size ? <p className="cy-customer-muted">沒有符合條件的報價紀錄。</p> : null}
    </div> : null}
  </div>;
}

function FrequentPanel({ rows, itemId, setItemId, freeText, setFreeText, add, remove, busy, mode, filter, adding, onCancel }: {
  rows: readonly CustomerFrequentItemRecord[];
  itemId: number | null;
  setItemId: (value: number | null) => void;
  freeText: string;
  setFreeText: (value: string) => void;
  add: (event: FormEvent) => void;
  remove: (row: CustomerFrequentItemRecord) => void;
  busy: boolean;
  mode: "create" | "browse";
  filter: string;
  adding: boolean;
  onCancel: () => void;
}) {
  const [item, setItem] = useState<CustomerItemOption | null>(null);
  useEffect(() => { if (itemId === null) setItem(null); }, [itemId]);
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(row => !q || [
    row.item ? formatItem(row.item.itemNo, row.item.name) : "", row.customItemName,
  ].some(label => label?.toLowerCase().includes(q)));
  return <div className="cy-customer-related-content">
    {adding ? <form onKeyDown={enterAdvancesFields} className="cy-customer-frequent-form" onSubmit={add}>
      <EntityPicker<CustomerItemOption> label="正式商品" value={item}
        search={searchQuoteItem} getKey={row => row.id} getLabel={quoteItemLabel}
        minQueryLength={1} placeholder="輸入品號或品名搜尋" disabled={busy}
        onSelect={selected => { setItem(selected); setItemId(selected?.id ?? null); if (selected) setFreeText(""); }} />
      <label>或輸入未建檔名稱<input className="cy-op-input" value={freeText}
        disabled={busy || itemId !== null} onChange={event => setFreeText(event.target.value)} /></label>
      <div className="cy-customer-related-form-actions">
        <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy}>加入</button>
      </div>
    </form> : null}
    {mode === "browse" ? <div className="cy-customer-frequent-list">
      {visible.map(row => <div className="cy-customer-frequent-row" key={row.id}>
        <div><strong>{row.item ? formatItem(row.item.itemNo, row.item.name) : row.customItemName ?? "未命名品項"}</strong>
          <span>{row.item ? "正式商品" : "未建檔自由文字"}</span></div>
        <button type="button" className="cy-op-button compact danger" disabled={busy}
          onClick={() => void remove(row)}>移除</button>
      </div>)}
      {!visible.length ? <p className="cy-customer-muted">沒有符合條件的常用商品。</p> : null}
    </div> : null}
  </div>;
}
