import test from 'node:test';import assert from 'node:assert/strict';import{build}from'esbuild';
const r=await build({entryPoints:['shared/store-note.ts'],bundle:true,write:false,format:'esm',platform:'node'}),{wrapStoreNote}=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
test('notes wrap each fifteen characters, accept three lines and reject overflow without truncation',()=>{
 assert.equal(wrapStoreNote('甲'.repeat(16)),'甲'.repeat(15)+'\n甲');assert.equal(wrapStoreNote('甲'.repeat(45)),Array(3).fill('甲'.repeat(15)).join('\n'));assert.equal(wrapStoreNote('甲'.repeat(46)),null);assert.equal(wrapStoreNote('a\nb\nc'),'a\nb\nc');assert.equal(wrapStoreNote('a\nb\nc\nd'),null);assert.equal(wrapStoreNote('😀'.repeat(16)),'😀'.repeat(15)+'\n😀');
});

test('a 46-character paste cannot exploit the two formatting newlines of a valid 45-character note',async()=>{
 const compiled=await build({entryPoints:['src/runtime/modules/StoreNoteInput.tsx'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'note-host',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='react'?'export const useState=v=>[v,()=>{}];export const useRef=v=>({current:v});export const useEffect=()=>{};export const useLayoutEffect=()=>{};':'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'}))}}]});
 const {StoreNoteInput}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64')),changes=[];const input=StoreNoteInput({value:Array(3).fill('甲'.repeat(15)).join('\n'),onChange:v=>changes.push(v)});input.props.onChange({currentTarget:{value:'乙'.repeat(46)}});assert.equal(changes.length,0);
});

test('closure grace has a strict five-minute boundary and legacy closures stay locked',async()=>{
 const code=await build({entryPoints:['shared/store.ts'],bundle:true,write:false,format:'esm',platform:'node'}),{canAmendClosure,displayOrderItem}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
 const at=Date.parse('2026-11-01T00:00:00Z'),o={status:'PICKED_UP',closedAt:'2026-11-01T00:00:00Z'};assert.equal(canAmendClosure(o,at+299999),true);assert.equal(canAmendClosure(o,at+300000),false);assert.equal(canAmendClosure({...o,closedAt:null},at),false);assert.equal(canAmendClosure({...o,status:'CANCELLED'},at),false);assert.equal(canAmendClosure({...o,status:'NOTIFIED',callResult:'OUT_OF_STOCK'},at),true);
 assert.equal(displayOrderItem({itemName:'合成書',metadataMode:'BOOK',publisher:'出版社',author:''}),'合成書/出版社');assert.equal(displayOrderItem({itemName:'合成書',metadataMode:'BOOK',publisher:'',author:'作者'}),'合成書/作者');assert.equal(displayOrderItem({itemName:'合成品',metadataMode:'SPEC',specification:'規格'}),'合成品/規格');
});
