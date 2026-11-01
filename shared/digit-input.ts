export const digitsOnly=(value:string)=>value.normalize("NFKC").replace(/\D/g,"");
export const digitOffset=(text:string,position:number)=>digitsOnly(text.slice(0,position)).length;
export function digitCaret(display:string,offset:number){if(offset<=0)return display.search(/\d/)<0?0:display.search(/\d/);let count=0;for(let i=0;i<display.length;i++)if(/\d/.test(display[i])&&++count===offset)return i+1;return display.length}
export function deleteDigit(value:string,start:number,end:number,backspace:boolean){
 const digits=digitsOnly(value),from=digitOffset(value,start),to=digitOffset(value,end);
 const a=start!==end?from:backspace?Math.max(0,from-1):from,b=start!==end?to:backspace?from:Math.min(digits.length,from+1);
 return {value:digits.slice(0,a)+digits.slice(b),caret:a};
}
