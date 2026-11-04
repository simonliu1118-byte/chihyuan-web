import {STORE_REPAIR_PRODUCTS,type StoreRepair,type StoreRepairPrintSettings} from "../../../shared/store-repairs";
import {displayCustomerName} from "../../../shared/store";
import {formatPhone} from "../../../shared/phone";

const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]!);
const day=(v:string|null|undefined)=>v?v.replaceAll("-","/"):"";
const lines=(v:string)=>v.split("\n").map(x=>x.trim()).filter(Boolean);

/**
 * The printed repair slip (user 2026-11-04), after the legacy paper form: one product, filled in, for a
 * dot-matrix printer on 中一刀 continuous paper (9.5 × 5.5 in) — black lines only, no fills. Heading, contact lines and notes come from the
 * store's print settings, so nothing about the business is written into the code.
 */
export function repairSlipHtml(r:StoreRepair,s:StoreRepairPrintSettings):string{
 const contacts=[r.mobile,r.phone].filter(Boolean).map(v=>esc(formatPhone(v,"auto"))).concat(r.lineName?["LINE："+esc(r.lineName)]:[]).join("　");
 const customer=(r.customerCode?esc(r.customerCode)+"　":"")+esc(displayCustomerName(r.customerName,r.honorific));
 const product=esc(STORE_REPAIR_PRODUCTS[r.productKind])+"　"+esc(r.productText);
 const notes=lines(s.notes);
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>機器維修單</title><style>
@page{size:241mm 140mm;margin:6mm 8mm}
*{box-sizing:border-box}
body{margin:0;color:#000;background:#fff;font:11pt/1.3 "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif}
.head{display:grid;grid-template-columns:1fr auto 1fr;align-items:end;border:1px solid #000;border-bottom:0;padding:6px 10px}
.head h1{grid-column:2;margin:0;font-size:17pt;text-align:center;letter-spacing:.1em}
.head h2{grid-column:2;margin:1px 0 0;font-size:13pt;text-align:center;letter-spacing:.2em}
.contact{grid-column:3;grid-row:1/3;justify-self:end;align-self:end;font-size:10pt;text-align:left;white-space:pre-line}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:1px solid #000;padding:2px 8px;height:10mm;vertical-align:middle;word-break:break-all}
th{font-weight:normal;text-align:center;white-space:nowrap}
.tall{vertical-align:top;padding-top:5px}
.step{height:22mm;text-align:center}
.notes{height:auto;padding:5px 8px}
ol{margin:0;padding-left:1.4em}
</style></head><body>
<div class="head">${s.title?`<h1>${esc(s.title)}</h1>`:""}<h2>機器維修單</h2>${s.contact?`<div class="contact">${esc(s.contact)}</div>`:""}</div>
<table><colgroup><col style="width:14%"><col style="width:23%"><col style="width:23%"><col style="width:14%"><col style="width:13%"><col style="width:13%"></colgroup>
<tr><th>客戶名稱</th><td colspan="2">${customer}</td><th>送修日期</th><td colspan="2">${day(r.receivedDate)}</td></tr>
<tr><th>聯絡電話</th><td colspan="2">${contacts}</td><th>購買日期</th><td colspan="2">${r.purchaseDate?day(r.purchaseDate):"無"}</td></tr>
<tr><th>送修產品</th><td colspan="2">${product}</td><th>產品機號</th><td colspan="2">${esc(r.serialNo)}</td></tr>
<tr><th>配件備註</th><td colspan="2">${esc(r.accessories)}</td><th>備註</th><td colspan="2">${esc(r.note)}</td></tr>
<tr><th rowspan="2">故障狀況</th><td rowspan="2" colspan="2" class="tall">${esc(r.fault)}</td><th>送廠維修</th><th>維修完成</th><th>機器歸還</th></tr>
<tr><td class="step">${day(r.dates.SENT)}</td><td class="step">${day(r.dates.REPAIRED)}</td><td class="step">${day(r.dates.RETURNED)}</td></tr>
${notes.length?`<tr><th>注意事項</th><td colspan="5" class="notes"><ol>${notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ol></td></tr>`:""}
</table></body></html>`;
}

/**
 * 維修資訊卡 (user 2026-11-04): travels with the machine to the factory, printed on an 80 mm thermal
 * roll. Heading and footer are the store's own text; 送修問題 is the fault plus the inspection finding.
 * 送修日期 and 處理人員 are left blank for the factory hand-off; 保固內／外 is ticked by hand.
 */
export function repairCardHtml(r:StoreRepair,s:StoreRepairPrintSettings):string{
 const inspection=r.inspectResult==="BAD"?r.inspectProblem||"異常":r.inspectResult==="GOOD"?"無異常":"";
 const footer=lines(s.cardFooter);
 return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>維修資訊卡</title><style>
@page{size:80mm auto;margin:3mm 4mm}
*{box-sizing:border-box}
body{margin:0;width:72mm;color:#000;background:#fff;font:10pt/1.4 "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif}
h1{margin:0 0 1.5mm;font-size:13pt;text-align:center}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:1px solid #000;padding:1.2mm 1.5mm;vertical-align:top;word-break:break-all}
th{width:19mm;font-weight:normal;text-align:center;white-space:nowrap}
.blank{height:7mm}
.problem{min-height:24mm;height:24mm;white-space:pre-wrap}
footer{margin-top:2mm;text-align:center;font-size:9.5pt;white-space:pre-line}
</style></head><body>
<h1>${esc(s.cardTitle||"維修資訊卡")}</h1>
<table>
<tr><th>送修日期</th><td class="blank"></td></tr>
<tr><th>處理人員</th><td class="blank"></td></tr>
<tr><th>產品</th><td>${esc(STORE_REPAIR_PRODUCTS[r.productKind])}　${esc(r.productText)}</td></tr>
${r.serialNo?`<tr><th>機號</th><td>${esc(r.serialNo)}</td></tr>`:""}
<tr><th>銷售日期</th><td>${day(r.purchaseDate)}</td></tr>
<tr><th>保固</th><td>□ 保固內　　□ 保固外</td></tr>
<tr><th>送修<br>問題</th><td class="problem">${esc(r.fault)}${inspection?`\n檢測：${esc(inspection)}`:""}</td></tr>
</table>
${footer.length?`<footer>${footer.map(esc).join("\n")}</footer>`:""}
</body></html>`;
}

/** Prints through the browser's own print dialog, where the printer (dot-matrix or thermal) is chosen. */
export function printHtml(html:string){
 const frame=document.createElement("iframe");
 frame.setAttribute("aria-hidden","true");frame.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0";
 document.body.append(frame);
 const doc=frame.contentDocument!;doc.open();doc.write(html);doc.close();
 setTimeout(()=>{frame.contentWindow!.focus();frame.contentWindow!.print();setTimeout(()=>frame.remove(),1000)},100);
}
