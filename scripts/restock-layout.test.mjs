import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';

// Exercise the actual presentation and add-dialog handlers with controlled React/transport boundaries.
const directory=mkdtempSync(fileURLToPath(new URL('../node_modules/.restock-layout-',import.meta.url)));
const outfile=join(directory,'page.mjs');
const stubs={
 'react':['useState','useMemo','useEffect'].map(n=>`export const ${n}=(...args)=>globalThis.restockHost.${n}(...args);`).join('\n'),
 '../../api/client':'export const apiRequest=(...args)=>globalThis.restockTransport(...args);',
 '../../ui/feedback/FeedbackProvider':`import{useState}from'react';export const FeedbackBanner=()=>null;export function useFeedbackMessage(v){const[a,b]=useState(v);return[a,b,b,'success']}`,
 '../../ui/overlays/useConfirmation':'export const useConfirmation=()=>({confirm:async()=>true,confirmationDialog:null});',
 '../../ui/foundation/useCompactLayout':'export const useCompactLayout=()=>globalThis.restockCompact;',
 '../../ui/data/DataViewToolbar':'export const DataViewToolbar=()=>null;',
 './ErpItemDialog':'export const ErpItemDialog=()=>null;',
};
for(const [path,names] of [
 ['../../ui/forms/Field',['Field','CheckField','FormSection']],['../../ui/forms/DateInput',['DateInput']],
 ['../../ui/overlays/Dialog',['Dialog']],['../../ui/actions/IconButton',['IconButton']],
])stubs[path]=names.map(n=>`export const ${n}=()=>null;`).join('\n');
let RestockAssist,RestockTable,AddToOrdering,OrderingSourceChips;
try{
 await build({entryPoints:[fileURLToPath(new URL('../src/runtime/modules/RestockAssist.tsx',import.meta.url))],outfile,bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins:[{name:'boundaries',setup(b){
  b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));
  b.onLoad({filter:/RestockAssist\.tsx$/},a=>({contents:readFileSync(a.path,'utf8')+'\nexport {RestockTable,AddToOrdering,OrderingSourceChips};',loader:'tsx'}));
  b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));
 }}]});
 ({RestockAssist,RestockTable,AddToOrdering,OrderingSourceChips}=await import(pathToFileURL(outfile)));
}finally{rmSync(directory,{recursive:true,force:true})}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)];
const text=n=>typeof n==='string'?n:Array.isArray(n)?n.map(text).join(''):text(n?.props?.children??'');
let active;
function mount(component,props){
 let cursor=0,dirty=true,tree,effects=[];const slots=[];
 const host={
  useState(value){const i=cursor++;slots[i]??={value:typeof value==='function'?value():value};return[slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v;dirty=true}]},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n]))slots[i]={deps,value:fn()};return slots[i].value},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>{slots[i].cleanup=fn()})}},
 };
 function render(){globalThis.restockHost=host;do{cursor=0;dirty=false;effects=[];tree=component(props);effects.forEach(f=>f())}while(dirty)}
 const view={render,get nodes(){return nodes(tree)},async tick(){for(let i=0;i<8;i++){await new Promise(r=>setImmediate(r));if(dirty)render()}},dispose(){slots.forEach(s=>s?.cleanup?.())}};
 render();active=view;return view;
}
test.afterEach(()=>{active?.dispose();active=null;for(const key of ['restockHost','restockTransport','restockCompact','localStorage'])delete globalThis[key]});
const item={itemCode:'QA001',itemName:'合成品名',unit:'盒',sold:'5',returned:'1',stock:'2',days:[{date:'2026-10-01',sold:'5',returned:'1'}]};
const result={id:'test',queryType:'RESTOCK',status:'DONE',dateFrom:'2026-10-01',dateTo:'2026-10-02',restock:[item]};
test('totals are the default; daily columns appear only after switching; add uses the shared icon',()=>{
 const props={from:result.dateFrom,to:result.dateTo,items:[item],canQueryItem:true,canOrdering:true,daily:false,onDailyChange:v=>props.daily=v,onAdded(){}};
 const view=mount(RestockTable,props);
 const headers=()=>view.nodes.filter(n=>n.type==='thead').flatMap(n=>nodes(n).filter(x=>x.type==='th')).map(text);
 assert.deepEqual(headers(),['品號／品名','銷貨','銷退','淨銷','庫存','叫貨']);
 const add=view.nodes.find(n=>n.type?.name==='IconButton');assert.equal(add.props.label,'加入叫貨單');assert.equal(add.props.variant,'table');
 view.nodes.find(n=>n.props?.label==='顯示每日明細').props.onChange({target:{checked:true}});view.render();
 assert.ok(headers().some(s=>s.startsWith('10/01')));assert.equal(headers().length,12);
});
test('daily preference survives reopening while the compact layout always uses totals',()=>{
 const saved=new Map;globalThis.localStorage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};globalThis.restockCompact=false;
 const props={job:{result,busy:false,submitting:false},canQueryItem:true,canOrdering:true};
 let view=mount(RestockAssist,props);const table=()=>view.nodes.find(n=>n.type===RestockTable);
 assert.equal(table().props.daily,false);table().props.onDailyChange(true);view.render();assert.equal(table().props.daily,true);
 view.dispose();view=mount(RestockAssist,props);assert.equal(table().props.daily,true);
 globalThis.restockCompact=true;view.render();assert.equal(table().props.daily,false);
});
test('add dialog still preselects the last source and only looks up holdings for the opened item; tags have no suggestions',async()=>{
 const sources=[{id:1,name:'合成公司',kind:'GENERAL',isActive:true,sortOrder:0},{id:2,name:'合成廠商',kind:'VENDOR',isActive:true,sortOrder:0}];
 const calls=[];globalThis.restockTransport=async path=>{calls.push(path);if(path.endsWith('/sources'))return sources;if(path.includes('/last-source'))return{source_id:2};if(path.endsWith('/preferences/vendors'))return[2];if(path.includes('/draft-items'))return[];return[]};
 const view=mount(AddToOrdering,{row:{...item,net:4},onClose(){},onAdded(){}});await view.tick();
 const tags=view.nodes.find(n=>n.type===OrderingSourceChips);assert.equal(tags.props.value,2);
 assert.deepEqual(calls.filter(p=>p.includes('/draft-items')),['/api/business/ordering/draft-items?itemCodes=QA001']);
 const chips=mount(OrderingSourceChips,{...tags.props,draftSourceIds:[2]});
 assert.equal(text(chips.nodes.find(n=>n.props?.className==='cy-source-chips')).includes('建議'),false);
 assert.deepEqual(chips.nodes.filter(n=>n.type==='button').map(text),['合成公司','合成廠商']);
 assert.equal(chips.nodes.find(n=>n.props?.['aria-label']==='有草稿')!==undefined,true);
 view.dispose();
});

test('duplicate-item chooser can cancel without writing, and keeps both add routes',async()=>{
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 const draft={id:5,sourceId:2,plannedSendDate:today,createdAt:today,status:'DRAFT'};
 const sources=[{id:2,name:'合成廠商',kind:'VENDOR',isActive:true,sortOrder:0}];
 const order={id:5,sourceId:2,sourceName:'合成廠商',plannedSendDate:today,version:3,lines:[{id:17,itemCode:'QA001',itemName:'合成品名',unit:'盒',section:'',quantity:4,quantityText:'4',sortOrder:1,closedAs:null}]};
 const calls=[];globalThis.restockTransport=async(path,options)=>{calls.push({path,options});
  if(path.endsWith('/sources'))return sources;
  if(path.includes('/last-source?'))return{source_id:2};
  if(path.endsWith('/preferences/vendors'))return[2];
  if(path.includes('/draft-items'))return[];
  if(path.includes('/orders?status=DRAFT')||path.includes('/orders?sourceId=2&status=DRAFT'))return[draft];
  if(path.endsWith('/orders/5'))return order;
  return{};
 };
 let added=0;const view=mount(AddToOrdering,{row:{...item,net:2},onClose(){},onAdded(){added++}});
 await view.tick();
 const form=view.nodes.find(n=>n.type==='form');
 assert.ok(form);
 await form.props.onSubmit({preventDefault(){}});
 await view.tick();
 const options=()=>view.nodes.filter(n=>n.type==='button').map(n=>({label:text(n),onClick:n.props.onClick}));
 assert.ok(options().some(x=>x.label==='新增一列'));
 assert.ok(options().some(x=>x.label==='加到既有列'));
 assert.equal(options().filter(x=>x.label==='取消').length,2);
 options().at(-3).onClick(); // duplicate chooser cancel; the outer form cancel is earlier
 await view.tick();
 assert.equal(calls.filter(x=>x.path.endsWith('/lines')).length,0);
 assert.equal(added,0);
 await view.nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 await view.tick();
 options().find(x=>x.label==='新增一列').onClick();
 await view.tick();
 const lineCalls=calls.filter(x=>x.path.endsWith('/lines'));
 assert.equal(lineCalls.length,1);
 assert.equal(lineCalls[0].options.json.lineId,undefined);
 assert.equal(added,1);
});
