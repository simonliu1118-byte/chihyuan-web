import { useEffect, useRef } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import { ErpSalesOrders } from "./ErpSalesOrders";
import { useErpJob } from "./useErpJob";

/**
 * One 銷貨單／銷退單 opened from a 未收款 憑證 (user 2026-10-17: see what the order sold without
 * leaving the 未收款 list). The dialog owns its own short job; the page's result stays untouched.
 */
export function ErpOrderDialog({ orderNo, onClose }: { orderNo: string; onClose: () => void }) {
  const job = useErpJob();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void job.start({ queryType: "ORDER", orderNo });
  }, [orderNo]);
  const result = job.result;
  return <Dialog open title={`單號 ${orderNo}`} size="large" onClose={onClose}>
    <div className="cy-erp-results cy-erp-order-dialog" aria-live="polite">
      {!result ? <p>{job.submitting ? "送出中…" : "無法送出查詢，請關閉後再試。"}</p> : <>
        <ErpJobStatus result={result} />
        {showsData(result) && <ErpSalesOrders orders={result.orders} total={result.total} truncated={result.truncated} defaultOpen />}
      </>}
    </div>
  </Dialog>;
}
