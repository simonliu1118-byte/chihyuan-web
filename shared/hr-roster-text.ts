export type RosterTextKind="note"|"rule";
export type RosterTextDefault={id:number;kind:RosterTextKind;text:string;storeIds:number[]};
export type RosterNoteItem={prefix:string|null;text:string};
export const MAX_ROSTER_NOTES=6;
export const MAX_ROSTER_NOTE_LENGTH=200;
export function readRosterJson<T>(value:unknown,fallback:T):T{try{return typeof value==="string"?JSON.parse(value) as T:fallback}catch{return fallback}}
