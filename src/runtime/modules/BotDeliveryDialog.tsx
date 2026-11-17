import {useEffect,useState} from "react";
import type {BotDeliveryDetail} from "../../../shared/bot-center";
import {loadDelivery,deliveryImageUrl,reviewImageUrl} from "../api/bot-center-client";
import {Dialog} from "../../ui/overlays/Dialog";
import {Loading} from "../../ui/feedback/Loading";
import {formatDateTime} from "../../ui/foundation/format";
import {BotImages} from "./BotImages";
import {BotText} from "./BotText";

/** Published content uses the same safe text, image viewer and dialog as review. No review actions. */
export function BotDeliveryDialog({id,onClose}:{id:number;onClose:()=>void}){
 const [detail,setDetail]=useState<BotDeliveryDetail|null>(null),[error,setError]=useState("");
 const [zoom,setZoom]=useState<string|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setDetail(null);setError("");void loadDelivery(id).then(next=>{if(active)setDetail(next)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"無法載入發布內容")});return()=>{active=false}},[id,retry]);
 return <Dialog open size="large" title={detail?.item.title??"發布內容"} dismissible={false} showCloseButton={false} onClose={onClose}
  footer={<button type="button" className="cy-op-button" onClick={onClose}>關閉</button>}>
  {error?<p role="alert">{error}<button type="button" className="cy-op-button compact" onClick={()=>setRetry(n=>n+1)}>重試</button></p>:!detail?<Loading/>:<>
   <div className="cy-bot-review-meta"><span>{detail.item.platform}</span><time>{formatDateTime(detail.item.sentAt)}</time><span>{({cyweb:"CYWEB 核准",chat:"Chat 核准",line:"LINE 核准",other:"外部核准"})[detail.item.approvalSource]}</span></div>
   <BotText text={detail.item.body}/>
   {detail.item.url?<a href={detail.item.url} target="_blank" rel="noopener noreferrer">查看原文</a>:null}
   <BotImages images={detail.images} onOpen={image=>setZoom(image.deliveryImage?deliveryImageUrl(image.id):reviewImageUrl(image.id))}/>
  </>}
  {zoom?<Dialog open size="large" title="圖片" dismissible={false} showCloseButton={false} onClose={()=>setZoom(null)} footer={<button type="button" className="cy-op-button" onClick={()=>setZoom(null)}>關閉</button>}><img className="cy-bot-zoom" src={zoom} alt="發布圖片"/></Dialog>:null}
 </Dialog>;
}
