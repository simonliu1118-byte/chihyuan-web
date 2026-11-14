import {useEffect,useMemo,useRef} from 'react';
/** Query identity changes immediately invalidate old responses, including stale errors/finally. */
export function useLatestRequest(key:unknown){
 const state=useRef({key,serial:0,mounted:true});if(!Object.is(state.current.key,key)){state.current.key=key;state.current.serial++}
 useEffect(()=>{state.current.mounted=true;return()=>{state.current.mounted=false;state.current.serial++}},[]);
 return useMemo(()=>({
  begin(){const s=state.current,serial=++s.serial,key=s.key;return {current:()=>state.current.mounted&&state.current.serial===serial&&Object.is(state.current.key,key)}},
  invalidate(){state.current.serial++},
 }),[]);
}
