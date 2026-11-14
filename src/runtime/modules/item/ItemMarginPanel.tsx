import { OnlineMarginTables } from "./OnlineMarginTables";
import type { ItemMarginResult, MarginValue } from "../../../../shared/item-margin";
import { RecordSheet } from "../../../ui/forms/RecordSheet";
import { StatusChip } from "../../../ui/primitives/StatusChip";

const money = (value: string | null) => {
  if (value == null) return "—";
  const [whole, fraction] = value.split(".");
  return "$" + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
};
const taxNames = { inclusive: "含稅", exclusive: "未稅（外加）", no_tax: "不計稅" };
const channelNames = { store: "門市", clinic: "診所", wholesale: "批發" };

function Profit({ value }: { value: MarginValue | null }) {
  if (!value) return <>—</>;
  const content = <>{money(value.grossProfit)}／{value.grossMarginPercent == null ? "—（售價為 0）" : value.grossMarginPercent + "%"}</>;
  return <div>{value.negative ? <StatusChip tone="danger">{content}</StatusChip> : content}
    <div><small>未稅銷售額 {money(value.netSales)}</small></div></div>;
}

/** Presentation only: the parent owns the same saved item and derived margin response. */
export function ItemMarginPanel({ result, onEdit }: { result: ItemMarginResult; onEdit: () => void }) {
  return <section aria-label="商品毛利分析">
    <div className="cy-record-header"><h3>成本摘要</h3>
      <button className="cy-op-button compact soft" type="button" onClick={onEdit}>修改商品主檔</button></div>
    <RecordSheet label="毛利成本摘要" editing={false} rows={[
      { columns: "repeat(3,minmax(0,1fr))", cells: [
        { label: "原始進價", view: money(result.originalCost) },
        { label: "成本稅別", view: result.costTaxMode ? taxNames[result.costTaxMode] : <StatusChip tone="warning">待補資料</StatusChip> },
        { label: "成本單位", view: result.baseUnit },
      ] },
      { columns: "repeat(3,minmax(0,1fr))", cells: [
        { label: "進貨付款金額", view: money(result.payment) },
        { label: "可扣抵進項稅額", view: money(result.inputTax) },
        { label: "毛利計算成本", view: money(result.netCost) },
      ] },
    ]} />
    {result.costStatus ? <StatusChip tone="warning">{result.costStatus}</StatusChip> : null}
    <p>依一般應稅交易、營業稅 5% 且進項可扣抵的前提計算；不計稅不拆進項稅。特殊或不可扣抵情況需另行處理。</p>
    <h3>通路毛利比較</h3>
    <table className="cy-op-table cy-rt"><thead><tr>
      <th>通路／單位</th><th className="is-number">主檔售價</th><th className="is-number">該單位淨成本</th>
      <th className="is-number">未稅價解讀：毛利額／率</th><th className="is-number">含稅價解讀：毛利額／率</th><th>資料狀態</th>
    </tr></thead><tbody>{result.rows.map((row, index) => <tr key={row.channel + ":" + row.unit + ":" + index}>
      <td data-label="通路／單位" data-priority="title">{channelNames[row.channel]}／{row.unit}</td>
      <td data-label="主檔售價" className="is-number">{money(row.price)}</td>
      <td data-label="該單位淨成本" className="is-number">{money(row.netCost)}</td>
      <td data-label="未稅價解讀：毛利額／率" className="is-number"><Profit value={row.exclusive} /></td>
      <td data-label="含稅價解讀：毛利額／率" className="is-number"><Profit value={row.inclusive} /></td>
      <td data-label="資料狀態">{row.status ? <StatusChip tone="warning">{row.status}</StatusChip> : <StatusChip tone="success">完整</StatusChip>}</td>
    </tr>)}</tbody></table>
    <OnlineMarginTables platforms={result.online??[]}/>
    <p>門市售價固定含稅；診所與批發同一售價分別作含稅、未稅解讀。毛利率以未稅銷售額為分母，金額與比例於最後顯示時取兩位小數。</p>
  </section>;
}
