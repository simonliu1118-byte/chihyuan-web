/** Mobile Excel handoff. Never share a URL or private order payload: share the generated XLSX File only. */
export const XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type FileShareHost={
 share?: (data:ShareData)=>Promise<void>;
 canShare?: (data:ShareData)=>boolean;
};

export function supportsFileShare(file:File,host:FileShareHost=navigator):boolean{
 if(typeof host.share!=="function")return false;
 try{return typeof host.canShare!=="function"||host.canShare({files:[file]})}
 catch{return false}
}

/** Download fallback (and unchanged desktop workflow). Let Safari consume the object URL before revoking. */
export function downloadExcelFile(file:File):void{
 const url=URL.createObjectURL(file);
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download=file.name;
 anchor.style.display="none";
 document.body.appendChild(anchor);
 try{anchor.click()}finally{
  anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}

/** Called directly from the button event, before any async save/flush.
 * Cancellation is not an error and must not unexpectedly download a copy.
 */
export async function shareExcelFile(
 file:File,
 fallback:(file:File)=>void,
 host:FileShareHost=navigator
):Promise<"shared"|"cancelled"|"downloaded">{
 if(!supportsFileShare(file,host)){fallback(file);return "downloaded"}
 try{
  // Call share synchronously while transient activation from the tap is still available.
  await host.share!({files:[file],title:file.name});
  return "shared";
 }catch(error){
  if(error instanceof Error&&error.name==="AbortError")return "cancelled";
  fallback(file);return "downloaded";
 }
}
