/** Resize one photographed document before transfer. Preserve colour by default. */
export async function resizeToJpeg(file:File,{maxSide=1600,quality=0.8,grayscale=false}:{maxSide?:number;quality?:number;grayscale?:boolean}={}):Promise<Blob>{
 const image=await createImageBitmap(file);
 try{
  const ratio=Math.min(1,maxSide/Math.max(image.width,image.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("無法處理照片");
  ctx.drawImage(image,0,0,canvas.width,canvas.height);
  if(grayscale){
   const data=ctx.getImageData(0,0,canvas.width,canvas.height);
   for(let i=0;i<data.data.length;i+=4){const v=Math.round(.299*data.data[i]+.587*data.data[i+1]+.114*data.data[i+2]);data.data[i]=v;data.data[i+1]=v;data.data[i+2]=v}
   ctx.putImageData(data,0,0);
  }
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("照片轉換失敗")),"image/jpeg",quality));
 }finally{image.close()}
}
