export const STORE_NOTE_COLUMNS=15,STORE_NOTE_LINES=3;
/** Explicit wraps are stored so the same 15-character lines survive reopening. */
export function wrapStoreNote(value:string):string|null{
 const rows=value.replace(/\r\n?/g,"\n").split("\n").flatMap(row=>{const chars=Array.from(row);return chars.length?Array.from({length:Math.ceil(chars.length/STORE_NOTE_COLUMNS)},(_,i)=>chars.slice(i*STORE_NOTE_COLUMNS,(i+1)*STORE_NOTE_COLUMNS).join("")):[""]});
 return rows.length<=STORE_NOTE_LINES?rows.join("\n"):null;
}
