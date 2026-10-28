import { useEffect, useState } from "react";
import { Dialog } from "../../ui/overlays/Dialog";
import { ERP_HELD_EVENT, type ErpHeldDetail } from "./useErpJob";

/**
 * A query refused because ERP is paused (user 2026-10-28): besides 知道了, the member may queue it
 * to run once the pause ends. Mounted once by the app, so it answers for every ERP query.
 */
export function ErpHeldPrompt() {
  const [ask, setAsk] = useState<ErpHeldDetail | null>(null);
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<ErpHeldDetail>).detail;
      detail.handled = true;
      setAsk(current => { current?.answer(false); return detail; });
    };
    window.addEventListener(ERP_HELD_EVENT, listen);
    return () => window.removeEventListener(ERP_HELD_EVENT, listen);
  }, []);
  const answer = (queue: boolean) => { ask?.answer(queue); setAsk(null); };
  return <Dialog open={!!ask} title="ERP 暫停中" size="small" onClose={() => answer(false)}
    footer={<div className="cy-dialog-action-row">
      <button type="button" className="cy-op-button" onClick={() => answer(false)}>知道了</button>
      <button type="button" className="cy-op-button primary" onClick={() => answer(true)}>加入佇列，暫停結束自動查</button>
    </div>}>
    <p>{ask?.message}。</p>
    <p>加入佇列後，暫停結束時會自動查詢，查完會通知你。</p>
  </Dialog>;
}
