import {useEffect,useRef,useState} from "react";

/**
 * 身分證字號就地顯示（人事資料表與「我的資料」共用）：平常隱碼；按「顯示」在同一格顯示完整號碼，
 * 按鈕變「隱藏」並提示 10 秒後自動隱藏。按隱藏、時間到、離開頁面或換員工（resetKey 改變）都回到隱碼，
 * 並把完整號碼從狀態清除。不跳視窗；按鈕寬度固定，避免版面跳動。取號方式由呼叫端的 load 決定。
 */
export const NATIONAL_ID_REVEAL_SECONDS=10;
export function NationalIdReveal({masked,resetKey,load,seconds=NATIONAL_ID_REVEAL_SECONDS}:{
 masked:string|null;resetKey:string|number;load:()=>Promise<string|null>;seconds?:number;
}){
 const [full,setFull]=useState<string|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
 const ticket=useRef(0);
 // Switching employee or leaving the page drops the revealed value and any request still in flight.
 useEffect(()=>{setFull(null);setLoading(false);setFailed(false);return()=>{ticket.current++;};},[resetKey]);
 useEffect(()=>{
  if(full===null)return;
  const timer=setTimeout(()=>setFull(null),seconds*1000);
  return()=>clearTimeout(timer);
 },[full,seconds]);
 if(!masked)return <span>—</span>;
 const hide=()=>{ticket.current++;setFull(null);setLoading(false);};
 const show=async()=>{
  const mine=++ticket.current;setLoading(true);setFailed(false);
  try{const value=await load();if(ticket.current===mine)setFull(value??"未填寫");}
  catch{if(ticket.current===mine)setFailed(true);}
  finally{if(ticket.current===mine)setLoading(false);}
 };
 const open=full!==null;
 return <span className="cy-id-reveal">
  <span className="cy-id-reveal-main">
   <span className="cy-id-reveal-value">{open?full:masked}</span>
   <button type="button" className="cy-op-button mini soft cy-id-reveal-btn" disabled={loading} aria-label={open?"隱藏身分證字號":"顯示身分證字號"}
    onClick={open?hide:()=>void show()}>{open?"隱藏":"顯示"}</button>
  </span>
  {open?<small className="cy-id-reveal-hint">{seconds} 秒後自動隱藏</small>:failed?<small className="cy-id-reveal-hint danger" role="alert">無法顯示，請重試</small>:null}
 </span>;
}
