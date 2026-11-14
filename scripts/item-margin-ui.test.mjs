import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const folder=mkdtempSync('node_modules/.margin-ui-');
const stubs={
 react:'export const cloneElement=(node,props)=>({...node,props:{...node.props,...props}});export const isValidElement=node=>!!node?.props;export const useState=(...a)=>globalThis.marginHost.useState(...a);export const useEffect=(...a)=>globalThis.marginHost.useEffect(...a);',
 '../../api/item-runtime-client':'export const loadItemMargin=(...a)=>globalThis.marginLoad(...a);',
 '../../../ui/feedback/FeedbackProvider':'export const FeedbackBanner=()=>null;export const useFeedbackMessage=()=>[null,()=>{},()=>{},"danger"];',
};
let ItemMarginPanel,ItemSheet;
try{
 await build({entryPoints:['src/runtime/modules/item/ItemMarginPanel.tsx','src/runtime/modules/item/ItemSheet.tsx'],outdir:folder,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},packages:'external',loader:{'.css':'empty'},plugins:[{name:'margin-ui-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}]});
 ({ItemMarginPanel}=await import(pathToFileURL(process.cwd()+'/'+folder+'/ItemMarginPanel.mjs')));
 ({ItemSheet}=await import(pathToFileURL(process.cwd()+'/'+folder+'/ItemSheet.mjs')));
}finally{rmSync(folder,{recursive:true,force:true})}
const walk=n=>Array.isArray(n)?n.flatMap(walk):!n||typeof n!=='object'?[]:[n,...walk(n.props?.children)];
const result=(id,revision=1)=>({itemId:id,revision,baseUnit:'個',originalCost:'100',costTaxMode:'exclusive',payment:'105.00',inputTax:'5.00',netCost:'100.00',costStatus:null,rows:[]});

test('saved-item panel ignores late results after item/revision changes and never offers price inputs',async()=>{
 let cursor=0,slots=[],effects=[],tree;const requests=[];
 globalThis.marginLoad=(id)=>new Promise(resolve=>requests.push({id,resolve}));
 globalThis.marginHost={useState(initial){const i=cursor++;slots[i]??={value:initial};return[slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next}]},useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,n)=>v!==slots[i].deps[n])){slots[i]?.cleanup?.();slots[i]={deps};effects.push(()=>slots[i].cleanup=fn());}}};
 const render=(id,revision=1)=>{cursor=0;effects=[];tree=ItemMarginPanel({itemId:id,revision,onEdit:()=>{}});effects.forEach(f=>f());return tree};
 try{
 render(1);render(2);requests[1].resolve({...result(2),netCost:"150.00"});await new Promise(setImmediate);render(2);
 requests[0].resolve(result(1));await new Promise(setImmediate);render(2);
 let sheet=walk(tree).find(n=>n.props.label==='毛利成本摘要');assert.ok(sheet);assert.equal(sheet.props.rows[1].cells[2].view,"$150.00");assert.equal(walk(tree).filter(n=>['input','select','textarea'].includes(n.type)).length,0);
 assert.equal(requests.length,2);render(2,2);assert.equal(requests.length,3);requests[2].resolve({...result(2,2),netCost:'200.00'});await new Promise(setImmediate);render(2,2);
 sheet=walk(tree).find(n=>n.props.label==='毛利成本摘要');assert.equal(sheet.props.rows[1].cells[2].view,'$200.00');
 }finally{slots.forEach(s=>s?.cleanup?.());delete globalThis.marginHost;delete globalThis.marginLoad;}
});

test('master tax field has three explicit choices, required and no default; pending is only a placeholder',()=>{
 const draft={itemNo:'TEST',name:'合成',baseUnit:'個',cost:'100',costTaxMode:null,unitConversions:[],wholesalePrices:[],onlinePrices:[]};
 const sheet=ItemSheet({item:null,draft,editing:true,creating:true,busy:false,canViewCost:true,categories:[],platforms:[],onPatch:()=>{},onAddConversion:()=>{},onUpdateConversion:()=>{}});
 const cell=sheet.props.rows.flatMap(row=>row.cells).find(cell=>cell.label==='成本稅別');
 assert.equal(cell.required,true);assert.equal(cell.edit.props.value,'');
 const options=walk(cell.edit).filter(n=>n.type==='option');assert.deepEqual(options.map(n=>n.props.value),['','inclusive','exclusive','no_tax']);assert.equal(options[0].props.disabled,true);
 assert.deepEqual(options.slice(1).map(n=>n.props.children),['含稅','未稅（外加）','不計稅']);
});

test('without cost permission both master cells are blank, not editable or marked as pending',()=>{
 const item={itemNo:'TEST',name:'合成',baseUnit:'個',cost:'987.65',costTaxMode:'exclusive',unitConversions:[],wholesalePrices:[],onlinePrices:[]};
 for (const editing of [false,true]) {
  const sheet=ItemSheet({item,draft:item,editing,creating:false,busy:false,canViewCost:false,categories:[],platforms:[],onPatch:()=>{},onAddConversion:()=>{},onUpdateConversion:()=>{}});
  for(const name of ['成本','成本稅別']) {
   const cell=sheet.props.rows.flatMap(row=>row.cells).find(cell=>cell.label===name);
   assert.equal(cell.view.type,'span');assert.equal(cell.view.props.children,undefined);assert.equal(cell.edit,undefined);assert.ok(!cell.required);
  }
 }
});
