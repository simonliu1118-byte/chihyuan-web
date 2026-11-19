import {BOT_PLATFORMS,taipeiTodayRange} from "../../../shared/bot-center";
import {formatDateTime} from "../../ui/foundation/format";

/** 金額以「分」存放；顯示為新台幣元（整數不帶小數）。 */
export function decisionAmountText(cents:number):string{
 return "NT$ "+(cents/100).toLocaleString("zh-TW",{maximumFractionDigits:2});
}
/** 期限顯示：台北今日只寫「今日 HH:MM」，其餘寫「MM/DD HH:MM」；沒有期限為「—」。 */
export function deadlineText(deadline:string|null,nowMs=Date.now()):string{
 if(!deadline)return "—";
 const stamp=formatDateTime(deadline);
 return taipeiTodayRange(new Date(deadline)).day===taipeiTodayRange(new Date(nowMs)).day?"今日 "+stamp.slice(11):stamp.slice(5);
}
/** 期限是台北今日或更早（紅字）。 */
export function deadlineUrgent(deadline:string|null,nowMs=Date.now()):boolean{
 return !!deadline&&taipeiTodayRange(new Date(deadline)).day<=taipeiTodayRange(new Date(nowMs)).day;
}
/** 平台標籤的顏色分類；FB／IG／Threads 各一色，其餘（舊自由文字）為中性。 */
export function platformClass(platform:string):string{
 const known=BOT_PLATFORMS.find(name=>name===platform);
 return "cy-bot-platform"+(known?" cy-bot-platform-"+known.toLowerCase():"");
}
/** 台北時間的 HH:MM。 */
export const clockText=(value:string):string=>formatDateTime(value).slice(11);
