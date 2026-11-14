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
let ItemMarginPanel,ItemSheet,OnlineMarginTables;
try{
 await build({entryPoints:['src/runtime/modules/item/ItemMarginPanel.tsx','src/runtime/modules/item/ItemSheet.tsx','src/runtime/modules/item/OnlineMarginTables.tsx'],outdir:folder,bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},packages:'external',loader:{'.css':'empty'},plugins:[{name:'margin-ui-boundaries',setup(b){b.onResolve({filter:/.*/},a=>a.path in stubs?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}]});
 ({ItemMarginPanel}=await import(pathToFileURL(process.cwd()+'/'+folder+'/ItemMarginPanel.mjs')));
 ({ItemSheet}=await import(pathToFileURL(process.cwd()+'/'+folder+'/ItemSheet.mjs')));
 ({OnlineMarginTables}=await import(pathToFileURL(process.cwd()+'/'+folder+'/OnlineMarginTables.mjs')));
}finally{rmSync(folder,{recursive:true,force:true})}
const walk=n=>Array.isArray(n)?n.flatMap(walk):!n||typeof n!=='object'?[]:[n,...walk(n.props?.children)];
const result=(id,revision=1)=>({itemId:id,revision,baseUnit:'個',originalCost:'100',costTaxMode:'exclusive',payment:'105.00',inputTax:'5.00',netCost:'100.00',costStatus:null,rows:[]});

test('margin panel renders the parent saved-item response without another transport or editable inputs',()=>{
 globalThis.marginLoad=()=>{throw Error('duplicate product read')};
 try {
  const tree=ItemMarginPanel({result:{...result(2,2),netCost:'150.00'},onEdit:()=>{}});
  const sheet=walk(tree).find(n=>n.props.label==='毛利成本摘要');
  assert.equal(sheet.props.rows[1].cells[2].view,'$150.00');
  assert.equal(walk(tree).filter(n=>['input','select','textarea'].includes(n.type)).length,0);
 } finally {delete globalThis.marginLoad;}
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

test('comparison is one matrix; collapsed tiers aggregate all coupons and expanded rows label both minima/maxima',()=>{
 let expanded=false;globalThis.marginHost={useState:()=>[expanded,next=>{expanded=next(expanded)}]};
 const point=(n)=>({coupon:'合成券',orderAmount:'600',discountRatio:'3.33',itemDiscount:'10.00',theoretical:false,result:{netSales:'200.00',contributionAmount:n,contributionMarginPercent:'50.00',negative:false}});
 const range={quantity:2,discount:'9.9',minimum:point('100.00'),maximum:point('120.00'),coupons:[{name:'600折20',minimum:point('100.00'),maximum:point('120.00')},{name:'800折25',minimum:point('105.00'),maximum:point('115.00')}]};
 const p={platformId:1,name:'合成平台',price:'300',status:null,basic:point('130.00').result,activity:point('120.00').result,basicShipping:null,shipping:null,basicTiers:[range],tiers:[range],rules:{basicFees:[],activityFees:[],shipping:{enabled:false},tiers:[range],coupons:[]}};
 try{
 const tree=OnlineMarginTables({platforms:[p]});const nodes=walk(tree);const matrix=nodes.find(n=>n.type==='table'&&n.props['aria-label']==='合成平台毛利比較');assert.ok(matrix);
 assert.deepEqual(walk(matrix).filter(n=>n.type==='th').map(n=>n.props.children),['條件','基本費率','基本＋活動費率']);
 const tier=walk(matrix).find(n=>n.type?.name==='Tier');let content=tier.type(tier.props);
 assert.equal(walk(content).filter(n=>n.props['data-label']==='各券區間'||n.props['data-label']==='逐券明細').length,0);
 const toggle=walk(content).find(n=>n.type?.name==='ExpandToggle');toggle.props.onToggle();content=tier.type(tier.props);
 const labels=walk(content).filter(n=>n.type==='th').map(n=>n.props.children);for(const name of ['基本費率－最低毛利','基本費率－最高毛利','基本＋活動－最低毛利','基本＋活動－最高毛利'])assert.ok(labels.includes(name));
 assert.equal(walk(content).filter(n=>n.props['data-label']==='優惠券').length,2);
 }finally{delete globalThis.marginHost;}
});
