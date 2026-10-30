/** V0.9.52 stocktake quantities use integer ten-thousandths, never binary floats. */
export const STOCKTAKE_STATUSES = ["IGNORED","COUNTING","RECOUNTING","WRITING","WRITE_FAILED","ERP_CONFIRMED"] as const;
export type StocktakeStatus = typeof STOCKTAKE_STATUSES[number];
export const STOCKTAKE_LABELS: Record<StocktakeStatus,string> = {
  IGNORED:"忽略",COUNTING:"初盤中",RECOUNTING:"複盤中",
  WRITING:"寫回 ERP 中",WRITE_FAILED:"寫回失敗",ERP_CONFIRMED:"ERP 已確認",
};
export type StocktakeLine = {
  sheetNo:string;lineKey:string;seq:string|null;itemCode:string;itemName:string;spec:string;
  warehouseName:string;location:string;unit:string;batch:string;isAdded:boolean;erpSeq:string|null;
  bookQty?:string;firstQty:string|null;firstBy:number|null;firstAt:string|null;
  recountQty:string|null;recountBy:number|null;recountAt:string|null;
  firstByName?:string|null;recountByName?:string|null;locked:boolean;version:number;
};
export type StocktakeSheet = {
  sheetNo:string;sheetDate:string|null;status:StocktakeStatus;version:number;
  detailReadAt:string|null;firstConfirmedAt:string|null;secondConfirmedAt:string|null;
  erpConfirmedAt:string|null;writeQueryId:string|null;writeResult:unknown;
  total:number;counted:number;recountNeeded:number;
};
/** WEB count cells are independent of ERP rows; book quantities belong to parent source rows only. */
export type StocktakeLocationCount = {
 id:number;sheetNo:string;sourceLineKey:string;warehouseName:string;locationCode:string;erpLocationCode:string;
 manualVerifiedAt:string|null;manualVerifiedBy:number|null;
 firstQty:string|null;firstBy:number|null;firstAt:string|null;
 recountQty:string|null;recountBy:number|null;recountAt:string|null;
 firstByName?:string|null;recountByName?:string|null;version:number;rev:number;
};
export type StocktakeDetail = {sheet:StocktakeSheet;lines:StocktakeLine[];
 locationCounts:StocktakeLocationCount[]};
export type StocktakeWriteRow = {key:string;seq:string|null;itemCode:string;batch:string;quantity:string};
export const STOCKTAKE_NO = /^[A-Za-z0-9]{1,20}$/;
export const STOCKTAKE_SEQ = /^[0-9]{5}$/;
export const STOCKTAKE_MAX_ROWS = 3000;
const DECIMAL=/^-?(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,4})?$/;
export function parseStocktakeQuantity(v:unknown): bigint {
  if(typeof v!=="string"||!DECIMAL.test(v))throw Error("STOCKTAKE_QUANTITY_INVALID");
  const [whole,decimal=""]=v.split(".");
  const signed=whole.startsWith("-")?-1n:1n;
  const raw=(BigInt(whole.replace("-",""))*10000n+BigInt((decimal+"0000").slice(0,4)))*signed;
  if(raw>=10000000000000n||raw<=-10000000000000n)throw Error("STOCKTAKE_QUANTITY_INVALID");
  return raw;
}
export function decimalStocktake(n:bigint):string {
  const abs=n<0n?-n:n;
  return (n<0n?"-":"")+(abs/10000n).toString()+
    (abs%10000n?". "+String(abs%10000n).padStart(4,"0").replace(/0+$/,""):"").replace(". ",".");
}
export function stocktakeItemTotals(lines:readonly StocktakeLine[]):Map<string,{book:bigint;counted:bigint}>{
  const map=new Map<string,{book:bigint;counted:bigint}>();
  for(const line of lines){
    const prev=map.get(line.itemCode)??{book:0n,counted:0n};
    prev.book+=parseStocktakeQuantity(line.bookQty??"0");
    if(line.firstQty===null)throw Error("STOCKTAKE_INCOMPLETE");
    prev.counted+=parseStocktakeQuantity(line.firstQty);
    map.set(line.itemCode,prev);
  }
  return map;
}
export function stocktakeWriteRows(lines:readonly StocktakeLine[]):StocktakeWriteRow[]{
  return lines.filter(l=>l.isAdded||parseStocktakeQuantity(l.recountQty??l.firstQty??"0")!==parseStocktakeQuantity(l.bookQty??"0"))
    .map(l=>({key:l.lineKey,seq:l.isAdded?null:l.seq,itemCode:l.itemCode,batch:l.batch,
      quantity:l.recountQty??l.firstQty??"0"}));
}
/** Each ERP sequence is counted once. Sum cells only when all locations are filled. */
export function stocktakeAggregateLines(lines:readonly StocktakeLine[],counts:readonly StocktakeLocationCount[]):StocktakeLine[]{
 const byKey=new Map<string,StocktakeLocationCount[]>();
 for(const cell of counts){
  const rows=byKey.get(cell.sourceLineKey)??[];
  rows.push(cell);byKey.set(cell.sourceLineKey,rows);
 }
 function total(cells:StocktakeLocationCount[],field:"firstQty"|"recountQty"):string|null{
  if(!cells.length||cells.some(c=>c[field]===null))return null;
  return decimalStocktake(cells.reduce((sum,c)=>sum+parseStocktakeQuantity(c[field]!),0n));
 }
 return lines.map(line=>{
  const cells=byKey.get(line.lineKey)??[];
  return {...line,firstQty:total(cells,"firstQty"),recountQty:total(cells,"recountQty")};
 });
}
/** Completion is per location cell, never per ERP seq or per React card. */
export function stocktakeCountProgress(cells:readonly StocktakeLocationCount[],phase:"firstQty"|"recountQty",lockedKeys?:ReadonlySet<string>){
 const required=lockedKeys?cells.filter(c=>!lockedKeys.has(c.sourceLineKey)):cells;
 return {total:required.length,filled:required.filter(c=>c[phase]!==null).length};
}
/** Strict four-digit locations, with empty location represented by one blank count cell. */
export function stocktakeLocations(source:string):string[]{
 if(source.trim()==="")return [""];
 const locations=source.split(";").map(x=>x.trim());
 if(locations.some(x=>!/^[0-9]{4}$/.test(x))||new Set(locations).size!==locations.length)
  throw Error("STOCKTAKE_LOCATION_INVALID");
 return locations;
}
/** Strict ERP bridge payload contracts; sheet/date/qty are always strings. */
export type StocktakeSyncRow = {seq:string;itemCode:string;itemName:string;spec:string;
  warehouseName:string;location:string;unit:string;batch:string;bookQty:string};
export type StocktakeSyncResult = {outcome:"FOUND"|"NOT_FOUND"|"FAILED";sheets:{sheetNo:string;date:string}[];
  details:{sheetNo:string;rows:StocktakeSyncRow[]}[]};
export type StocktakeWriteResult = {outcome:"FOUND"|"FAILED";sheetNo:string;
  results:{key:string;ok:boolean;erpSeq:string|null;message:string}[];
  confirmed:boolean;mismatches:{key:string;seq:string|null;itemCode:string;batch:string;expected:string;actual:string}[]};
