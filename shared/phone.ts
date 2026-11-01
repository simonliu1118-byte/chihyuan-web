export type PhoneKind="phone"|"mobile";
export const phoneDigits=(value:string)=>value.normalize("NFKC").replace(/\D/g,"");
// Taiwan domestic prefix/lengths: MODA public numbering plan, 2024, domestic allocation table.
// Unknown or incomplete fixed-line numbers stay as entered digits; no prefix is guessed.
export function formatPhone(value:string,kind:PhoneKind="phone"):string{
 const n=phoneDigits(value);
 if(kind==="mobile")return /^09\d{8}$/.test(n)?`${n.slice(0,4)}-${n.slice(4,7)}-${n.slice(7)}`:n;
 const plans:[string,number][]=[["0826",5],["0827",5],["0836",5],["037",6],["049",7],["082",6],["089",6],["02",8],["03",7],["04",/^[23]/.test(n.slice(2))?8:7],["05",7],["06",7],["07",7],["08",7]];
 const p=plans.find(([area,len])=>n.startsWith(area)&&n.length===area.length+len);if(!p)return n;
 const [area]=p,local=n.slice(area.length);return `(${area})${local.slice(0,-4)}-${local.slice(-4)}`;
}
export const digitOffset=(text:string,position:number)=>phoneDigits(text.slice(0,position)).length;
export function phoneCaret(display:string,offset:number){if(offset<=0)return display.search(/\d/)<0?0:display.search(/\d/);let count=0;for(let i=0;i<display.length;i++)if(/\d/.test(display[i])&&++count===offset)return i+1;return display.length}
export function deletePhoneDigit(value:string,start:number,end:number,backspace:boolean){
 const digits=phoneDigits(value),from=digitOffset(value,start),to=digitOffset(value,end);
 const a=start!==end?from:backspace?Math.max(0,from-1):from,b=start!==end?to:backspace?from:Math.min(digits.length,from+1);
 return {value:digits.slice(0,a)+digits.slice(b),caret:a};
}
