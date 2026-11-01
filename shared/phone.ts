import {digitsOnly} from "./digit-input";
export {digitOffset,digitCaret as phoneCaret,deleteDigit as deletePhoneDigit} from "./digit-input";
export type PhoneKind="phone"|"mobile"|"auto";
export const phoneDigits=digitsOnly;
/** Keep one contact in slot 1, and a domestic mobile ahead of a landline. */
export function normalizeStoreContacts(phone:string,mobile:string){const swap=/^09\d{8}$/.test(phone)&&!/^09\d{8}$/.test(mobile);return {mobile:!mobile?phone:swap?phone:mobile,phone:!mobile?"":swap?mobile:phone}}
// Taiwan domestic prefix/lengths: MODA public numbering plan, 2024, domestic allocation table.
// Unknown or incomplete fixed-line numbers stay as entered digits; no prefix is guessed.
export function formatPhone(value:string,kind:PhoneKind="phone"):string{
 const n=phoneDigits(value);
 if(kind==="mobile"||kind==="auto"&&/^09\d{8}$/.test(n))return /^09\d{8}$/.test(n)?`${n.slice(0,4)}-${n.slice(4,7)}-${n.slice(7)}`:n;
 const plans:[string,number][]=[["0826",5],["0827",5],["0836",5],["037",6],["049",7],["082",6],["089",6],["02",8],["03",7],["04",/^[23]/.test(n.slice(2))?8:7],["05",7],["06",7],["07",7],["08",7]];
 const p=plans.find(([area,len])=>n.startsWith(area)&&n.length===area.length+len);if(!p)return n;
 const [area]=p,local=n.slice(area.length);return `(${area})${local.slice(0,-4)}-${local.slice(-4)}`;
}
