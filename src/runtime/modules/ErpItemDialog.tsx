import { useEffect, useRef } from "react";
import { Loading } from "../../ui/feedback/Loading";
import { Dialog } from "../../ui/overlays/Dialog";
import { ErpItemResult } from "./ErpItemResult";
import { ErpJobStatus, showsData } from "./ErpJobStatus";
import { useErpJob } from "./useErpJob";

/**
 * One 品號 opened from 進貨輔助 (user 2026-10-21: click a 品號 for its data in its own window).
 * The window owns its job and asks at once; no 歷史異動.
 */
export function ErpItemDialog({ itemCode, onClose }: { itemCode: string; onClose: () => void }) {
  const job = useErpJob();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void job.start({ queryType: "ITEM_NO", itemNo: itemCode, includeHistory: false, historyFrom: null, historyTo: null });
  }, [itemCode]);
  const result = job.result?.queryType === "ITEM_NO" ? job.result : null;
  return <Dialog open title={`品號 ${itemCode} 資料`} size="large" onClose={onClose}>
    <div className="cy-erp-results cy-erp-order-dialog" aria-live="polite">
      {!result ? job.submitting ? <Loading /> : null : <>
        <ErpJobStatus result={result} />
        {showsData(result) && <ErpItemResult result={result} />}
      </>}
    </div>
  </Dialog>;
}
