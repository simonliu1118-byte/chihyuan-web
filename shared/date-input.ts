export const taipeiToday=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export function dateInputDisplay(digits:string,expandMonthDay=true,today=taipeiToday()){
 if(expandMonthDay&&digits.length===4){const value=parseDateInput(digits,today);if(value)return value.replaceAll("-","/")}
 return digits.slice(0,4)+(digits.length>4?"/"+digits.slice(4,6):"")+(digits.length>6?"/"+digits.slice(6,8):"");
}
export function monthInputDisplay(digits:string){return digits.slice(0,4)+(digits.length>4?"/"+digits.slice(4,6):"")}
export function parseMonthInput(value:string){const m=/^(\d{4})[-/](0[1-9]|1[0-2])$/.exec(value.normalize("NFKC").trim());if(!m)return "";const first=dateValue(Number(m[1]),Number(m[2]),1);return first?first.slice(0,7):""}
export function shiftMonthInput(value:string,delta:number){const iso=parseMonthInput(value);if(!iso||!Number.isInteger(delta))return "";const n=(Number(iso.slice(0,4))-1)*12+Number(iso.slice(5))-1+delta;if(n<0||n>=9999*12)return "";return dateValue(Math.floor(n/12)+1,n%12+1,1).slice(0,7)}
export function dateValue(year:number,month:number,day:number){
 if(!Number.isInteger(year)||year<1||year>9999||month<1||month>12||day<1||day>31)return "";
 const iso=`${String(year).padStart(4,"0")}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
 const d=new Date(iso+"T12:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:"";
}
export function parseDateInput(value:string,today=taipeiToday()){
 const text=value.normalize("NFKC").trim();
 if(/^\d{4}$/.test(text))return dateValue(Number(today.slice(0,4)),Number(text.slice(0,2)),Number(text.slice(2)));
 if(/^\d{8}$/.test(text))return dateValue(Number(text.slice(0,4)),Number(text.slice(4,6)),Number(text.slice(6)));
 const m=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);return m?dateValue(Number(m[1]),Number(m[2]),Number(m[3])):"";
}
export function shiftDate(value:string,delta:number){const date=new Date(value+"T12:00:00Z");date.setUTCDate(date.getUTCDate()+delta);const iso=date.toISOString().slice(0,10);return /^\d{4}-/.test(iso)&&iso>="0001-01-01"?iso:""}
export function monthDays(year:number,month:number){
 const first=dateValue(year,month,1),weekday=new Date(first+"T12:00:00Z").getUTCDay();
 return Array.from({length:42},(_,i)=>shiftDate(first,i-weekday));
}
