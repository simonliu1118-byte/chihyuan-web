import {useEffect,useRef,useState,type ChangeEvent} from "react";
import {Dialog} from "../../ui/overlays/Dialog";
import {Loading} from "../../ui/feedback/Loading";
import {IconButton} from "../../ui/actions/IconButton";
import {Icons} from "../../ui/actions/icons";
import {resizeToJpeg} from "../../ui/forms/photo-upload";
export interface RepairPhoto{id:number;bytes:number;width:number;height:number;createdAt:string}
const base=(id:number)=>"/api/business/store/repairs/"+id+"/photos";
async function responseError(res:Response):Promise<Error>{
 const data=await res.json().catch(()=>null) as {error?:{message?:string}}|null;
 return new Error(data?.error?.message??"照片操作失敗");
}
/** Authenticated image fetch keeps photo URLs private and revokes every object URL on close. */
export function StoreRepairPhotos({repairId,onClose,onCountChanged}:{repairId:number;onClose:()=>void;onCountChanged:(count:number)=>void}){
 const notify=useRef(onCountChanged);notify.current=onCountChanged;
 const [photos,setPhotos]=useState<RepairPhoto[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[selected,setSelected]=useState<number|null>(null),[urls,setUrls]=useState<Record<number,string>>({});
 useEffect(()=>{
  let active=true;
  void (async()=>{try{
   const res=await fetch(base(repairId),{credentials:"same-origin",cache:"no-store"});if(!res.ok)throw await responseError(res);
   const payload=await res.json() as {data:RepairPhoto[]};if(active){setPhotos(payload.data);notify.current(payload.data.length)}
  }catch(e){if(active)setError(e instanceof Error?e.message:"無法載入照片")}finally{if(active)setLoading(false)}})();
  return()=>{active=false};
 },[repairId]);
 useEffect(()=>{
  let active=true;const created:string[]=[];
  setUrls({});
  void Promise.all(photos.map(async photo=>{
   const res=await fetch(base(repairId)+"/"+photo.id,{credentials:"same-origin",cache:"no-store"});
   if(!res.ok)throw await responseError(res);
   const url=URL.createObjectURL(await res.blob());created.push(url);
   if(active)setUrls(old=>({...old,[photo.id]:url}));
   else URL.revokeObjectURL(url);
  })).catch(e=>{if(active)setError(e instanceof Error?e.message:"照片載入失敗")});
  return()=>{active=false;created.forEach(URL.revokeObjectURL)};
 },[repairId,photos]);
 async function upload(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value="";if(!file)return;
  setBusy(true);setError("");
  try{
   if(photos.length>=5)throw Error("每張維修單最多五張照片");
   const jpeg=await resizeToJpeg(file,{maxSide:1600,quality:.8,grayscale:false});
   if(jpeg.size>1048576)throw Error("照片過大，請重新拍攝");
   const res=await fetch(base(repairId),{method:"POST",credentials:"same-origin",headers:{"content-type":"image/jpeg"},body:jpeg});
   if(!res.ok)throw await responseError(res);
   const list=await fetch(base(repairId),{credentials:"same-origin",cache:"no-store"});
   if(!list.ok)throw await responseError(list);
   const data=await list.json() as {data:RepairPhoto[]};setPhotos(data.data);notify.current(data.data.length);
  }catch(e){setError(e instanceof Error?e.message:"照片上傳失敗")}finally{setBusy(false)}
 }
 async function remove(photoId:number){
  setBusy(true);setError("");
  try{
   const res=await fetch(base(repairId)+"/"+photoId,{method:"DELETE",credentials:"same-origin"});
   if(!res.ok)throw await responseError(res);
   setPhotos(old=>{const remaining=old.filter(p=>p.id!==photoId);notify.current(remaining.length);return remaining});
   setSelected(v=>v===photoId?null:v);
  }catch(e){setError(e instanceof Error?e.message:"照片刪除失敗")}finally{setBusy(false)}
 }
 return <Dialog open title="維修單照片" size="large" onClose={onClose}>
  {error?<p role="alert" className="cy-notice cy-notice-danger">{error}</p>:null}
  {loading?<Loading/>:<div className="cy-repair-photo-grid">{photos.map(p=><div key={p.id} className="cy-repair-photo-item">
   {urls[p.id]?<button type="button" className="cy-repair-photo-thumb" onClick={()=>setSelected(p.id)} aria-label={"放大照片 "+p.id}><img src={urls[p.id]} alt={"維修單照片 "+p.id}/></button>:<Loading inline/>}
   <IconButton variant="table" icon={Icons.remove} label={"刪除照片 "+p.id} disabled={busy} onClick={()=>void remove(p.id)}/>
  </div>)}</div>}
  <p>{photos.length}／5 張</p>
  <label className="cy-op-button cy-repair-photo-upload">上傳照片<input type="file" accept="image/*" capture="environment" disabled={busy||loading||photos.length>=5} onChange={e=>void upload(e)}/></label>
  {selected!==null&&urls[selected]?<div className="cy-repair-photo-large"><button type="button" className="cy-op-button" onClick={()=>setSelected(null)}>返回縮圖</button><img src={urls[selected]} alt="放大的維修單照片"/></div>:null}
 </Dialog>;
}
