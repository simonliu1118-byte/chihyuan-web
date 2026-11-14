import { ItemMarginPanel } from "./item/ItemMarginPanel";
import { IconButton } from "../../ui/actions/IconButton";
import { Icons } from "../../ui/actions/icons";
import {Field,CheckField,FormSection} from "../../ui/forms/Field";
import { Dialog } from "../../ui/overlays/Dialog";
import {ItemSheet,type ItemSheetDraft} from "./item/ItemSheet";
import { RelatedCard } from "../../ui/records/RelatedCard";
import { EntityPicker } from "../../ui/pickers/EntityPicker";
import { DefectForm } from "./defect/DefectForm";
import { QuoteCreateForm } from "./customer/QuoteCreateForm";
import { searchDefects } from "../api/defect-runtime-client";
import { loadItemQuoteSummary, searchCustomers } from "../api/customer-runtime-client";
import { routeHref } from "../navigation/route-params";
import { defectTone } from "./status-flow";
import type { DefectSummary } from "../../../shared/defect";
import type { ItemQuoteSummary } from "../../../shared/customer-related";
import type { CustomerSummary } from "../../../shared/customer";
import type { CustomerItemOption } from "../../../shared/business-lookups";
import { formatDate, formatItem } from "../../ui/foundation/format";
import { unitFactorToBase } from "../../../shared/unit-conversion";
import { parseScaled4, formatScaled4 } from "../../../shared/fixed-point";
import { StatusChip } from "../../ui/primitives/StatusChip";
import { usePendingAction } from "../../ui/feedback/usePendingAction";
import { Loading } from "../../ui/feedback/Loading";
import { enterAdvancesFields } from "../../ui/foundation/enter-advance";
import { LoadMoreRow, useLoadMore } from "../../ui/data/useLoadMore";
import { formatDateTime } from "../../ui/foundation/format";
import { useConfirmation } from "../../ui/overlays/useConfirmation";
import { useFormPrompt } from "../../ui/overlays/useFormPrompt";
import { MasterDetailBack, MasterDetailEmpty, useMasterDetailPane } from "../../ui/layout/MasterDetail";
import { useCompactLayout } from "../../ui/foundation/useCompactLayout";
import { DataViewToolbar } from "../../ui/data/DataViewToolbar";
import { ListRow } from "../../ui/mobile/ListRow";
import { ActionBar } from "../../ui/mobile/ActionBar";
import { OverflowMenu } from "../../ui/mobile/OverflowMenu";
import { FeedbackBanner, useFeedbackMessage } from "../../ui/feedback/FeedbackProvider";
import { useUnsavedChangesGuard } from "../../ui/foundation/useUnsavedChangesGuard";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSettingsSaved } from "./settings-events";
import type { ItemModuleLookups } from "../../../shared/business-lookups";
import type {
  ItemDetail,
  ItemProfileInput,
  ItemSummary,
  ItemUnitConversionInput,
} from "../../../shared/item";
import { ApiClientError } from "../../api/client";
import {
  changeItemNumber as changeItemNumberRequest,
  createItem,
  loadItemDetail,
  loadItemLookups,
  loadItemNumberHistory,
  loadItemPriceHistory,
  loadItemPlatforms,
  searchItems,
  updateItem,
} from "../api/item-runtime-client";
import "./item-operational.css";

type ItemDraft=ItemSheetDraft;

function activeCategoryId(lookups: ItemModuleLookups | null): number | null {
  return lookups?.itemCategories.find((row) => row.isActive)?.id ?? null;
}

function newDraft(lookups: ItemModuleLookups | null): ItemDraft {
  return {
    itemNo: "",
    name: "",
    spec: "",
    itemCategoryId: activeCategoryId(lookups),
    baseUnit: "個",
    isActive: true,
    cost: "",
    costTaxMode: null,
    storePrice: "",
    clinicPrice: "",
    notes: "",
    unitConversions: [],
    wholesalePrices: [],
    onlinePrices: [],
  };
}

/** Legacy chained conversions are flattened using the canonical rational calculator. */
function baseConversions(item: ItemDetail): ItemUnitConversionInput[] {
  const edges = item.unitConversions.map(row => ({
    fromUnit: row.fromUnit, toUnit: row.toUnit, quantityScaled4: parseScaled4(row.quantity),
  }));
  return item.unitConversions.map(row => {
    const factor = unitFactorToBase(item.baseUnit, edges, row.fromUnit);
    const scaled = factor.numerator * 10000n;
    if (scaled % factor.denominator !== 0n) {
      throw new Error(`換算「${row.fromUnit}」無法精確表示為四位小數的基準單位，請確認舊資料。`);
    }
    const value = Number(scaled / factor.denominator);
    if (!Number.isSafeInteger(value)) throw new Error("基準單位換算數量超出安全範圍");
    return { fromUnit: row.fromUnit, quantity: formatScaled4(value),
      toUnit: item.baseUnit, sortOrder: row.sortOrder };
  });
}

function draftFromDetail(item: ItemDetail): ItemDraft {
  return {
    itemNo: item.itemNo,
    name: item.name,
    spec: item.spec ?? "",
    itemCategoryId: item.category?.id ?? null,
    baseUnit: item.baseUnit,
    isActive: item.isActive,
    cost: item.cost ?? "",
    costTaxMode: item.costTaxMode,
    storePrice: item.storePrice ?? "",
    clinicPrice: item.clinicPrice ?? "",
    notes: item.notes ?? "",
    unitConversions: baseConversions(item),
    wholesalePrices:[...item.wholesalePrices],
    onlinePrices:[...item.onlinePrices],
  };
}

function profileFromDraft(draft: ItemDraft): ItemProfileInput {
  return {
    name: draft.name.trim(),
    spec: draft.spec.trim() || null,
    baseUnit: draft.baseUnit.trim(),
    itemCategoryId: draft.itemCategoryId,
    cost: draft.cost.trim() || null,
    costTaxMode: draft.costTaxMode,
    storePrice: draft.storePrice.trim() || null,
    clinicPrice: draft.clinicPrice.trim() || null,
    notes: draft.notes.trim() || null,
    isActive: draft.isActive,
    wholesalePrices: draft.wholesalePrices.map((row,index)=>({unit:row.unit.trim(),price:row.price.trim(),sortOrder:index})),
    onlinePrices: draft.onlinePrices.map(row=>({platformId:row.platformId,price:row.price.trim()})),
    unitConversions: draft.unitConversions.map((row, index) => ({
      fromUnit: row.fromUnit.trim(),
      quantity: row.quantity.trim(),
      toUnit: draft.baseUnit.trim(),
      sortOrder: row.sortOrder ?? index,
    })),
  };
}

function profileFromDetail(item: ItemDetail, isActive = item.isActive): ItemProfileInput {
  return {
    name: item.name,
    spec: item.spec,
    baseUnit: item.baseUnit,
    itemCategoryId: item.category?.id ?? null,
    cost: item.cost,
    costTaxMode: item.costTaxMode,
    storePrice: item.storePrice,
    clinicPrice: item.clinicPrice,
    notes: item.notes,
    isActive,
    unitConversions: baseConversions(item),
  };
}

function validateConversions(baseUnit: string, conversions: readonly ItemUnitConversionInput[]): string | null {
  const base = baseUnit.trim();
  const seen = new Set<string>();
  for (const row of conversions) {
    const from = row.fromUnit.trim();
    const quantity = Number(row.quantity);
    if (!from || !Number.isFinite(quantity) || quantity <= 0) return "換算來源及正數數量為必填。";
    if (from === base) return "來源不可等於基準單位";
    if (seen.has(from)) return "此單位已有換算";
    seen.add(from);
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code.includes("REVISION_CONFLICT")) return "資料已被其他人修改，請重新載入後再操作。";
    if (error.code === "ACCESS_DENIED") return "你目前沒有商品模組使用權。";
    if (error.code === "AUTH_REQUIRED" || error.code === "AUTH_INVALID") return "登入狀態已失效，請重新登入。";
    const fieldMessage = error.fields ? Object.values(error.fields)[0] : null;
    return fieldMessage || error.message || error.code;
  }
  return "目前無法完成商品資料操作。";
}

/** 盒　1+ $80 · 100+ $70　2 位客戶　最近 2026/10/12 */
function quoteGroupText(group: ItemQuoteSummary["groups"][number]): string {
  const tiers = group.breaks.map(tier => `${tier.quantity}+ $${tier.unitPrice}`).join(" · ");
  return `${group.unit}　${tiers}　${group.customers.length} 位客戶　最近 ${formatDate(group.latestQuoteDate)}`;
}

function categoryName(item: ItemSummary): string {
  return item.category?.name ?? "未分類";
}

export function ItemOperationalPage({ canViewDefects = false, canViewCustomers = false, canViewCost = false }: { canViewDefects?: boolean; canViewCustomers?: boolean; canViewCost?: boolean }) {
  const [lookups, setLookups] = useState<ItemModuleLookups | null>(null);
  const [rows, setRows] = useState<readonly ItemSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ItemDetail | null>(null);
  const [numberHistory, setNumberHistory] = useState<Awaited<ReturnType<typeof loadItemNumberHistory>>>([]);
  const [priceHistory,setPriceHistory]=useState<Awaited<ReturnType<typeof loadItemPriceHistory>>>([]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [platforms,setPlatforms]=useState<Awaited<ReturnType<typeof loadItemPlatforms>>>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const { pending, track } = usePendingAction();
  const unsavedGuard = useUnsavedChangesGuard({ active: editing, blocked: busy, message: "目前有尚未儲存的商品修改，確定放棄？" });
  const pane = useMasterDetailPane();
  const compact = useCompactLayout();
  const { confirm, confirmationDialog } = useConfirmation();
  const { ask, promptDialog } = useFormPrompt();
  const canLeave = async () => (await unsavedGuard.confirmNavigationAsync(description => confirm({
    title: "放棄尚未儲存的修改", description, confirmLabel: "放棄修改", cancelLabel: "繼續編輯", confirmTone: "danger",
  }))).allowed;
  const [loadingList, setLoadingList] = useState(true);
  // The page appears once its first list page is in; until then only the shared spinner shows.
  const [listReady, setListReady] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [message, setMessage, reportError, messageTone] = useFeedbackMessage<string | null>(null);
  const paging = useLoadMore(searchItems, setRows, (error) => reportError(errorMessage(error)));
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [relatedEpoch, setRelatedEpoch] = useState(0);
  const [relatedDialog, setRelatedDialog] = useState<"defectBrowse" | "defectCreate" | "quoteBrowse" | "quoteCreate" | null>(null);
  useUnsavedChangesGuard({
    active: relatedDialog === "defectCreate" || relatedDialog === "quoteCreate",
    blocked: busy,
    message: "商品相關紀錄表單尚未儲存。",
  });
  const [defectRecent, setDefectRecent] = useState<readonly DefectSummary[]>([]);
  const [defectCounts, setDefectCounts] = useState<Partial<Record<"created" | "processing" | "resolved", number>>>({});
  const [defectRows, setDefectRows] = useState<readonly DefectSummary[]>([]);
  const [defectCursor, setDefectCursor] = useState<string | null>(null);
  const [defectQuery, setDefectQuery] = useState("");
  const [showInvalid, setShowInvalid] = useState(false);
  const [defectLoading, setDefectLoading] = useState(false);
  const [quoteSummary, setQuoteSummary] = useState<ItemQuoteSummary | null>(null);
  // The current number has no validTo; only retired numbers are listed as 曾用品號.
  const previousNumbers = numberHistory.filter(row => row.validTo);
  const [quoteQuery, setQuoteQuery] = useState("");
  const [quoteCustomer, setQuoteCustomer] = useState<CustomerSummary | null>(null);

  useEffect(() => {
    if (!canViewDefects || !selectedId) { setDefectRecent([]); setDefectCounts({}); return; }
    let cancelled = false;
    void searchDefects({ itemId: selectedId, limit: 3 }).then(result => {
      if (!cancelled) { setDefectRecent(result.items); setDefectCounts(result.statusCounts ?? {}); }
    }).catch(error => { if (!cancelled) reportError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedId, canViewDefects, relatedEpoch]);

  useEffect(() => {
    if (!canViewCustomers || !selectedId) { setQuoteSummary(null); return; }
    let cancelled = false;
    void loadItemQuoteSummary(selectedId).then(result => {
      if (!cancelled) setQuoteSummary(result);
    }).catch(error => { if (!cancelled) reportError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedId, canViewCustomers, relatedEpoch]);

  useEffect(() => {
    if (relatedDialog !== "defectBrowse" || !selectedId || !canViewDefects) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setDefectLoading(true);
      void searchDefects({ itemId: selectedId, includeInvalid: showInvalid, q: defectQuery.trim() || undefined, limit: 100 })
        .then(result => { if (!cancelled) { setDefectRows(result.items); setDefectCursor(result.nextCursor); } })
        .catch(error => { if (!cancelled) reportError(errorMessage(error)); })
        .finally(() => { if (!cancelled) setDefectLoading(false); });
    }, 180);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [relatedDialog, selectedId, canViewDefects, showInvalid, defectQuery, relatedEpoch]);

  async function moreDefects() {
    if (!selectedId || !defectCursor || defectLoading || !canViewDefects) return;
    setDefectLoading(true);
    try {
      const page = await searchDefects({ itemId: selectedId, includeInvalid: showInvalid,
        q: defectQuery.trim() || undefined, limit: 100, cursor: defectCursor });
      setDefectRows(current => [...current, ...page.items]);
      setDefectCursor(page.nextCursor);
    } catch (error) { reportError(errorMessage(error)); }
    finally { setDefectLoading(false); }
  }


  const [lookupEpoch, setLookupEpoch] = useState(0);
  useSettingsSaved(useCallback(() => { setLookupEpoch(value => value + 1); setRefreshEpoch(value => value + 1); }, []));
  useEffect(()=>{
    let active=true;
    void loadItemPlatforms().then(p=>{if(active)setPlatforms(p)}).catch(error=>{if(active)reportError(errorMessage(error))});
    return ()=>{active=false};
  },[lookupEpoch]);

  useEffect(() => {
    let cancelled = false;
    void loadItemLookups()
      .then((value) => {
        if (!cancelled) setLookups(value);
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
      const itemCategoryId = categoryFilter ? Number(categoryFilter) : undefined;
      const isActive = activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined;
      const listQuery = {
        q: query.trim() || undefined,
        itemCategoryId: Number.isSafeInteger(itemCategoryId) && (itemCategoryId ?? 0) > 0 ? itemCategoryId : undefined,
        isActive,
        limit: 100,
      };
      void searchItems(listQuery)
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          paging.reset(listQuery, result.nextCursor);
          if (!editing && !creating) {
            setSelectedId((current) => (
              current != null && result.items.some((row) => row.id === current)
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
  }, [query, categoryFilter, activeFilter, refreshEpoch, editing, creating]);

  useEffect(() => {
    if (selectedId == null || creating) {
      setSelected(null);
      setNumberHistory([]);
      setPriceHistory([]);
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    void Promise.all([
      loadItemDetail(selectedId),
      loadItemNumberHistory(selectedId, 100),
      loadItemPriceHistory(selectedId),
    ])
      .then(([detail, history, prices]) => {
        if (cancelled) return;
        setSelected(detail);
        setNumberHistory(history);
        setPriceHistory(prices);
      })
      .catch((error) => {
        if (!cancelled) {
          setSelected(null);
          setNumberHistory([]);
          setPriceHistory([]);
          reportError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, creating, refreshEpoch]);

  const categories = useMemo(
    () => lookups?.itemCategories ?? [],
    [lookups],
  );

  async function selectItem(id: number) {
    if (busy || !(await canLeave())) return;
    pane.open();
    setSelectedId(id);
    setRelatedDialog(null);
    setHistoryOpen(false);
    setEditing(false);
    setCreating(false);
    setDraft(null);
    setMessage(null);
  }

  async function startCreate() {
    if (!canViewCost) return;
    if (busy || !(await canLeave())) return;
    pane.open();
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

  function patch(patchValue: Partial<ItemDraft>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
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

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft?.itemNo.trim() || !draft.name.trim() || !draft.baseUnit.trim()) return;

    const conversions = draft.unitConversions.filter((row) => (
      row.fromUnit.trim() || row.quantity.trim()
    ));
    const conversionError = validateConversions(draft.baseUnit, conversions);
    if (conversionError) {
      reportError(conversionError);
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const profile = { ...profileFromDraft({ ...draft, unitConversions: conversions }) };
      if (!canViewCost) { delete profile.cost; delete profile.costTaxMode; }
      const saved = creating
        ? await createItem({ itemNo: draft.itemNo.trim(), ...profile })
        : selected
          ? await updateItem(selected.id, { ...profile, expectedRevision: selected.revision })
          : null;
      if (!saved) return;
      setSelectedId(saved.id);
      setSelected(saved);
      setEditing(false);
      setCreating(false);
      setDraft(null);
      setMessage(creating ? "商品已新增。" : "商品已儲存。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) {
        setRefreshEpoch((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  function addConversion() {
    if (!draft) return;
    const candidate = draft.unitConversions.length ? `單位${draft.unitConversions.length + 1}` : "箱";
    patch({
      unitConversions: [
        ...draft.unitConversions,
        { fromUnit: candidate, quantity: "1", toUnit: draft.baseUnit, sortOrder: draft.unitConversions.length },
      ],
    });
  }

  function updateConversion(index: number, field: "fromUnit" | "quantity", value: string) {
    if (!draft) return;
    patch({
      unitConversions: draft.unitConversions.map((row, rowIndex) => (
        rowIndex === index ? { ...row, [field]: value } : row
      )),
    });
  }

  async function changeItemNumber() {
    if (!selected || busy) return;
    const answer = await ask({
      title: "更改品號",
      description: `目前品號 ${selected.itemNo}。舊品號會保留在歷史品號中，仍可搜尋。`,
      fields: [
        { name: "itemNo", label: "新的 SMART ERP 品號", defaultValue: selected.itemNo, required: true },
        { name: "reason", label: "變更原因", defaultValue: "SMART ERP 品號更正" },
      ],
      confirmLabel: "更改品號",
    });
    if (!answer) return;
    const next = answer.itemNo;
    const reason = answer.reason;
    if (!next || next === selected.itemNo) return;

    setBusy(true);
    setMessage(null);
    try {
      const saved = await changeItemNumberRequest(selected.id, {
        newItemNo: next,
        expectedRevision: selected.revision,
        changeSource: reason.trim() || null,
      });
      setSelected(saved);
      setMessage("品號已更新，舊品號已保留於歷史。");
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!selected || busy) return;
    if (canViewCost && !selected.costTaxMode) { startEdit(); reportError("請先補填成本稅別，再變更啟用狀態。"); return; }
    const action = selected.isActive ? "停用" : "啟用";
    if (!(await confirm({
      title: `${action}商品`,
      description: `確定${action}「${formatItem(selected.itemNo, selected.name)}」？${selected.isActive ? "停用後不會出現在新單據的商品選單，既有紀錄不受影響。" : ""}`,
      confirmLabel: action, confirmTone: selected.isActive ? "danger" : "primary",
    }))) return;

    setBusy(true);
    setMessage(null);
    try {
      const profile = profileFromDetail(selected, !selected.isActive);
      if (!canViewCost) { delete profile.cost; delete profile.costTaxMode; }
      const saved = await updateItem(selected.id, { ...profile, expectedRevision: selected.revision });
      setSelected(saved);
      setMessage(`商品已${action}。`);
      setRefreshEpoch((value) => value + 1);
    } catch (error) {
      reportError(errorMessage(error));
      if (error instanceof ApiClientError && error.status === 409) setRefreshEpoch((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!listReady) return <Loading />;
  const itemFilters = <div className="cy-md-toolbar-row">
    <select className="cy-op-input" aria-label="商品分類" value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value)}>
      <option value="">全部分類</option>
      {categories.map(row=><option key={row.id} value={row.id}>{row.isActive?row.name:`${row.name}（已停用）`}</option>)}
    </select>
    <select className="cy-op-input" aria-label="商品狀態" value={activeFilter} onChange={event=>setActiveFilter(event.target.value)}>
      <option value="">全部狀態</option><option value="active">使用中</option><option value="inactive">已停用</option>
    </select>
  </div>;


  return <div className="cy-item-op">
    {confirmationDialog}
    {promptDialog}
    {selected && relatedDialog?.startsWith("defect") && canViewDefects ? <Dialog open size="large"
      showCloseButton={relatedDialog !== "defectCreate"}
      title={relatedDialog === "defectCreate" ? "新增瑕疵紀錄" : "瑕疵紀錄 — " + formatItem(selected.itemNo, selected.name)}
      onClose={() => setRelatedDialog(null)}>
      {relatedDialog === "defectCreate" ? <DefectForm key={selected.id} mode="create"
        fixedItem={{ id: selected.id, itemNo: selected.itemNo, name: selected.name }}
        onCancel={() => setRelatedDialog(null)}
        onSaved={() => { setRelatedDialog(null); setRelatedEpoch(v => v + 1); setMessage("瑕疵紀錄已新增。"); }} /> :
        <div className="cy-item-related-dialog">
          <div className="cy-related-toolbar">
            <button className="cy-op-button primary compact" type="button" onClick={() => setRelatedDialog("defectCreate")}>＋ 新增</button>
            <input className="cy-op-input" type="search" aria-label="搜尋瑕疵" placeholder="搜尋描述或客戶" value={defectQuery}
              onChange={event => setDefectQuery(event.target.value)} />
            <label className="cy-item-show-invalid"><input type="checkbox" checked={showInvalid}
              onChange={event => setShowInvalid(event.target.checked)} /> 顯示已作廢</label>
          </div>
          {defectRows.map(row => <button key={row.id} type="button"
            className={`cy-item-related-row ${row.invalidatedAt ? "voided" : ""}`}
            onClick={() => { window.location.hash = routeHref("defects", { id: row.id }); }}>
            <span>{formatDate(row.reportedDate)}　{row.customerNameSnapshot}　{row.defectDescription}</span>
            <StatusChip tone={row.invalidatedAt ? undefined : defectTone[row.statusCode]}>
              {row.invalidatedAt ? "已作廢" : row.statusCode === "created" ? "建立" : row.statusCode === "processing" ? "處理中" : "已解決"}
            </StatusChip>
          </button>)}
          {defectLoading ? <Loading inline /> : null}
          {defectCursor ? <button className="cy-op-button compact" type="button" disabled={defectLoading}
            onClick={() => void moreDefects()}>載入更多</button> : null}
        </div>}
    </Dialog> : null}
    {selected && relatedDialog?.startsWith("quote") && canViewCustomers ? <Dialog open size="large"
      showCloseButton={relatedDialog !== "quoteCreate"}
      title={relatedDialog === "quoteCreate" ? "新增商品報價" : "報價紀錄 — " + formatItem(selected.itemNo, selected.name)}
      onClose={() => setRelatedDialog(null)}>
      {relatedDialog === "quoteCreate" ? <div className="cy-item-related-dialog">
        <EntityPicker<CustomerSummary> label="客戶" required value={quoteCustomer} onSelect={setQuoteCustomer}
          search={async q => (await searchCustomers({ q, limit: 20 })).items}
          getKey={row => row.id} getLabel={row => [row.customerNo, row.shortName].filter(Boolean).join(" ")}
          placeholder="輸入客戶編號或名稱" />
        <QuoteCreateForm key={selected.id} customerId={quoteCustomer?.id ?? null}
          initialLines={[{ item: { id: selected.id, itemNo: selected.itemNo, name: selected.name,
            spec: selected.spec, baseUnit: selected.baseUnit } as CustomerItemOption, unit: selected.baseUnit }]}
          onCancel={() => setRelatedDialog(null)}
          onSaved={() => { setRelatedDialog(null); setRelatedEpoch(v => v + 1); setMessage("報價紀錄已新增。"); }} />
      </div> : <div className="cy-item-related-dialog">
        <div className="cy-related-toolbar">
          <button className="cy-op-button primary compact" type="button" onClick={() => {
            setQuoteCustomer(null); setRelatedDialog("quoteCreate");
          }}>＋ 新增</button>
          <input type="search" className="cy-op-input" aria-label="搜尋報價客戶" value={quoteQuery}
            onChange={event => setQuoteQuery(event.target.value)} placeholder="搜尋客戶編號或名稱" />
        </div>
        {quoteSummary?.groups.filter(group => !quoteQuery.trim() || group.customers.some(row =>
          `${row.customerNo ?? ""} ${row.shortName}`.toLowerCase().includes(quoteQuery.trim().toLowerCase())))
          .map((group, index) => <details key={index} className="cy-item-quote-group" open={quoteQuery.trim() ? true : undefined}>
            <summary>{quoteGroupText(group)}</summary>
            {group.customers.filter(row => !quoteQuery.trim() ||
              `${row.customerNo ?? ""} ${row.shortName}`.toLowerCase().includes(quoteQuery.trim().toLowerCase()))
              .map(customer => <button type="button" className="cy-item-related-row" key={customer.quoteId}
                onClick={() => { window.location.hash = routeHref("customers", { id: customer.customerId }); }}>
                {[customer.customerNo, customer.shortName].filter(Boolean).join(" ")}　{formatDate(customer.quoteDate)}
              </button>)}
          </details>)}
      </div>}
    </Dialog> : null}
    
    {selected&&historyOpen?<Dialog open title={"商品修改紀錄 — "+selected.itemNo} size="large" onClose={()=>setHistoryOpen(false)}>
      <div className="cy-item-history-panel">
       <h3>歷史品號</h3>
       {numberHistory.filter(row=>row.validTo).length?<ul>
        {numberHistory.filter(row=>row.validTo).map(row=><li key={row.id}>{row.itemNo}（{formatDate(row.validTo)} 更改）</li>)}
       </ul>:<p>沒有歷史品號</p>}
       <h3>批發價與網路價異動</h3>
       {priceHistory.length?<table className="cy-op-table cy-rt"><thead><tr><th>時間</th><th>修改前</th><th>修改後</th></tr></thead>
        <tbody>{priceHistory.map(row=><tr key={row.id}>
         <td data-label="時間">{formatDateTime(row.occurredAt)}</td>
         <td data-label="修改前">{Object.entries(row.before).map(([k,v])=>k+"："+(v??"未設定")).join("、")||"—"}</td>
         <td data-label="修改後">{Object.entries(row.after).map(([k,v])=>k+"："+(v??"已刪除")).join("、")||"—"}</td>
        </tr>)}</tbody></table>:<p>沒有價格異動紀錄</p>}
      </div>
     </Dialog>:null}
    <FeedbackBanner message={message} tone={messageTone} />

    <div className="cy-md cy-item-workspace" data-pane={pane.pane}>
      <section className="cy-op-panel cy-md-list" aria-label="商品清單">
        {compact?<DataViewToolbar searchValue={query} onSearchChange={setQuery} searchLabel="搜尋商品"
          searchPlaceholder="搜尋現行／歷史品號、名稱、規格"
          filters={itemFilters} activeFilterCount={[categoryFilter,activeFilter].filter(Boolean).length}
          actions={<button type="button" className="cy-op-button primary" disabled={busy || !canViewCost} title={!canViewCost?"新增商品需填成本稅別，請由具成本權限者建立":undefined} onClick={()=>void startCreate()}>＋ 新增商品</button>}
          resultSummary={loadingList?"載入中":paging.hasMore?`已載入 ${rows.length} 筆，還有更多`:`共 ${rows.length} 筆`}/>
        :<div className="cy-md-toolbar">
          <div className="cy-md-toolbar-lead">
            <button type="button" className="cy-op-button primary" disabled={busy || !canViewCost} title={!canViewCost?"新增商品需填成本稅別，請由具成本權限者建立":undefined} onClick={()=>void startCreate()}>＋ 新增商品</button>
            <input className="cy-op-input" type="search" aria-label="搜尋商品" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜尋現行／歷史品號、名稱、規格"/>
          </div>
          {itemFilters}
          <div className="cy-md-count">{loadingList?<Loading inline/>:paging.hasMore?`已載入 ${rows.length} 筆，還有更多`:`共 ${rows.length} 筆`}</div>
        </div>}
        <div className="cy-op-list">
          {rows.map(row=>compact
            ?<ListRow key={row.id} title={[row.itemNo,row.name].filter(Boolean).join(" ")} subtitle={row.spec||""}
               trailing={row.isActive?<small>{categoryName(row)}</small>:<StatusChip>已停用</StatusChip>}
               selected={selectedId===row.id} onClick={()=>void selectItem(row.id)}/>
            :<button key={row.id} type="button" className={`cy-op-list-row cy-item-row ${selectedId===row.id?"active":""}`}
               aria-current={selectedId===row.id?"true":undefined} onClick={()=>void selectItem(row.id)}>
               <strong title={[row.itemNo,row.name,row.spec].filter(Boolean).join(" ")}><span className="cy-list-row-no">{row.itemNo}</span>{row.name}{row.spec?`　${row.spec}`:""}</strong>
               {row.isActive?<small>{categoryName(row)}</small>:<StatusChip>已停用</StatusChip>}
             </button>)}
          {loadingList && rows.length === 0 ? <Loading /> : null}
          {!loadingList && rows.length === 0 ? <div className="cy-op-empty">沒有符合條件的商品。</div> : null}
          <LoadMoreRow hasMore={paging.hasMore} loading={paging.loading} onMore={() => void paging.more()} />
        </div>
      </section>

      <section className="cy-op-panel cy-md-detail">
        <MasterDetailBack label="商品清單" disabled={busy} onBack={async () => { if (editing) { if (!(await canLeave())) return; setEditing(false); setCreating(false); setDraft(null); } pane.close(); }} />
        {editing && draft ? (
          <form onKeyDown={enterAdvancesFields} className="cy-op-form" onSubmit={(event) => void save(event)}>
            <div className="cy-record-header cy-edit-header">
              <div>
                <h2>{creating ? "新增商品" : `修改 ${selected?.itemNo ?? "商品"}`}</h2>
                {creating ? <p>品號必須是 SMART ERP 中已存在的品號。</p> : null}
              </div>
            {compact?<ActionBar><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void cancelEdit()}>取消</button>
              <button className="cy-op-button primary" disabled={busy} aria-busy={busy||undefined}>{creating?"建立商品":"儲存修改"}</button></ActionBar>
             :<div className="cy-record-actions"><button type="button" className="cy-op-button" disabled={busy} onClick={()=>void cancelEdit()}>取消</button>
              <button className="cy-op-button primary" disabled={busy} aria-busy={busy||undefined}>{creating?"建立商品":"儲存修改"}</button></div>}</div>
            <ItemSheet editing creating={creating} item={selected} draft={draft}
              busy={busy} canViewCost={canViewCost} categories={categories} platforms={platforms}
              onPatch={patch} onAddConversion={addConversion} onUpdateConversion={updateConversion}/>

  </form>
        ) : loadingDetail ? (
          <Loading />
        ) : selected ? (
          <div>
            <div className="cy-record-header">
              <div>
                <h2>{formatItem(selected.itemNo, selected.name)}</h2>
                <p>{[selected.spec, selected.category?.name, selected.isActive ? "使用中" : null].filter(Boolean).join("　")}
                  {!selected.isActive ? <StatusChip>已停用</StatusChip> : null}</p>
              </div>
              {compact?<OverflowMenu items={[
                {label:"修改紀錄",onClick:()=>setHistoryOpen(true)},
                {label:"更改品號",disabled:busy,onClick:()=>track("changeItemNumber",changeItemNumber())},
                {label:selected.isActive?"停用":"啟用",disabled:busy,danger:selected.isActive,onClick:()=>track("toggleActive",toggleActive())}
               ]}/>
              :<div className="cy-record-actions">
                <button type="button" className="cy-op-button" disabled={busy} onClick={startEdit}>修改</button>
                <button type="button" className="cy-op-button" disabled={busy} onClick={()=>setHistoryOpen(true)}>修改紀錄</button>
                <button type="button" className="cy-op-button" disabled={busy} aria-busy={(busy && pending === "changeItemNumber") || undefined}
                  onClick={() => track("changeItemNumber", changeItemNumber())}>更改品號</button>
                <button type="button" className={`cy-op-button ${selected.isActive ? "danger" : ""}`} disabled={busy}
                  aria-busy={(busy && pending === "toggleActive") || undefined} onClick={() => track("toggleActive", toggleActive())}>
                  {selected.isActive ? "停用" : "啟用"}</button>
               </div>}
            </div>
            {compact?<ActionBar><button type="button" className="cy-op-button primary" disabled={busy} onClick={startEdit}>修改</button></ActionBar>:null}
            <div className="cy-item-detail-body">
              <ItemSheet editing={false} creating={false} item={selected} draft={null}
                busy={busy} canViewCost={canViewCost} categories={categories} platforms={platforms}
                onPatch={patch} onAddConversion={addConversion} onUpdateConversion={updateConversion}/>
              {canViewDefects || canViewCustomers ? <section className="cy-customer-cards" aria-label="商品相關紀錄">
                {canViewDefects ? <RelatedCard title="瑕疵紀錄"
                  count={Object.values(defectCounts).reduce((total, count) => total + (count ?? 0), 0)}
                  summary={<small>{(["created", "processing", "resolved"] as const).filter(code => defectCounts[code])
                    .map(code => `${code === "created" ? "建立" : code === "processing" ? "處理中" : "已解決"} ${defectCounts[code]}`).join(" · ")}</small>}
                  empty="尚無瑕疵紀錄。" onAdd={() => setRelatedDialog("defectCreate")} onView={() => setRelatedDialog("defectBrowse")}
                  rows={defectRecent.map(row => <button key={row.id} type="button" className="cy-item-card-entry"
                    onClick={() => { window.location.hash = routeHref("defects", { id: row.id }); }}>
                    <span>{formatDate(row.reportedDate)}　{row.customerNameSnapshot}　{row.defectDescription}</span>
                    <StatusChip tone={defectTone[row.statusCode]}>
                      {row.statusCode === "created" ? "建立" : row.statusCode === "processing" ? "處理中" : "已解決"}
                    </StatusChip>
                  </button>)} /> : null}
                {canViewCustomers ? <RelatedCard title="報價紀錄"
                  count={`${quoteSummary?.customerCount ?? 0} 位客戶 · ${quoteSummary?.groups.length ?? 0} 種價格`}
                  empty="尚無報價紀錄。" onAdd={() => { setQuoteCustomer(null); setRelatedDialog("quoteCreate"); }}
                  onView={() => setRelatedDialog("quoteBrowse")}
                  rows={(quoteSummary?.groups ?? []).slice(0, 3).map((group, index) => <span key={index}>
                    {quoteGroupText(group)}
                  </span>)} /> : null}
              </section> : null}
              {canViewCost && selected.margin ? <ItemMarginPanel result={selected.margin} onEdit={startEdit}/>:null}
            </div>
          </div>
        ) : (
          <MasterDetailEmpty title="尚未選擇商品" />
        )}
      </section>
    </div>
  </div>;
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="cy-item-info"><span>{label}</span><strong>{value || "—"}</strong></div>;
}
