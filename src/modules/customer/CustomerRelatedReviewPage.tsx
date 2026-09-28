import { useState } from "react";
import {
  CustomerRelatedInteractionPreview,
  relatedInteractionCustomers,
  type CustomerRelatedInteractionKey,
} from "./CustomerRelatedInteractionPreview";
import { Notice } from "../../ui/primitives/Notice";
import { StatusChip } from "../../ui/primitives/StatusChip";

export function CustomerRelatedReviewPage() {
  const [customerId, setCustomerId] = useState<number>(1);
  const [activeKey, setActiveKey] = useState<CustomerRelatedInteractionKey>("visits");
  const customer = relatedInteractionCustomers.find((item) => item.id === customerId) ?? relatedInteractionCustomers[0];

  return (
    <div className="cy-page cy-customer-related-review-page">
      <header className="cy-page-header">
        <div>
          <p className="cy-page-eyebrow">Customer · Related Records Interaction Review</p>
          <h1>客戶相關資料區</h1>
          <p className="cy-page-description">
            實際測試拜訪、報價與常用商品的新增／修改／刪除或修正互動。所有操作都只存在目前瀏覽器，不連 D1。
          </p>
        </div>
        <StatusChip tone="info">0.1.23 Preview</StatusChip>
      </header>

      <Notice tone="info" title="先驗證操作方式，再接正式 API">
        正式 Customer 主檔仍採已確認的左 Search Pane／右 Detail Pane。這個獨立頁把相關資料區放大，方便確認 Drawer、確認視窗、未儲存保護與資料層級是否合理。
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
            {relatedInteractionCustomers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </section>

      <div className="cy-customer-related-review-panel">
        <CustomerRelatedInteractionPreview
          customerId={customerId}
          activeKey={activeKey}
          onChange={setActiveKey}
        />
      </div>
    </div>
  );
}
