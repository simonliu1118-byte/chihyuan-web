/** Shared strict JPEG validation and R2 -> D1/Audit transaction with R2 compensation on failure. */
export class JpegUploadError extends Error{}
export function jpegSize(bytes:Uint8Array):{width:number;height:number}{
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)throw new JpegUploadError("圖片不是有效 JPEG");
 let i=2;
 while(i+9<bytes.length){
  if(bytes[i]!==0xff)break;
  const marker=bytes[i+1],length=bytes[i+2]*256+bytes[i+3];
  if(length<2||i+2+length>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3].includes(marker)){
   const height=bytes[i+5]*256+bytes[i+6],width=bytes[i+7]*256+bytes[i+8];
   if(width>0&&height>0)return {width,height};
  }
  i+=2+length;
 }
 throw new JpegUploadError("無法讀取 JPEG 尺寸");
}
export function inspectJpeg(bytes:Uint8Array,contentType:string|null,maxBytes:number,maxSide=2000){
 if(bytes.length===0||bytes.length>maxBytes||!/^image\/jpeg(?:;|$)/i.test(contentType??""))throw new JpegUploadError("只接受符合大小限制的 JPEG");
 const size=jpegSize(bytes);
 if(Math.max(size.width,size.height)>maxSide)throw new JpegUploadError("圖片長邊不可超過 "+maxSide+"px");
 return size;
}
export async function putJpegWithRecords(bucket:R2Bucket,db:D1Database,key:string,bytes:Uint8Array,records:D1PreparedStatement[]){
 await bucket.put(key,bytes,{httpMetadata:{contentType:"image/jpeg"}});
 try{await db.batch(records)}catch(error){await bucket.delete(key);throw error}
}
