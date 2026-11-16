import type {BotReviewImageView} from "../../../shared/bot-center";
import {reviewImageUrl,deliveryImageUrl} from "../api/bot-center-client";
export function BotImages({images,onOpen}:{images:(BotReviewImageView & {deliveryImage?:boolean})[];onOpen:(image:BotReviewImageView & {deliveryImage?:boolean})=>void}){
 if(!images.length)return null;
 return <div className="cy-bot-images">{images.map(image=><button key={(image.deliveryImage?"delivery-":"review-")+image.id} type="button" className="cy-bot-thumb" aria-label="放大圖片" onClick={()=>onOpen(image)}>
  <img src={image.deliveryImage?deliveryImageUrl(image.id):reviewImageUrl(image.id)} alt="" loading="lazy"/></button>)}</div>;
}

