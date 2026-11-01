import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const pure=await build({entryPoints:['shared/date-input.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const dates=await import('data:text/javascript;base64,'+Buffer.from(pure.outputFiles[0].text).toString('base64'));
let drafts=[];
const code=await build({entryPoints:['src/ui/forms/DateInput.tsx'],bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},plugins:[{name:'date-field-boundary',setup(b){b.onResolve({filter:/^react(?:\/jsx-runtime)?$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='react'?'export const useRef=v=>({current:v});export const useId=()=>"date";export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useState=v=>[v,x=>globalThis.dateDrafts.push(x)];':'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment="fragment";'}))}}]});
const {DateInput}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
function field(){const changes=[];drafts=[];globalThis.dateDrafts=drafts;const root=DateInput({value:'2026-04-01',onChange:v=>changes.push(v)});return {root,input:root.props.children[0],changes}}
test('numeric date masks put separators back after a year-prefixed month/day replacement',()=>{
 assert.equal(dates.dateInputDisplay('20260424'),'2026/04/24');assert.equal(dates.dateInputDisplay('0424',true,'2026-11-01'),'2026/04/24');assert.equal(dates.dateInputDisplay('2026042',false),'2026/04/2');
});
test('real date input handlers normalize the reported 2026/0424 case immediately',()=>{
 const {input,changes}=field();input.props.onChange({currentTarget:{value:'2026/0424',selectionStart:9},nativeEvent:{inputType:'insertText'}});assert.equal(drafts.at(-1),'2026/04/24');assert.equal(changes.at(-1),'2026-04-24');
 input.props.onChange({currentTarget:{value:'２０２６０４２４',selectionStart:8},nativeEvent:{inputType:'insertText'}});assert.equal(changes.at(-1),'2026-04-24');
});
test('date copy/cut use selected digits and Backspace skips a separator instead of erasing it',()=>{
 const {input}=field();const node={value:'2026/04/24',selectionStart:5,selectionEnd:10};let copied;const e={currentTarget:node,clipboardData:{setData:(t,v)=>copied=v},preventDefault(){}};input.props.onCopy(e);assert.equal(copied,'0424');input.props.onCut(e);assert.equal(drafts.at(-1),'2026');
 node.selectionStart=8;node.selectionEnd=8;input.props.onKeyDown({...e,key:'Backspace',nativeEvent:{isComposing:false}});assert.equal(drafts.at(-1),'2026/02/4');
});
test('invalid numeric days do not become a valid saved value and density is configurable',()=>{
 const {input,changes,root}=field();input.props.onChange({currentTarget:{value:'20260230',selectionStart:8},nativeEvent:{inputType:'insertText'}});assert.equal(changes.at(-1),'');assert.equal(root.props['data-density'],'compact');assert.equal(DateInput({value:'',onChange(){},density:'regular'}).props['data-density'],'regular');
});


test('date validation prevents the native invalid bubble while marking its controlled invalid state',()=>{const {input}=field();let prevented=false;input.props.onInvalid({preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(drafts.at(-1),true)});
