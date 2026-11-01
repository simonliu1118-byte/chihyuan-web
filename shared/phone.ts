import {digitsOnly} from "./digit-input";
export {digitOffset,digitCaret as phoneCaret,deleteDigit as deletePhoneDigit} from "./digit-input";
export type PhoneKind="phone"|"mobile";
export const phoneDigits=digitsOnly;
// Taiwan domestic prefix/lengths: MODA public numbering plan, 2024, domestic allocation table.
// Unknown or incomplete fixed-line numbers stay as entered digits; no prefix is guessed.
export function formatPhone(value:string,kind:PhoneKind="phone"):string{
 const n=phoneDigits(value);
 if(kind==="mobile")return /^09\d{8}$/.test(n)?`${n.slice(0,4)}-${n.slice(4,7)}-${n.slice(7)}`:n;
 const plans:[string,number][]=[["0826",5],["0827",5],["0836",5],["037",6],["049",7],["082",6],["089",6],["02",8],["03",7],["04",/^[23]/.test(n.slice(2))?8:7],["05",7],["06",7],["07",7],["08",7]];
 const p=plans.find(([area,len])=>n.startsWith(area)&&n.length===area.length+len);if(!p)return n;
 const [area]=p,local=n.slice(area.length);return `(${area})${local.slice(0,-4)}-${local.slice(-4)}`;
}
