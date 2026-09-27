import { useState } from "react";
import {
  CustomerRelatedPanelPreview,
  type CustomerRelatedPreviewKey,
} from "./CustomerRelatedPreview";
import { Notice } from "../../ui/primitives/Notice";
import { StatusChip } from "../../ui/primitives/StatusChip";

const customers = [
  { id: 1, name: "示範中醫診所", no: "C-00128" },
  { id: 2, name: "測試養生館", no: "尚無 ERP 編號" },
  { id: 3, name: "範例診所", no: "C-00041" },
] as const;

export function CustomerRelatedReviewPage() {
  const [customerId, setCustomerId] = useState<number>(1);
  const [activeKey, setActiveKey] = useState<CustomerRelatedPreviewKey>("visits");
  const customer = customers.find((item) => item.id === customerId) ?? customers[0];

  return (
    <div className="cy-page cy-customer-related-review-page">
      <header className="cy-page-header">
        <div>
          <p className="cy-page-eyebrow">Customer · Related Records Review</p>
          <h1>客戶相關資料區</h1>
          <p className="cy-page-description">
            檢視拜訪、報價、常用商品與未來 Audit Timeline 的共用呈現方式。這是靜態 UI review，不連 D1。
          </p>
        </div>
        <StatusChip tone="info">0.1.21 Preview</StatusChip>
      </header>

      <Notice tone="info" title="只驗證相關資料區的資訊密度與操作層級">
        正式 Customer 主檔仍採已確認的左 Search Pane／右 Detail Pane；此頁只是把下方相關資料區獨立放大檢視。
      </Notice>

      <section className="cy-customer-related-review-customer">
        <div>
          <span>目前示範客戶</span>
          <strong>{customer.name}</strong>
          <small>{customer.no}</small>
        </div>
        <label>
          <span className="cy-visually-hidden">切換示範客戶</span>
          <select
            value={customerId}
            onChange={(event) => {
              setCustomerId(Number(event.target.value));
              setActiveKey("visits");
            }}
          >
            {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>

      <div className="cy-customer-related-review-panel">
        <CustomerRelatedPanelPreview
          customerId={customerId}
          activeKey={activeKey}
          onChange={setActiveKey}
        />
      </div>
    </div>
  );
}
