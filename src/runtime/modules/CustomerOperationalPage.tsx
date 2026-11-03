import { DateInput } from "../../ui/forms/DateInput";
import { Field, FormSection } from "../../ui/forms/Field";
import { RecordRows, RecordSheet, type RowColumn } from "../../ui/forms/RecordSheet";
import { phoneEntryColumns, phoneEntryText } from "../../ui/forms/PhoneInput";
import { Icons } from "../../ui/actions/icons";
import { SidePanel } from "../../ui/overlays/SidePanel";
import { SegmentedControl } from "../../ui/primitives/SegmentedControl";
import { postalCodeForAddress } from "../../../shared/taiwan-postal";
import { REGION_GROUPS } from "../../../shared/taiwan-regions";
import { StatusPicker, StatusPill } from "./customer/StatusName";
import { useSettingsSaved } from "./settings-events";
import { joinPhoneEntry, parsePhoneEntry } from "../../../shared/phone";
import { IconButton } from "../../ui/actions/IconButton";
import { recordIdFromHash, replaceRouteParams } from "../navigation/route-params";
import { QuoteCreateForm } from "./customer/QuoteCreateForm";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { taipeiToday } from "../../../shared/erp-query-history";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { Dialog } from "../../ui/overlays/Dialog";
import { ChangeLogList } from "./AuditOperationalPage";
import { formatDate, formatDateTime, formatPerson, formatItem } from "../../ui/foundation/format";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import type { CustomerItemOption, CustomerModuleLookups } from "../../../shared/business-lookups";
import type {
  CustomerContactInput,
  CustomerDetail,
  CustomerPhoneInput,
  CustomerProfileInput,
  CustomerSummary,
} from "../../../shared/customer";
import { CUSTOMER_LIMITS, INVOICE_TYPE_PRESETS, PAYMENT_TERMS_PRESETS } from "../../../shared/customer";
import { PresetTextInput } from "../../ui/forms/PresetTextInput";
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

interface PhoneDraft { id?: number; entry: string; note: string }
interface AddressDraft { id?: number; postalCode: string; postalAuto: boolean; address: string; note: string }
interface NoteDraft { id?: number; content: string; isImportant: boolean }

interface CustomerDraft {
  customerNo: string;
  shortName: string;
  fullName: string;
  taxId: string;
  paymentTerms: string;
  invoiceType: string;
  customerCategoryId: number | null;
  regionId: number | null;
  ownerDepartmentId: number | null;
  ownerEmployeeId: number | null;
  customerStatusId: number | null;
  phones: PhoneDraft[];
  faxes: PhoneDraft[];
  contacts: CustomerContactInput[];
  addresses: AddressDraft[];
  notes: NoteDraft[];
}

interface VisitDraft {
  record: CustomerVisitRecord | null;
  visitDate: string;
  contactId: number | null;
  personSnapshot: string;
  subject: string;
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
    paymentTerms: "",
    invoiceType: "",
    customerCategoryId: activeLookupId(lookups?.customerCategories ?? []),
    regionId: null,
    ownerDepartmentId: null,
    ownerEmployeeId: null,
    customerStatusId: activeLookupId(lookups?.customerStatuses ?? []),
    phones: [],
    faxes: [],
    contacts: [],
    addresses: [],
    notes: [],
  };
}

function draftFromDetail(customer: CustomerDetail): CustomerDraft {
  const phone = (row: CustomerDetail["phones"][number]): PhoneDraft => ({
    id: row.id, entry: joinPhoneEntry(row.phoneNumber, row.extension), note: row.note ?? "",
  });
  return {
    customerNo: customer.customerNo ?? "",
    shortName: customer.shortName,
    fullName: customer.fullName ?? "",
    taxId: customer.taxId ?? "",
    paymentTerms: customer.paymentTerms ?? "",
    invoiceType: customer.invoiceType ?? "",
    customerCategoryId: customer.category?.id ?? null,
    regionId: customer.region?.id ?? null,
    ownerDepartmentId: customer.ownerDepartment?.id ?? null,
    ownerEmployeeId: customer.ownerEmployee?.id ?? null,
    customerStatusId: customer.status?.id ?? null,
    phones: customer.phones.filter(row => row.kind !== "FAX").map(phone),
    faxes: customer.phones.filter(row => row.kind === "FAX").map(phone),
    contacts: customer.contacts.filter(row => row.isActive).map((row) => ({
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
      id: row.id, postalCode: row.postalCode ?? "", postalAuto: false, address: row.address ?? "", note: row.note ?? "",
    })),
    // Important notes lead the list (user 2026-11-03).
    notes: [...customer.notes].sort((a, b) => Number(b.isImportant) - Number(a.isImportant))
      .map((row) => ({ id: row.id, content: row.content, isImportant: row.isImportant })),
  };
}

function phoneRows(rows: readonly PhoneDraft[], kind: "PHONE" | "FAX"): CustomerPhoneInput[] {
  return rows.flatMap((row) => {
    const { number, extension } = parsePhoneEntry(row.entry);
    return number ? [{ id: row.id, kind, phoneNumber: number, extension: kind === "FAX" ? null : extension, note: row.note.trim() || null }] : [];
  }).map((row, index) => ({ ...row, sortOrder: index }));
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
    paymentTerms: draft.paymentTerms.trim() || null,
    invoiceType: draft.invoiceType.trim() || null,
    customerCategoryId: draft.customerCategoryId,
    regionId: draft.regionId,
    ownerDepartmentId: draft.ownerDepartmentId,
    ownerEmployeeId: draft.ownerEmployeeId,
    customerStatusId: draft.customerStatusId,
    phones: [...phoneRows(draft.phones, "PHONE"), ...phoneRows(draft.faxes, "FAX")],
    // A row is kept when anything in it is filled; no single column is required (user 2026-11-03).
    contacts: draft.contacts
      .filter((row) => [row.name, row.departmentName, row.title, row.phone, row.mobile, row.note].some(value => value?.trim()))
      .map((row, index) => ({
        ...row,
        name: row.name?.trim() || null,
        departmentName: row.departmentName?.trim() || null,
        title: row.title?.trim() || null,
        phone: row.phone?.trim() || null,
        mobile: row.mobile?.trim() || null,
        note: row.note?.trim() || null,
        sortOrder: index,
      })),
    addresses: draft.addresses
      .filter((row) => [row.postalCode, row.address, row.note].some(value => value.trim()))
      .map((row, index) => ({
        id: row.id,
        postalCode: row.postalCode.trim() || null,
        address: row.address.trim() || null,
        note: row.note.trim() || null,
        sortOrder: index,
      })),
    notes: draft.notes
      .filter((row) => row.content.trim())
      .map((row, index) => ({ id: row.id, content: row.content.trim(), isImportant: row.isImportant, sortOrder: index })),
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
  return { record: null, visitDate: today(), contactId: null, personSnapshot: "", subject: "", content: "" };
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
  // A visit removed elsewhere (or by another person) must not stay open in the form.
  useEffect(() => {
    if (visitDraft?.record && !visits.some(row => row.id === visitDraft.record?.id)) setVisitDraft(null);
  }, [visits]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // An opened visit that nobody changed is not unsaved work.
  const visitDirty = visitDraft !== null && !(visitDraft.record && visitDraft.visitDate === visitDraft.record.visitDate
    && visitDraft.contactId === visitDraft.record.contactId && visitDraft.personSnapshot === (visitDraft.record.personSnapshot ?? "")
    && visitDraft.subject === visitDraft.record.subject && visitDraft.content === (visitDraft.record.content ?? ""));
  const unsavedGuard = useUnsavedChangesGuard({ active: editing || visitDirty || quoteDraft !== null || frequentText.trim() !== "" || frequentItemId !== null, blocked: busy, message: "放棄尚未儲存的內容？" });
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

  // Reloaded whenever 設定 saves, so a new category, status or department shows at once (V0.9.97).
  const [lookupEpoch, setLookupEpoch] = useState(0);
  useSettingsSaved(useCallback(() => setLookupEpoch(value => value + 1), []));
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
  }, [lookupEpoch]);

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
    setDraft(withFirstRows(newDraft(lookups)));
    setMessage(null);
  }

  function startEdit() {
    if (!selected) return;
    setCreating(false);
    setEditing(true);
    setDraft(withFirstRows(draftFromDetail(selected)));
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
    // 客戶狀態 is not a sheet field (it is the header pill), so it is checked here.
    if (!draft.customerStatusId) { reportError("請選擇客戶狀態（標題旁的狀態）。"); return; }

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

  type RowList = "phones" | "faxes" | "contacts" | "addresses" | "notes";
  const blankRow: { [K in RowList]: () => CustomerDraft[K][number] } = {
    phones: () => ({ entry: "", note: "" }),
    faxes: () => ({ entry: "", note: "" }),
    contacts: () => ({ name: "", departmentName: null, title: null, phone: null, mobile: null, note: null, sortOrder: 0, isActive: true }),
    addresses: () => ({ postalCode: "", postalAuto: true, address: "", note: "" }),
    notes: () => ({ content: "", isImportant: false }),
  };
  /** Editing opens with one blank row in each list, so nothing needs ＋ first (user 2026-11-03). */
  function withFirstRows(value: CustomerDraft): CustomerDraft {
    const next = { ...value };
    for (const list of ["phones", "faxes", "contacts", "addresses", "notes"] as const) {
      if (!next[list].length) (next as Record<RowList, unknown[]>)[list] = [blankRow[list]()];
    }
    return next;
  }
  function insertRow(list: RowList, after: number) {
    setDraft(current => {
      if (!current) return current;
      const rows = [...current[list]] as unknown[];
      rows.splice(after + 1, 0, blankRow[list]());
      return { ...current, [list]: rows };
    });
  }
  function removeRow(list: RowList, index: number) {
    setDraft(current => current ? { ...current, [list]: (current[list] as unknown[]).filter((_, n) => n !== index) } : current);
  }
  function patchRow<K extends RowList>(list: K, index: number, patch: Partial<CustomerDraft[K][number]>) {
    setDraft(current => current ? { ...current, [list]: (current[list] as object[]).map((row, n) => n === index ? { ...row, ...patch } : row) } : current);
  }

  async function saveVisit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !visitDraft?.visitDate || !visitDraft.subject.trim() || !visitDraft.content.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        visitDate: visitDraft.visitDate,
        contactId: visitDraft.contactId,
        personSnapshot: visitDraft.personSnapshot.trim() || null,
        subject: visitDraft.subject.trim(),
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
      subject: visit.subject,
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
      // The form showed the deleted visit; clear it so it cannot be saved or deleted again.
      setVisitDraft(null);
      setRelatedEpoch((value) => value + 1);
      setMessage("拜訪紀錄已刪除。");
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && (error.status === 409 || error.status === 404)) { setVisitDraft(null); setRelatedEpoch((value) => value + 1); }
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

  const frequentNewestFirst = useMemo(() => [...frequentItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id), [frequentItems]);

  async function switchRelated(view: RelatedView) {
    if (busy || relatedView?.view === view) return;
    if (visitDirty || quoteDraft || frequentItemId !== null || frequentText.trim() !== "") {
      if (!(await confirm({ title: "放棄尚未儲存的內容？", description: "目前的新增或修改內容尚未儲存，確定切換？",
        confirmLabel: "放棄內容", confirmTone: "danger" }))) return;
    }
    setVisitDraft(null); setQuoteDraft(null); setFrequentItemId(null); setFrequentText(""); setFrequentAdding(false);
    setRelatedFilter("");
    setRelatedView({ view, mode: "browse" });
  }

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
    if (visitDirty || quoteDraft || frequentItemId !== null || frequentText.trim() !== "") {
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
      {selected && relatedView ? <SidePanel title={`${selected.shortName}　相關紀錄`} width="min(calc(100vw - 24px), 380px)"
        className="cy-customer-related-side" onClose={() => void closeRelated()}>
        <div className="cy-related-toolbar">
          <SegmentedControl<RelatedView> label="相關紀錄" value={relatedView.view} disabled={busy}
            options={[{ value: "visits", label: `拜訪紀錄 ${visits.length}` }, { value: "quotes", label: `報價紀錄 ${quotes.length}` },
              { value: "frequent", label: `常用商品 ${frequentItems.length}` }]}
            onChange={view => void switchRelated(view)} />
          <input type="search" className="cy-op-input" aria-label="搜尋相關紀錄" value={relatedFilter}
            onChange={event => setRelatedFilter(event.target.value)}
            placeholder={relatedView.view === "visits" ? "搜尋主旨、內容、對象" : "搜尋品號、品名"} />
          <button className="cy-op-button primary compact" type="button" disabled={busy || visitDraft !== null || quoteDraft !== null || frequentAdding}
            onClick={() => {
              if (relatedView.view === "visits") setVisitDraft(emptyVisit());
              if (relatedView.view === "quotes") startQuote();
              if (relatedView.view === "frequent") setFrequentAdding(true);
            }}>＋ {relatedView.view === "visits" ? "新增拜訪" : relatedView.view === "quotes" ? "新增報價" : "新增常用商品"}</button>
        </div>
        {relatedView.view === "visits" ? <VisitsPanel selected={selected} rows={visitsNewestFirst} draft={visitDraft}
          setDraft={setVisitDraft} save={saveVisit} edit={editVisit} remove={removeVisit} busy={busy}
          filter={relatedFilter} onCancel={() => setVisitDraft(null)} /> : null}
        {relatedView.view === "quotes" ? <QuotesPanel customerId={selected.id} rows={quotesNewestFirst} draft={quoteDraft} setDraft={setQuoteDraft}
          save={saveQuote} correct={startQuoteCorrection} busy={busy} filter={relatedFilter} mode="browse"
          onCreated={() => { setQuoteDraft(null); setRelatedEpoch(v => v + 1); setMessage("報價紀錄已儲存。"); }}
          onCancel={() => setQuoteDraft(null)} /> : null}
        {relatedView.view === "frequent" ? <FrequentPanel rows={frequentNewestFirst} itemId={frequentItemId}
          setItemId={setFrequentItemId} freeText={frequentText} setFreeText={setFrequentText}
          add={addFrequentItem} remove={removeFrequent} busy={busy} filter={relatedFilter}
          mode="browse" adding={frequentAdding} onCancel={() => {
            setFrequentAdding(false); setFrequentItemId(null); setFrequentText("");
          }} /> : null}
      </SidePanel> : null}

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
                  <strong title={[customer.customerNo, customer.shortName].filter(Boolean).join(" ")}>{customer.customerNo ? <span className="cy-customer-result-no">{customer.customerNo}</span> : null}{customer.shortName}</strong>
                </span>
                <span className="cy-customer-result-status">{customer.status ? <StatusPill status={lookups?.customerStatuses.find(row => row.id === customer.status?.id) ?? customer.status} /> : null}</span>
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
            <form onKeyDown={enterAdvancesFields} className="cy-op-form cy-customer-sheet-form" onSubmit={(event) => void saveCustomer(event)}>
              <div className="cy-record-header cy-edit-header">
                <div className="cy-customer-edit-title"><h2>{creating ? "新增客戶" : `修改 ${selected?.shortName ?? "客戶"}`}</h2>
                  {/* 客戶狀態 is chosen from its pill in the header (user 2026-11-03). */}
                  <StatusPicker statuses={lookups?.customerStatuses ?? []} value={draft.customerStatusId} disabled={busy} required
                    onChange={customerStatusId => patchDraft({ customerStatusId })} /></div>
                <div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={() => void cancelEdit()}>取消</button>
                  <button className="cy-op-button primary" disabled={busy} aria-busy={busy || undefined}>{creating ? "建立客戶" : "儲存修改"}</button></div>
              </div>
              <CustomerSheet draft={draft} editing busy={busy} lookups={lookups}
                patch={patchDraft} insertRow={insertRow} removeRow={removeRow} patchRow={patchRow} />
            </form>
          ) : loadingDetail ? <Loading /> : selected ? (
            <div>
              <div className="cy-record-header">
                <div>
                  <h2 className="cy-customer-identity">{selected.customerNo ? <span className="cy-customer-identity-no">{selected.customerNo}</span> : null}{selected.shortName}{selected.fullName ? <small className="cy-record-title-note">（{selected.fullName}）</small> : null}
                    {selected.status ? <StatusPill className="cy-customer-identity-status" status={lookups?.customerStatuses.find(row => row.id === selected.status?.id) ?? selected.status} /> : null}</h2>
                </div>
                <div className="cy-record-actions">
                  <button type="button" className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                  {role !== "USER" ? <IconButton icon={Icons.history} label="修改紀錄" onClick={() => setHistoryOpen(true)} disabled={busy} /> : null}
                </div>
              </div>

              {selected.notes.some(row => row.isImportant) ? <div className="cy-customer-alert" role="note">
                <strong>重要備註</strong>
                {selected.notes.filter(row => row.isImportant).map((row, index) => <span key={row.id}>{index + 1}. {row.content}</span>)}
              </div> : null}

              <CustomerSheet draft={draftFromDetail(selected)} editing={false} busy={busy} lookups={lookups}
                ownerLabel={selected.ownerEmployee ? formatPerson(selected.ownerEmployee) : ""}
                patch={() => undefined} insertRow={() => undefined} removeRow={() => undefined} patchRow={() => undefined} />

              <section className="cy-customer-cards" aria-label="客戶相關紀錄">
                <RelatedTable title="拜訪紀錄" count={visits.length} onViewAll={() => openRelated("visits")} disabled={busy}
                  columns={[{ label: "日期", width: "4.4em" }, { label: "聯絡人", width: "4.8em" }, { label: "主旨" }]}
                  rows={visitsNewestFirst.slice(0, 5).map(row => ({ key: row.id, cells: [shortDate(row.visitDate),
                    row.personSnapshot ?? selected.contacts.find(c => c.id === row.contactId)?.name ?? "", row.subject || row.content || ""] }))} />
                <RelatedTable title="報價紀錄" count={quotes.length} onViewAll={() => openRelated("quotes")} disabled={busy}
                  columns={[{ label: "日期", width: "4.4em" }, { label: "商品" }, { label: "價格", width: "8.5em" }]}
                  rows={quotesNewestFirst.slice(0, 5).map(row => ({ key: row.id, cells: [shortDate(row.quoteDate),
                    formatItem(row.itemNoSnapshot, row.itemNameSnapshot),
                    <>{row.priceBreaks.map(tier => <span key={tier.id} className="cy-customer-price-line">{tier.quantity}{tier.unit} ${tier.unitPrice}</span>)}</>] }))} />
                <RelatedTable title="常用商品" count={frequentItems.length} onViewAll={() => openRelated("frequent")} disabled={busy}
                  columns={[{ label: "品號", width: "5.6em" }, { label: "品名" }]}
                  rows={frequentNewestFirst.slice(0, 5).map(row => ({ key: row.id, cells: [row.item?.itemNo ?? "—",
                    row.item?.name ?? row.customItemName ?? ""] }))} />
              </section>
              {/* 最後修改 sits under the record cards (user 2026-11-03). */}
              <p className="cy-record-meta cy-customer-updated">最後修改：{formatDateTime(selected.updatedAt)}{selected.updatedBy ? ` · ${formatPerson(selected.updatedBy)}` : ""}</p>
            </div>
          ) : <MasterDetailEmpty title="尚未選擇客戶" hint="從左側清單選一位客戶，或按清單上方的「＋ 新增客戶」。" />}
        </section>
      </div>
    </div>
  );
}


type RowList = "phones" | "faxes" | "contacts" | "addresses" | "notes";

/** Customer master record as one sheet; the same layout views and edits (PROJECT_RULES §5). */
/** Width shared by 統一編號, 付款條件 and 發票開立. */
const TAIL = "13em";

function CustomerSheet({ draft, editing, busy, lookups, ownerLabel = "", patch, insertRow, removeRow, patchRow }: {
  draft: CustomerDraft;
  editing: boolean;
  busy: boolean;
  lookups: CustomerModuleLookups | null;
  ownerLabel?: string;
  patch: (patch: Partial<CustomerDraft>) => void;
  insertRow: (list: RowList, after: number) => void;
  removeRow: (list: RowList, index: number) => void;
  patchRow: <K extends RowList>(list: K, index: number, patch: Partial<CustomerDraft[K][number]>) => void;
}) {
  const input = "cy-sheet-input", mono = "cy-sheet-input mono";
  const name = (rows: readonly { id: number; name: string; isActive: boolean }[] | undefined, id: number | null) =>
    rows?.find(row => row.id === id)?.name ?? "";
  type Option = { id: number; name: string; isActive: boolean; light?: string };
  const select = (rows: readonly Option[] | undefined, value: number | null,
    onChange: (id: number | null) => void, empty = "未設定", text: (row: Option) => string = row => row.name) =>
    <select className={input} value={value ?? ""} disabled={busy} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)}>
      <option value="">{empty}</option>
      {(rows ?? []).filter(row => row.isActive || row.id === value).map(row => <option key={row.id} value={row.id}>{text(row)}</option>)}
    </select>;
  const owners = lookups?.owners ?? [];
  const ownerName = (id: number | null) => {
    const owner = owners.find(row => row.id === id);
    return owner ? [owner.employeeNo, owner.displayName].filter(Boolean).join(" ") : ownerLabel;
  };
  // Phones take a 分機 column while editing (shared phoneEntryColumns); faxes have no extension.
  const phoneColumns = (label: string, width: string, list: "phones" | "faxes"): RowColumn<PhoneDraft>[] => [
    ...phoneEntryColumns<PhoneDraft>({ label, width: editing && list === "phones" ? "10em" : width, editing, busy, className: mono,
      extension: list === "phones", get: row => row.entry, set: (index, entry) => patchRow(list, index, { entry }) }),
    { label: "備註", view: row => row.note,
      edit: (row, index) => <input className={input} value={row.note} maxLength={240} disabled={busy}
        onChange={event => patchRow(list, index, { note: event.target.value })} /> },
  ];
  return <div className="cy-customer-sheet">
    <RecordSheet label="客戶基本資料" editing={editing} rows={[
      // 客戶狀態 is a pill in the header (user 2026-11-03); 統一編號 lines up with 發票開立 below it and
      // 客戶全稱 ends where 付款條件 ends.
      { columns: `9.5em 12em minmax(0,1fr) ${TAIL}`, cells: [
        { label: "客戶編號", mono: true, view: draft.customerNo,
          edit: <input className={mono} value={draft.customerNo} disabled={busy} maxLength={CUSTOMER_LIMITS.customerNo}
            pattern="[A-Za-z0-9]+" onChange={event => patch({ customerNo: event.target.value.replace(/[^A-Za-z0-9]/g, "") })} /> },
        { label: "客戶簡稱", required: true, view: draft.shortName,
          edit: <input className={input} value={draft.shortName} disabled={busy} maxLength={CUSTOMER_LIMITS.shortName}
            onChange={event => patch({ shortName: event.target.value })} /> },
        { label: "客戶全稱", required: true, view: draft.fullName,
          edit: <input className={input} value={draft.fullName} disabled={busy} maxLength={240}
            onChange={event => patch({ fullName: event.target.value })} /> },
        { label: "統一編號", mono: true, view: draft.taxId,
          edit: <input className={mono} inputMode="numeric" value={draft.taxId} disabled={busy} maxLength={8} pattern="[0-9]{8}"
            onChange={event => patch({ taxId: event.target.value.replace(/\D/g, "") })} /> },
      ] },
      { columns: `repeat(4, minmax(0,1fr)) ${TAIL} ${TAIL}`, cells: [
        { label: "分類", required: true, view: name(lookups?.customerCategories, draft.customerCategoryId),
          edit: select(lookups?.customerCategories, draft.customerCategoryId, customerCategoryId => patch({ customerCategoryId }), "請選擇") },
        { label: "地區", required: true, view: name(lookups?.regions, draft.regionId),
          edit: <select className={input} value={draft.regionId ?? ""} disabled={busy}
            onChange={event => patch({ regionId: event.target.value ? Number(event.target.value) : null })}>
            <option value="">請選擇</option>
            {REGION_GROUPS.map(group => <optgroup key={group.code} label={group.label}>
              {(lookups?.regions ?? []).filter(row => row.groupCode === group.code && (row.isActive || row.id === draft.regionId))
                .map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </optgroup>)}
          </select> },
        { label: "負責部門", view: name(lookups?.departments, draft.ownerDepartmentId),
          edit: select(lookups?.departments, draft.ownerDepartmentId, ownerDepartmentId => patch({ ownerDepartmentId })) },
        { label: "負責業務", view: ownerName(draft.ownerEmployeeId),
          edit: <select className={input} value={draft.ownerEmployeeId ?? ""} disabled={busy}
            onChange={event => patch({ ownerEmployeeId: event.target.value ? Number(event.target.value) : null })}>
            <option value="">未設定</option>
            {owners.filter(row => row.isActive || row.id === draft.ownerEmployeeId).map(row =>
              <option key={row.id} value={row.id}>{[row.employeeNo, row.displayName].filter(Boolean).join(" ")}</option>)}
          </select> },
        { label: "付款條件", view: draft.paymentTerms,
          edit: <PresetTextInput className={input} presets={PAYMENT_TERMS_PRESETS} value={draft.paymentTerms} disabled={busy}
            maxLength={CUSTOMER_LIMITS.termsLength} onChange={paymentTerms => patch({ paymentTerms })} /> },
        { label: "發票開立", view: draft.invoiceType,
          edit: <PresetTextInput className={input} presets={INVOICE_TYPE_PRESETS} value={draft.invoiceType} disabled={busy}
            maxLength={CUSTOMER_LIMITS.termsLength} onChange={invoiceType => patch({ invoiceType })} /> },
      ] },
    ]} />

    <div className={"cy-customer-phonefax" + (editing ? " editing" : "")}>
      <RecordRows title="聯絡電話" editing={editing} busy={busy} columns={phoneColumns("電話", "14.5em", "phones")}
        rows={draft.phones} rowKey={(row, index) => row.id ?? `n${index}`}
        onInsert={after => insertRow("phones", after)} onRemove={index => removeRow("phones", index)} />
      <RecordRows title="傳真" editing={editing} busy={busy} columns={phoneColumns("傳真", "9.6em", "faxes")}
        rows={draft.faxes} rowKey={(row, index) => row.id ?? `n${index}`} max={CUSTOMER_LIMITS.faxes}
        onInsert={after => insertRow("faxes", after)} onRemove={index => removeRow("faxes", index)} />
    </div>

    <RecordRows<CustomerContactInput> title="聯絡人" editing={editing} busy={busy} rows={draft.contacts}
      rowKey={(row, index) => row.id ?? `n${index}`}
      onInsert={after => insertRow("contacts", after)} onRemove={index => removeRow("contacts", index)} columns={[
        { label: "姓名", width: "6.5em", view: row => row.name,
          edit: (row, index) => <input className={input} value={row.name ?? ""} maxLength={120} disabled={busy}
            onChange={event => patchRow("contacts", index, { name: event.target.value })} /> },
        { label: "部門", width: "7em", view: row => row.departmentName,
          edit: (row, index) => <input className={input} value={row.departmentName ?? ""} maxLength={120} disabled={busy}
            onChange={event => patchRow("contacts", index, { departmentName: event.target.value })} /> },
        { label: "職稱", width: "7em", view: row => row.title,
          edit: (row, index) => <input className={input} value={row.title ?? ""} maxLength={120} disabled={busy}
            onChange={event => patchRow("contacts", index, { title: event.target.value })} /> },
        ...phoneEntryColumns<CustomerContactInput>({ label: "電話", width: editing ? "9.5em" : "13em", extensionWidth: "4.5em", editing, busy,
          className: mono, get: row => row.phone ?? "", set: (index, phone) => patchRow("contacts", index, { phone: phone || null }) }),
        ...phoneEntryColumns<CustomerContactInput>({ label: "手機", width: "8.5em", editing, busy, className: mono, extension: false,
          get: row => row.mobile ?? "", set: (index, mobile) => patchRow("contacts", index, { mobile: mobile || null }) }),
        { label: "備註", view: row => row.note,
          edit: (row, index) => <input className={input} value={row.note ?? ""} maxLength={240} disabled={busy}
            onChange={event => patchRow("contacts", index, { note: event.target.value })} /> },
      ]} />

    <RecordRows<AddressDraft> title="地址" editing={editing} busy={busy} rows={draft.addresses}
      rowKey={(row, index) => row.id ?? `n${index}`}
      onInsert={after => insertRow("addresses", after)} onRemove={index => removeRow("addresses", index)} columns={[
        { label: "郵遞區號", width: "6.5em", mono: true, view: row => row.postalCode,
          edit: (row, index) => <input className={mono} inputMode="numeric" value={row.postalCode} maxLength={6} pattern="[0-9]{3}([0-9]{3})?" disabled={busy}
            onChange={event => patchRow("addresses", index, { postalCode: event.target.value.replace(/\D/g, ""), postalAuto: false })} /> },
        { label: "地址", view: row => row.address,
          edit: (row, index) => <input className={input} value={row.address} maxLength={500} disabled={busy}
            onChange={event => {
              const address = event.target.value, auto = row.postalAuto || !row.postalCode;
              patchRow("addresses", index, auto ? { address, postalCode: postalCodeForAddress(address) ?? "", postalAuto: true } : { address });
            }} /> },
        { label: "備註", width: "24%", view: row => row.note,
          edit: (row, index) => <input className={input} value={row.note} maxLength={240} disabled={busy}
            onChange={event => patchRow("addresses", index, { note: event.target.value })} /> },
      ]} />

    {/* 備註 (user 2026-11-03): ★ marks an important note, shown at the top of the record and first here. */}
    <RecordRows<NoteDraft> title="備註" editing={editing} busy={busy} rows={draft.notes} max={CUSTOMER_LIMITS.notes} hideWhenEmpty
      rowKey={(row, index) => row.id ?? `n${index}`}
      onInsert={after => insertRow("notes", after)} onRemove={index => removeRow("notes", index)} columns={[
        { label: "重要", width: "4em", view: row => row.isImportant ? <span className="cy-note-star on" aria-label="重要">★</span> : "",
          edit: (row, index) => <button type="button" className={"cy-note-star" + (row.isImportant ? " on" : "")} disabled={busy}
            aria-pressed={row.isImportant} aria-label={row.isImportant ? "取消重要" : "標為重要"}
            onClick={() => patchRow("notes", index, { isImportant: !row.isImportant })}>{row.isImportant ? "★" : "☆"}</button> },
        { label: "備註", view: row => row.content,
          edit: (row, index) => <input className={input} value={row.content} maxLength={CUSTOMER_LIMITS.noteLength} disabled={busy}
            onChange={event => patchRow("notes", index, { content: event.target.value })} /> },
      ]} />
  </div>;
}

function shortDate(value: string): string {
  return formatDate(value).slice(5);
}

/** A related-record card: the newest rows as a small table, 查看全部 opens the side panel. */
function RelatedTable({ title, count, columns, rows, onViewAll, disabled }: {
  title: string;
  count: number;
  columns: { label: string; width?: string }[];
  rows: { key: number; cells: React.ReactNode[] }[];
  onViewAll: () => void;
  disabled: boolean;
}) {
  return <section className="cy-customer-card" aria-label={title}>
    <header><h3>{title} <span>{count}</span></h3>
      <button type="button" className="cy-link-button" disabled={disabled} onClick={onViewAll}>查看全部 ›</button></header>
    {rows.length ? <table className="cy-customer-card-table">
      <colgroup>{columns.map(column => <col key={column.label} style={column.width ? { width: column.width } : undefined} />)}</colgroup>
      <thead><tr>{columns.map(column => <th key={column.label} scope="col">{column.label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
    </table> : <p className="cy-op-empty">尚無{title}。</p>}
  </section>;
}

function VisitsPanel({ selected, rows, draft, setDraft, save, edit, remove, busy, filter, onCancel }: {
  selected: CustomerDetail;
  rows: readonly CustomerVisitRecord[];
  draft: VisitDraft | null;
  setDraft: (value: VisitDraft | null) => void;
  save: (event: FormEvent) => void;
  edit: (visit: CustomerVisitRecord) => void;
  remove: (visit: CustomerVisitRecord) => void;
  busy: boolean;
  filter: string;
  onCancel: () => void;
}) {
  const contacts = selected.contacts.filter(row => row.isActive);
  const who = (visit: CustomerVisitRecord) => visit.personSnapshot ?? contacts.find(row => row.id === visit.contactId)?.name ?? "";
  const q = filter.trim().toLowerCase();
  const visible = rows.filter(visit => !q || [visit.subject, visit.content, who(visit)].some(text => text?.toLowerCase().includes(q)));
  const input = "cy-sheet-input";
  return <div className="cy-customer-related-content">
    {draft ? <form onKeyDown={enterAdvancesFields} className="cy-customer-related-form" onSubmit={save}>
      <RecordSheet label="拜訪紀錄" editing rows={[
        // 拜訪對象 is typed; the contact picker was dropped (user 2026-11-04). An older visit linked to a
        // contact keeps that link until its 拜訪對象 is edited.
        { columns: "9.5em minmax(0,1fr)", cells: [
          { label: "日期", required: true, view: draft.visitDate,
            edit: <DateInput density="regular" className={input} max="9999-12-31" value={draft.visitDate} disabled={busy}
              onChange={visitDate => setDraft({ ...draft, visitDate })} /> },
          { label: "拜訪對象", view: "", edit: <input className={input} maxLength={200} disabled={busy}
            value={draft.contactId != null && !draft.personSnapshot ? contacts.find(row => row.id === draft.contactId)?.name ?? "" : draft.personSnapshot}
            onChange={event => setDraft({ ...draft, contactId: null, personSnapshot: event.target.value })} /> },
        ] },
        { columns: "minmax(0,1fr)", cells: [{ label: "主旨", required: true, view: "",
          edit: <input className={input} value={draft.subject} maxLength={CUSTOMER_LIMITS.visitSubject} disabled={busy}
            onChange={event => setDraft({ ...draft, subject: event.target.value })} /> }] },
        { columns: "minmax(0,1fr)", cells: [{ label: "內容", required: true, view: "",
          edit: <textarea className={input} rows={3} value={draft.content} disabled={busy}
            onChange={event => setDraft({ ...draft, content: event.target.value })} /> }] },
      ]} />
      <div className="cy-customer-related-form-actions">
        {draft.record ? <button type="button" className="cy-op-button danger" disabled={busy} onClick={() => void remove(draft.record!)}>刪除</button> : null}
        <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy}>儲存</button>
      </div>
    </form> : null}
    <table className="cy-customer-card-table cy-customer-related-list">
      <colgroup><col style={{ width: "6.4em" }} /><col style={{ width: "4.8em" }} /><col /><col style={{ width: "4.4em" }} /></colgroup>
      <thead><tr><th scope="col">日期</th><th scope="col">對象</th><th scope="col">主旨</th><th scope="col">業務</th></tr></thead>
      <tbody>{visible.map(visit => <tr key={visit.id} className={draft?.record?.id === visit.id ? "active" : undefined}
        tabIndex={0} onClick={() => { if (!busy) edit(visit); }} onKeyDown={event => { if (event.key === "Enter" && !busy) edit(visit); }}>
        <td>{formatDate(visit.visitDate)}</td><td>{who(visit)}</td><td>{visit.subject || visit.content}</td>
        <td>{visit.employee.displayName ?? ""}</td>
      </tr>)}</tbody>
    </table>
    {!visible.length ? <p className="cy-op-empty">沒有符合條件的拜訪紀錄。</p> : null}
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
  const patchLine = (index: number, patch: Partial<QuoteLineDraft>) => {
    if (draft) setDraft({ ...draft, lines: draft.lines.map((row, i) => i === index ? { ...row, ...patch } : row) });
  };
  return <div className="cy-customer-related-content">
    {draft && !draft.corrected ? <QuoteCreateForm customerId={customerId} onSaved={onCreated} onCancel={onCancel} /> : null}
    {draft?.corrected ? <form onKeyDown={enterAdvancesFields} className="cy-customer-quote-form" onSubmit={save}>
    <FormSection>
      <div className="cy-customer-quote-header-fields">
        <Field label="日期" size="s" required><DateInput density="regular" max="9999-12-31" className="cy-op-input" value={draft.quoteDate} disabled={busy}
          onChange={event => setDraft({ ...draft, quoteDate: event })} /></Field>
        <Field label="備註" size="l"><input className="cy-op-input" value={draft.note} disabled={busy} maxLength={120}
          onChange={event => setDraft({ ...draft, note: event.target.value })} /></Field>
      </div>
      <div className="cy-customer-quote-lines">
        {draft.lines.map((line, index) => <div key={index} className="cy-customer-quote-line">
          <EntityPicker<CustomerItemOption>
            label="商品" value={line.item} disabled={busy} required
            search={searchQuoteItem} getKey={row => row.id} getLabel={quoteItemLabel}
            minQueryLength={1} placeholder="輸入品號或品名搜尋"
            onSelect={item => patchLine(index, { item, unit: item?.baseUnit ?? line.unit })} />
          <Field label="數量" size="s" required><input className="cy-op-input" inputMode="decimal" value={line.quantity}
            disabled={busy} onChange={event => patchLine(index, { quantity: event.target.value })} /></Field>
          <Field label="單位" size="s" required><input className="cy-op-input" value={line.unit}
            disabled={busy} onChange={event => patchLine(index, { unit: event.target.value })} /></Field>
          <Field label="單價" size="s" required><input className="cy-op-input" inputMode="decimal" value={line.unitPrice}
            disabled={busy} onChange={event => patchLine(index, { unitPrice: event.target.value })} /></Field>
          <button className="cy-op-button compact" type="button" disabled={busy} title="移除品項"
            onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}>移除</button>
        </div>)}
      </div>
      <button type="button" className="cy-op-button compact" disabled={busy || draft.lines.length >= 100}
        onClick={() => setDraft({ ...draft, lines: [...draft.lines, {
          ...emptyQuoteLine(), item: draft.corrected ? draft.lines[0]?.item ?? null : null,
        }] })}>＋ 加一列</button>
      {draft.corrected ? <Field label="修正原因" size="l"><input className="cy-op-input" value={draft.correctionReason} disabled={busy}
          onChange={event => setDraft({ ...draft, correctionReason: event.target.value })} /></Field> : null}
      <div className="cy-customer-related-form-actions">
        <button className="cy-op-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy || draft.lines.length === 0}>
          {draft.corrected ? "儲存修正" : "儲存報價"}
        </button>
      </div>
    
    </FormSection>
  </form> : null}
    {mode === "browse" ? <table className="cy-customer-card-table cy-customer-related-list">
      <colgroup><col style={{ width: "6.4em" }} /><col /><col style={{ width: "7.5em" }} /><col style={{ width: "4.4em" }} /></colgroup>
      <thead><tr><th scope="col">日期</th><th scope="col">商品</th><th scope="col">價格</th><th scope="col">業務</th></tr></thead>
      <tbody>{visible.map(quote => <tr key={quote.id} className={draft?.corrected?.id === quote.id ? "active" : undefined} tabIndex={0}
        onClick={() => { if (!busy) void correct(quote); }} onKeyDown={event => { if (event.key === "Enter" && !busy) void correct(quote); }}>
        <td>{formatDate(quote.quoteDate)}</td><td>{formatItem(quote.itemNoSnapshot, quote.itemNameSnapshot)}</td>
        <td>{quote.priceBreaks.map(tier => <span key={tier.id} className="cy-customer-price-line">{tier.quantity}{tier.unit} ${tier.unitPrice}</span>)}</td>
        <td>{quote.employee.displayName ?? ""}</td>
      </tr>)}</tbody>
    </table> : null}
    {mode === "browse" && !visible.length ? <p className="cy-op-empty">沒有符合條件的報價紀錄。</p> : null}
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
    <FormSection>
      <EntityPicker<CustomerItemOption> label="正式商品" value={item}
        search={searchQuoteItem} getKey={row => row.id} getLabel={quoteItemLabel}
        minQueryLength={1} placeholder="輸入品號或品名搜尋" disabled={busy}
        onSelect={selected => { setItem(selected); setItemId(selected?.id ?? null); if (selected) setFreeText(""); }} />
      <Field label="或輸入未建檔名稱" size="m" oneOf="與正式商品擇一" reportAs="正式商品或未建檔名稱" required={itemId===null&&!freeText.trim()}><input className="cy-op-input" value={freeText}
        disabled={busy || itemId !== null} onChange={event => setFreeText(event.target.value)} /></Field>
      <div className="cy-customer-related-form-actions">
        <button type="button" className="cy-op-button" disabled={busy} onClick={onCancel}>取消</button>
        <button className="cy-op-button primary" disabled={busy}>加入</button>
      </div>
    
    </FormSection>
  </form> : null}
    {mode === "browse" ? <table className="cy-customer-card-table">
      {/* 項次／品號／品名／加入日期 (user 2026-11-03); the date is the system's, set when the item is added. */}
      <colgroup><col style={{ width: "2.6em" }} /><col style={{ width: "5.6em" }} /><col /><col style={{ width: "7.4em" }} /><col style={{ width: "2.6em" }} /></colgroup>
      <thead><tr><th scope="col" className="cy-sheet-seq">項次</th><th scope="col">品號</th><th scope="col">品名</th><th scope="col">加入日期</th><th scope="col"><span className="cy-visually-hidden">操作</span></th></tr></thead>
      <tbody>{visible.map((row, index) => <tr key={row.id}>
        <td className="cy-sheet-seq">{index + 1}</td><td>{row.item?.itemNo ?? "—"}</td><td>{row.item?.name ?? row.customItemName ?? ""}</td><td>{formatDate(row.createdAt)}</td>
        <td><IconButton variant="table" tone="danger" icon={Icons.remove} label="移除常用商品" disabled={busy} onClick={() => void remove(row)} /></td>
      </tr>)}</tbody>
    </table> : null}
    {mode === "browse" && !visible.length ? <p className="cy-op-empty">沒有符合條件的常用商品。</p> : null}
  </div>;
}
