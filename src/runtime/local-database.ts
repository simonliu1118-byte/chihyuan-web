import { useSyncExternalStore } from "react";

export type SalesOrderStatus = "created" | "issued" | "waiting_stock" | "picked" | "shipped" | "voided";
export type OutsourcingStatus = "pending_outbound" | "outbound" | "received" | "priced" | "paid" | "voided";
export type WorkLogStatus = "created" | "pending_review" | "reviewed";

export interface LocalCustomer {
  id: number;
  customerNo: string | null;
  name: string;
  shortName: string | null;
  taxId: string | null;
  phone: string | null;
  contact: string | null;
  address: string | null;
  category: string;
  status: string;
  note: string | null;
  isActive: boolean;
  revision: number;
  updatedAt: string;
}

export interface LocalItemConversion {
  fromUnit: string;
  quantity: number;
  toUnit: string;
}

export interface LocalItem {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
  category: string;
  baseUnit: string;
  isActive: boolean;
  revision: number;
  updatedAt: string;
  conversions: LocalItemConversion[];
}

export interface LocalSalesOrderLine {
  id: number;
  itemId: number;
  quantity: number;
  unit: string;
  unitPrice: number | null;
}

export interface LocalSalesOrder {
  id: number;
  ref: string;
  orderDate: string;
  customerId: number | null;
  customerNameSnapshot: string;
  erpRef: string | null;
  status: SalesOrderStatus;
  note: string | null;
  lines: LocalSalesOrderLine[];
  revision: number;
  updatedAt: string;
}

export interface LocalContractorPrice {
  itemId: number;
  unit: string;
  price: number;
}

export interface LocalContractor {
  id: number;
  name: string;
  phone: string | null;
  isActive: boolean;
  prices: LocalContractorPrice[];
  revision: number;
  updatedAt: string;
}

export interface LocalBomComponent {
  itemId: number;
  quantity: number;
  unit: string;
}

export interface LocalBom {
  id: number;
  ref: string;
  finishedItemId: number;
  outputQuantity: number;
  outputUnit: string;
  components: LocalBomComponent[];
  isActive: boolean;
  revision: number;
  updatedAt: string;
}

export interface LocalOutsourcingPart {
  itemId: number;
  quantity: number;
  unit: string;
}

export interface LocalReceiptItem {
  itemId: number;
  bomId: number | null;
  quantity: number;
  unit: string;
}

export interface LocalOutsourcingOrder {
  id: number;
  ref: string;
  contractorId: number;
  orderDate: string;
  outboundDate: string | null;
  status: OutsourcingStatus;
  parts: LocalOutsourcingPart[];
  receiptItems: LocalReceiptItem[];
  pricingTotal: number | null;
  paidAt: string | null;
  revision: number;
  updatedAt: string;
}

export interface LocalStockMovement {
  id: number;
  contractorId: number;
  itemId: number;
  quantityDelta: number;
  type: "outbound_supply" | "receipt_consumption" | "reversal";
  outsourcingOrderId: number;
  reversalOf: number | null;
  occurredAt: string;
}

export interface LocalWorkLogEntry {
  id: number;
  content: string;
  category: string;
  quantity: number;
  reviewScore: number | null;
  reviewRemark: string | null;
}

export interface LocalWorkLog {
  id: number;
  ref: string;
  logDate: string;
  dateFrom: string;
  dateTo: string;
  workDays: number;
  employeeName: string;
  status: WorkLogStatus;
  entries: LocalWorkLogEntry[];
  reviewRemark: string | null;
  finalScore: number | null;
  averageDailyScore: number | null;
  revision: number;
  updatedAt: string;
}

export interface LocalSettings {
  customerCategories: string[];
  customerStatuses: string[];
  itemCategories: string[];
  workLogCategories: string[];
  workLogPlatforms: string[];
}

export interface LocalAuditEvent {
  id: number;
  at: string;
  action: string;
  summary: string;
}

export interface LocalDatabase {
  schemaVersion: 1;
  sequence: number;
  customers: LocalCustomer[];
  items: LocalItem[];
  salesOrders: LocalSalesOrder[];
  contractors: LocalContractor[];
  boms: LocalBom[];
  outsourcingOrders: LocalOutsourcingOrder[];
  stockMovements: LocalStockMovement[];
  workLogs: LocalWorkLog[];
  settings: LocalSettings;
  audit: LocalAuditEvent[];
}

const STORAGE_KEY = "cyweb.local-runtime.v1";
const listeners = new Set<() => void>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString();
}

function seedDatabase(): LocalDatabase {
  const timestamp = now();
  return {
    schemaVersion: 1,
    sequence: 100,
    customers: [
      {
        id: 1,
        customerNo: "C0001",
        name: "示範中醫診所",
        shortName: "示範診所",
        taxId: null,
        phone: "07-000-0000",
        contact: "王小姐",
        address: "高雄市示範路 1 號",
        category: "診所",
        status: "正常",
        note: "本筆為本機測試資料，可直接修改或刪除。",
        isActive: true,
        revision: 1,
        updatedAt: timestamp,
      },
    ],
    items: [
      {
        id: 10,
        itemNo: "A0001",
        name: "示範成品",
        spec: "標準型",
        category: "成品",
        baseUnit: "個",
        isActive: true,
        revision: 1,
        updatedAt: timestamp,
        conversions: [{ fromUnit: "箱", quantity: 20, toUnit: "個" }],
      },
      {
        id: 11,
        itemNo: "P0001",
        name: "示範料件",
        spec: null,
        category: "零件",
        baseUnit: "個",
        isActive: true,
        revision: 1,
        updatedAt: timestamp,
        conversions: [],
      },
    ],
    salesOrders: [
      {
        id: 20,
        ref: "SO-LOCAL-001",
        orderDate: today(),
        customerId: 1,
        customerNameSnapshot: "示範中醫診所",
        erpRef: null,
        status: "created",
        note: "可直接測試 ERP 回填與出貨流程。",
        lines: [{ id: 21, itemId: 10, quantity: 2, unit: "個", unitPrice: null }],
        revision: 1,
        updatedAt: timestamp,
      },
    ],
    contractors: [
      {
        id: 30,
        name: "示範代工對象",
        phone: "09-0000-0000",
        isActive: true,
        prices: [{ itemId: 10, unit: "個", price: 12.5 }],
        revision: 1,
        updatedAt: timestamp,
      },
    ],
    boms: [
      {
        id: 40,
        ref: "BOM-LOCAL-001",
        finishedItemId: 10,
        outputQuantity: 1,
        outputUnit: "個",
        components: [{ itemId: 11, quantity: 2, unit: "個" }],
        isActive: true,
        revision: 1,
        updatedAt: timestamp,
      },
    ],
    outsourcingOrders: [],
    stockMovements: [],
    workLogs: [
      {
        id: 50,
        ref: "WL-LOCAL-001",
        logDate: today(),
        dateFrom: today(),
        dateTo: today(),
        workDays: 1,
        employeeName: "本機測試使用者",
        status: "created",
        entries: [{ id: 51, content: "熟悉 CY Web 本機操作版", category: "一般工作", quantity: 1, reviewScore: null, reviewRemark: null }],
        reviewRemark: null,
        finalScore: null,
        averageDailyScore: null,
        revision: 1,
        updatedAt: timestamp,
      },
    ],
    settings: {
      customerCategories: ["診所", "醫院", "藥局", "其他"],
      customerStatuses: ["正常", "暫停往來"],
      itemCategories: ["成品", "零件", "耗材", "其他"],
      workLogCategories: ["一般工作", "客戶聯繫", "商品維護"],
      workLogPlatforms: ["電話", "LINE", "Email", "其他"],
    },
    audit: [
      { id: 1, at: timestamp, action: "runtime.seeded", summary: "建立 CY Web 本機操作測試資料" },
    ],
  };
}

function cloneDatabase(database: LocalDatabase): LocalDatabase {
  return JSON.parse(JSON.stringify(database)) as LocalDatabase;
}

function readStorage(): LocalDatabase {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDatabase();
    const parsed = JSON.parse(raw) as LocalDatabase;
    if (parsed?.schemaVersion !== 1) return seedDatabase();
    return parsed;
  } catch {
    return seedDatabase();
  }
}

let currentDatabase: LocalDatabase | null = null;

function database(): LocalDatabase {
  if (!currentDatabase) currentDatabase = readStorage();
  return currentDatabase;
}

function persist(next: LocalDatabase): void {
  currentDatabase = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function nextLocalId(db: LocalDatabase): number {
  db.sequence += 1;
  return db.sequence;
}

export function mutateLocalDatabase(
  action: string,
  summary: string,
  mutation: (draft: LocalDatabase) => void,
): void {
  const draft = cloneDatabase(database());
  mutation(draft);
  draft.audit.unshift({ id: nextLocalId(draft), at: now(), action, summary });
  draft.audit = draft.audit.slice(0, 1000);
  persist(draft);
}

export function replaceLocalDatabase(next: LocalDatabase): void {
  if (next.schemaVersion !== 1) throw new Error("不支援的本機資料版本");
  persist(cloneDatabase(next));
}

export function resetLocalDatabase(): void {
  persist(seedDatabase());
}

export function exportLocalDatabase(): string {
  return JSON.stringify(database(), null, 2);
}

export function importLocalDatabase(raw: string): void {
  const parsed = JSON.parse(raw) as LocalDatabase;
  replaceLocalDatabase(parsed);
}

export function getLocalDatabaseSnapshot(): LocalDatabase {
  return database();
}

export function useLocalDatabase(): LocalDatabase {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocalDatabaseSnapshot,
    getLocalDatabaseSnapshot,
  );
}

export function timestampNow(): string {
  return now();
}

export function dateToday(): string {
  return today();
}
