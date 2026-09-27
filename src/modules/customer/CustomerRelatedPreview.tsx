import { Button } from "../../ui/primitives/Button";
import { StatusChip } from "../../ui/primitives/StatusChip";

export type CustomerRelatedPreviewKey = "visits" | "quotes" | "frequent" | "history";

export interface CustomerRelatedPreviewProps {
  customerId: number;
  activeKey: CustomerRelatedPreviewKey;
}

interface VisitPreview {
  id: number;
  date: string;
  person: string;
  employee: string;
  content: string;
}

interface QuoteBreakPreview {
  quantity: string;
  unit: string;
  price: string;
}

interface QuotePreview {
  id: number;
  date: string;
  itemNo: string;
  itemName: string;
  employee: string;
  breaks: readonly QuoteBreakPreview[];
}

interface FrequentPreview {
  id: number;
  kind: "formal" | "free-text";
  itemNo?: string;
  name: string;
  spec?: string;
  category?: string;
}

const visitPreview: Record<number, readonly VisitPreview[]> = {
  1: [
    { id: 1, date: "2026-09-24", person: "林小姐", employee: "王○○", content: "確認下月耗材需求，針灸針與棉球用量預計增加。" },
    { id: 2, date: "2026-08-28", person: "陳先生", employee: "王○○", content: "例行拜訪；提醒月底前會先寄對帳資料。" },
    { id: 3, date: "2026-07-15", person: "林小姐", employee: "李○○", content: "詢問新品規格，後續以電話補充尺寸資訊。" },
  ],
  2: [
    { id: 4, date: "2026-09-18", person: "黃小姐", employee: "李○○", content: "初次接觸，先記錄常用品項，尚未建立 SMART ERP 客戶編號。" },
  ],
  3: [],
};

const quotePreview: Record<number, readonly QuotePreview[]> = {
  1: [
    {
      id: 101,
      date: "2026-09-20",
      itemNo: "A-01021",
      itemName: "示範針灸針",
      employee: "王○○",
      breaks: [
        { quantity: "10", unit: "盒", price: "95" },
        { quantity: "50", unit: "盒", price: "90" },
        { quantity: "100", unit: "盒", price: "86" },
      ],
    },
    {
      id: 102,
      date: "2026-06-11",
      itemNo: "A-01021",
      itemName: "示範針灸針",
      employee: "李○○",
      breaks: [
        { quantity: "10", unit: "盒", price: "98" },
        { quantity: "50", unit: "盒", price: "92" },
      ],
    },
    {
      id: 103,
      date: "2026-05-03",
      itemNo: "A-00405",
      itemName: "示範棉球",
      employee: "王○○",
      breaks: [{ quantity: "20", unit: "包", price: "65" }],
    },
  ],
  2: [],
  3: [],
};

const frequentPreview: Record<number, readonly FrequentPreview[]> = {
  1: [
    { id: 201, kind: "formal", itemNo: "A-01021", name: "示範針灸針", spec: "0.25 × 25 mm" },
    { id: 202, kind: "formal", itemNo: "A-00405", name: "示範棉球", spec: "中包裝" },
    { id: 203, kind: "free-text", name: "院內自用特殊網套", category: "未建檔／客戶情報" },
  ],
  2: [
    { id: 204, kind: "free-text", name: "特殊尺寸洞巾", category: "未建檔／需求追蹤" },
  ],
  3: [],
};

function EmptyRelated({ title, description }: { title: string; description: string }) {
  return (
    <div className="cy-customer-related-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function Visits({ customerId }: { customerId: number }) {
  const visits = visitPreview[customerId] ?? [];
  if (visits.length === 0) {
    return <EmptyRelated title="尚無拜訪紀錄" description="正式版只在開啟此分頁時查詢該客戶的拜訪資料。" />;
  }

  return (
    <div className="cy-customer-related-layout">
      <div className="cy-customer-related-heading">
        <div>
          <strong>最近拜訪</strong>
          <span>以拜訪日期由新到舊顯示；人物名稱保留拜訪當時快照。</span>
        </div>
        <Button type="button" tone="secondary" size="small" disabled title="UI preview only">新增拜訪</Button>
      </div>
      <div className="cy-customer-visit-list">
        {visits.map((visit) => (
          <article className="cy-customer-visit-row" key={visit.id}>
            <time>{visit.date}</time>
            <div className="cy-customer-visit-marker" aria-hidden="true" />
            <div className="cy-customer-visit-body">
              <div className="cy-customer-visit-meta">
                <strong>{visit.person}</strong>
                <span>記錄：{visit.employee}</span>
              </div>
              <p>{visit.content}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="cy-customer-related-footnote">正式版採分頁按需載入，不會在開啟客戶主檔時先把全部拜訪歷史抓進瀏覽器。</div>
    </div>
  );
}

function Quotes({ customerId }: { customerId: number }) {
  const quotes = quotePreview[customerId] ?? [];
  if (quotes.length === 0) {
    return <EmptyRelated title="尚無報價紀錄" description="這裡是客戶＋單一商品的價格歷史，不是 SMART ERP 的正式報價單。" />;
  }

  return (
    <div className="cy-customer-related-layout">
      <div className="cy-customer-related-heading">
        <div>
          <strong>報價歷史</strong>
          <span>每次新的商業報價保留成一筆歷史；不覆蓋舊價格。</span>
        </div>
        <Button type="button" tone="secondary" size="small" disabled title="UI preview only">新增報價紀錄</Button>
      </div>
      <div className="cy-customer-quote-list">
        {quotes.map((quote, index) => (
          <article className="cy-customer-quote-card" key={quote.id}>
            <header>
              <div>
                <div className="cy-customer-quote-title">
                  <strong>{quote.itemName}</strong>
                  {index === 0 ? <StatusChip tone="success">較新</StatusChip> : null}
                </div>
                <span>{quote.itemNo}</span>
              </div>
              <div className="cy-customer-quote-date">
                <strong>{quote.date}</strong>
                <span>{quote.employee}</span>
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
          </article>
        ))}
      </div>
      <div className="cy-customer-related-footnote">資料修正與「重新報一個新價格」是不同操作；正式版修正既有紀錄時會走 Audit 流程。</div>
    </div>
  );
}

function FrequentItems({ customerId }: { customerId: number }) {
  const items = frequentPreview[customerId] ?? [];
  if (items.length === 0) {
    return <EmptyRelated title="尚無常用商品" description="可記正式商品，也可先保留尚未建檔的客戶需求。" />;
  }

  return (
    <div className="cy-customer-related-layout">
      <div className="cy-customer-related-heading">
        <div>
          <strong>常用商品</strong>
          <span>正式商品與自由文字需求分開呈現，系統不會因名稱相同就自動建立商品關聯。</span>
        </div>
        <Button type="button" tone="secondary" size="small" disabled title="UI preview only">編輯常用商品</Button>
      </div>
      <div className="cy-customer-frequent-grid">
        {items.map((item) => (
          <article className="cy-customer-frequent-card" key={item.id}>
            <div className="cy-customer-frequent-kind">
              <StatusChip tone={item.kind === "formal" ? "success" : "warning"}>
                {item.kind === "formal" ? "正式商品" : "未建檔"}
              </StatusChip>
            </div>
            <strong>{item.name}</strong>
            {item.itemNo ? <span>{item.itemNo}</span> : null}
            {item.spec ? <small>{item.spec}</small> : null}
            {item.category ? <small>{item.category}</small> : null}
          </article>
        ))}
      </div>
      <div className="cy-customer-related-footnote">未建檔項目之後若成為 SMART ERP 正式商品，仍必須由使用者明確選取後才建立 item_id 關聯。</div>
    </div>
  );
}

function History() {
  return (
    <div className="cy-customer-history-preview">
      <div>
        <strong>動態 / 歷史</strong>
        <p>一般主檔修改只顯示最後更新資訊；真正重要的業務動作才進入共用 Audit Core。</p>
      </div>
      <StatusChip tone="neutral">等待 Audit API</StatusChip>
    </div>
  );
}

export function CustomerRelatedPreview({ customerId, activeKey }: CustomerRelatedPreviewProps) {
  if (activeKey === "visits") return <Visits customerId={customerId} />;
  if (activeKey === "quotes") return <Quotes customerId={customerId} />;
  if (activeKey === "frequent") return <FrequentItems customerId={customerId} />;
  return <History />;
}
