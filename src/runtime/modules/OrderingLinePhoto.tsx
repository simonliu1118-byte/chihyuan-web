/**
 * 自訂中國貨: one photo per 叫貨 line (user 2026-11-11: some 客訂書 need a picture to compare). Small
 * JPEG (long side 1280px) is enough to read; it is deleted when the order is 結案 or 作廢. The image is
 * fetched with the session cookie, so photo URLs stay private; object URLs are revoked on unmount.
 */
import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {Dialog} from "../../ui/overlays/Dialog";
import {IconButton} from "../../ui/actions/IconButton";
import {Icons} from "../../ui/actions/icons";
import {useConfirmation} from "../../ui/overlays/useConfirmation";
import {resizeToJpeg} from "../../ui/forms/photo-upload";

const url=(orderId:number,lineId:number)=>"/api/business/ordering/orders/"+orderId+"/lines/"+lineId+"/photo";
async function failureOf(res:Response):Promise<Error>{
 const data=await res.json().catch(()=>null) as {error?:{message?:string}}|null;
 return new Error(data?.error?.message??"照片操作失敗");
}

export function OrderingLinePhoto({orderId,lineId,name,hasPhoto,canEdit,onChanged,onError}:{
 orderId:number;lineId:number;name:string;hasPhoto:boolean;canEdit:boolean;
 onChanged:(hasPhoto:boolean)=>void;onError:(message:string)=>void;
}){
 const [src,setSrc]=useState<string|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 const input=useRef<HTMLInputElement>(null);
 const {confirm,confirmationDialog}=useConfirmation();
 useEffect(()=>{
  if(!hasPhoto){setSrc(null);return}
  let active=true,made:string|null=null;
  void fetch(url(orderId,lineId),{credentials:"same-origin",cache:"no-store"}).then(async res=>{
   if(!res.ok)throw await failureOf(res);
   made=URL.createObjectURL(await res.blob());if(active)setSrc(made);else URL.revokeObjectURL(made);
  }).catch(e=>{if(active)onError(e instanceof Error?e.message:"照片載入失敗")});
  return()=>{active=false;if(made)URL.revokeObjectURL(made)};
 },[orderId,lineId,hasPhoto,version]);

 async function upload(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  setBusy(true);
  try{
   const jpeg=await resizeToJpeg(file,{maxSide:1280,quality:.72});
   if(jpeg.size>1048576)throw Error("照片過大，請重新拍攝");
   const res=await fetch(url(orderId,lineId),{method:"PUT",credentials:"same-origin",headers:{"content-type":"image/jpeg"},body:jpeg});
   if(!res.ok)throw await failureOf(res);
   setVersion(v=>v+1);onChanged(true);
  }catch(err){onError(err instanceof Error?err.message:"照片上傳失敗")}finally{setBusy(false)}
 }
 async function remove(){
  if(!await confirm({title:"刪除照片",description:"刪除「"+name+"」的照片？刪除後無法復原。",confirmLabel:"刪除",confirmTone:"danger"}))return;
  setBusy(true);
  try{
   const res=await fetch(url(orderId,lineId),{method:"DELETE",credentials:"same-origin"});
   if(!res.ok)throw await failureOf(res);
   setOpen(false);onChanged(false);
  }catch(err){onError(err instanceof Error?err.message:"照片刪除失敗")}finally{setBusy(false)}
 }
 const picker=<input ref={input} type="file" accept="image/*" hidden onChange={e=>void upload(e)}/>;
 if(!hasPhoto)return canEdit?<span className="cy-ordering-photo">{picker}
  <IconButton variant="table" icon={Icons.camera} label={"上傳「"+name+"」照片"} disabled={busy} onClick={()=>input.current?.click()}/></span>:null;
 return <span className="cy-ordering-photo">{picker}
  <button type="button" className="cy-ordering-photo-thumb" aria-label={"查看「"+name+"」照片"} title="查看照片" onClick={()=>setOpen(true)}>
   {src?<img src={src} alt=""/>:<span aria-hidden="true">…</span>}
  </button>
  <Dialog open={open} size="medium" className="cy-ordering-photo-dialog" title={name+" · 照片"} onClose={()=>setOpen(false)} footer={<>
   {canEdit?<button type="button" className="cy-op-button danger" disabled={busy} onClick={()=>void remove()}>刪除照片</button>:null}
   {canEdit?<button type="button" className="cy-op-button" disabled={busy} onClick={()=>input.current?.click()}>換一張</button>:null}
   <button type="button" className="cy-op-button primary" onClick={()=>setOpen(false)}>關閉</button></>}>
   {src?<img className="cy-ordering-photo-large" src={src} alt={name+" 照片"}/>:<p className="cy-op-empty">載入中…</p>}
   <p className="cy-ordering-photo-hint">叫貨單結案或作廢後，照片會自動刪除。</p>
  </Dialog>
  {confirmationDialog}
 </span>;
}
