import { useMemo, useState } from "react";
import { DataView, type DataColumn } from "../../ui/data/DataView";
import { DataViewToolbar } from "../../ui/data/DataViewToolbar";
import { Button } from "../../ui/primitives/Button";
import { Notice } from "../../ui/primitives/Notice";
import { StatusChip } from "../../ui/primitives/StatusChip";

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

type RelatedKey = "visits" | "quotes" | "frequent" | "history";

const previewCustomers: readonly PreviewCustomer[] = [
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
  {
    key: "region",
    header: "地區",
    render: (customer) => customer.region,
  },
  {
    key: "status",
    header: "狀態",
    align: "end",
    render: (customer) => <CustomerStatus status={customer.status} />,
  },
];

function CustomerStatus({ status }: { status: PreviewCustomer["status"] }) {
  const tone = status === "往來中" ? "success" : status === "潛在客戶" ? "info" : "neutral";
  return <StatusChip tone={tone}>{status}</StatusChip>;
}

function DetailValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="cy-customer-detail-value">
      <span>{label}</span>
      <strong>{children || "—"}</strong>
    </div>
  );
}

const relatedLabels: Record<RelatedKey, string> = {
  visits: "拜訪紀錄",
  quotes: "報價紀錄",
  frequent: "常用商品",
  history: "動態 / 歷史",
};

export function CustomerWorkspacePreview() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(previewCustomers[0].id);
  const [relatedKey, setRelatedKey] = useState<RelatedKey>("visits");

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return previewCustomers;
    return previewCustomers.filter((customer) =>
      [customer.customerNo, customer.shortName, customer.fullName, customer.taxId, customer.region]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(value),
    );
  }, [query]);

  const selected = previewCustomers.find((customer) => customer.id === selectedId) ?? previewCustomers[0];

  return (
    <div className="cy-page cy-customer-preview-page">
      <header className="cy-page-header cy-customer-page-header">
        <div>
          <p className="cy-page-eyebrow">Customer · Composition Preview</p>
          <h1>客戶管理</h1>
          <p className="cy-page-description">
            第一版新 Web 資訊架構預覽。資料皆為靜態示範，用來確認搜尋、主檔與相關紀錄的空間關係，不代表正式資料或最終視覺。
          </p>
        </div>
        <Button type="button" disabled title="Composition preview only">
          新增客戶
        </Button>
      </header>

      <Notice tone="info" title="本頁是 UI 構圖預覽">
        Legacy 只作流程參考。這一版刻意改成搜尋＋主檔並存的 Workspace，不沿用 GAS 的五個頂層頁籤與 disabled-input 表單。
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
            selectedKey={selected.id}
            onSelect={(customer) => setSelectedId(customer.id)}
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
          <div className="cy-customer-detail-header">
            <div className="cy-customer-detail-titleblock">
              <div className="cy-customer-detail-titleline">
                <h2>{selected.shortName}</h2>
                <CustomerStatus status={selected.status} />
              </div>
              <div className="cy-customer-detail-subtitle">{selected.fullName}</div>
              <div className="cy-customer-detail-meta">
                <span>{selected.customerNo ?? "尚未建立 ERP 客戶編號"}</span>
                <span>{selected.category}</span>
                <span>{selected.region}</span>
                <span>{selected.department} / {selected.owner}</span>
              </div>
            </div>
            <div className="cy-customer-detail-actions">
              <Button type="button" tone="secondary" disabled title="Composition preview only">
                修改
              </Button>
            </div>
          </div>

          <div className="cy-customer-overview-grid">
            <div className="cy-customer-info-card">
              <div className="cy-customer-info-card-title">基本資料</div>
              <div className="cy-customer-value-grid">
                <DetailValue label="客戶編號">{selected.customerNo ?? "尚未建立"}</DetailValue>
                <DetailValue label="統一編號">{selected.taxId ?? "未填寫"}</DetailValue>
                <DetailValue label="客戶分類">{selected.category}</DetailValue>
                <DetailValue label="客戶狀態">{selected.status}</DetailValue>
              </div>
            </div>

            <div className="cy-customer-info-card">
              <div className="cy-customer-info-card-title">負責資訊</div>
              <div className="cy-customer-value-grid">
                <DetailValue label="地區">{selected.region}</DetailValue>
                <DetailValue label="負責部門">{selected.department}</DetailValue>
                <DetailValue label="業務人員">{selected.owner}</DetailValue>
                <DetailValue label="最後更新">{selected.updatedAt}</DetailValue>
              </div>
            </div>

            <div className="cy-customer-info-card cy-customer-info-card-wide">
              <div className="cy-customer-info-card-title">聯絡方式</div>
              <div className="cy-customer-contact-layout">
                <div>
                  <span className="cy-customer-subheading">電話 / 傳真</span>
                  {selected.phones.map((phone) => <div className="cy-customer-line" key={phone}>{phone}</div>)}
                  <div className="cy-customer-line cy-customer-muted">傳真：{selected.fax ?? "—"}</div>
                </div>
                <div>
                  <span className="cy-customer-subheading">聯絡人</span>
                  {selected.contacts.length > 0 ? selected.contacts.map((contact) => (
                    <div className="cy-customer-contact-row" key={`${selected.id}-${contact.name}`}>
                      <strong>{contact.name}</strong>
                      <span>{contact.detail}</span>
                      <small>{contact.mobile ?? "未填行動電話"}</small>
                    </div>
                  )) : <div className="cy-customer-muted">尚無聯絡人</div>}
                </div>
              </div>
            </div>

            <div className="cy-customer-info-card cy-customer-info-card-wide">
              <div className="cy-customer-info-card-title">地址</div>
              <div className="cy-customer-address-list">
                {selected.addresses.map((address) => (
                  <div className="cy-customer-address-row" key={`${selected.id}-${address.address}`}>
                    <span>{address.postalCode}</span>
                    <strong>{address.address}</strong>
                    <small>{address.note ?? ""}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="cy-customer-info-card cy-customer-info-card-wide cy-customer-note-card">
              <div className="cy-customer-info-card-title">重要備註</div>
              <div className="cy-customer-note-list">
                {selected.notes.map((note) => <div key={note}>{note}</div>)}
              </div>
            </div>
          </div>

          <div className="cy-customer-related">
            <div className="cy-customer-related-tabs" role="tablist" aria-label="客戶相關紀錄">
              {(Object.keys(relatedLabels) as RelatedKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={relatedKey === key}
                  className={relatedKey === key ? "is-active" : ""}
                  onClick={() => setRelatedKey(key)}
                >
                  {relatedLabels[key]}
                </button>
              ))}
            </div>
            <div className="cy-customer-related-content" role="tabpanel">
              <div>
                <strong>{relatedLabels[relatedKey]}</strong>
                <p>此區在正式版會於切換時透過 Worker / D1 按需取得，不會跟客戶主檔一起整包載入。</p>
              </div>
              <StatusChip tone="info">按需載入</StatusChip>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
