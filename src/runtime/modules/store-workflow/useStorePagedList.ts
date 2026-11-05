import {useCallback,useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../../api/client';
import {useFeedbackMessage} from '../../../ui/feedback/FeedbackProvider';
type Page<T>={rows:T[];nextBefore:number|string|null};
/** Bounded keyset pages, debounced server search; no recurring polling or per-row fetch. */
export function useStorePagedList<T>(query:string,keyOf:(row:T)=>number|string){
 const [rows,setRows]=useState<T[]>([]),[cursor,setCursor]=useState<number|string|null>(null),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const [message,setMessage,reportError,tone]=useFeedbackMessage<string|null>(null),serial=useRef(0);
 const load=useCallback(async(more?:number|string)=>{const sequence=++serial.current;setLoading(true);try{const result=await apiRequest<Page<T>>(query+(more===undefined?'':(query.includes('?')?'&':'?')+'before='+encodeURIComponent(more)));if(sequence!==serial.current)return;setRows(old=>{const all=more===undefined?result.rows:[...old,...result.rows];return [...new Map(all.map(r=>[keyOf(r),r])).values()]});setCursor(result.nextBefore)}catch(e){if(sequence===serial.current)reportError(e instanceof Error?e.message:'載入失敗')}finally{if(sequence===serial.current){setLoading(false);setLoaded(true)}}},[query,reportError,keyOf]);
 useEffect(()=>{serial.current++;setRows([]);setCursor(null);setLoading(true);const timer=window.setTimeout(()=>void load(),200);return()=>{clearTimeout(timer);serial.current++}},[load]);
 return {rows,setRows,cursor,loading,loaded,load,message,setMessage,reportError,tone};
}
