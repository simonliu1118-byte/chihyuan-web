import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtempSync,existsSync,unlinkSync,rmdirSync} from "node:fs";
import {fileURLToPath,pathToFileURL} from "node:url";
import {join} from "node:path";

const directory=mkdtempSync(fileURLToPath(new URL("../node_modules/.ordering-source-test-",import.meta.url))),outfile=join(directory,"picker.mjs");
let OrderingSourcePicker;
try{
 await build({entryPoints:[fileURLToPath(new URL("../src/ui/OrderingSourcePicker.tsx",import.meta.url))],outfile,bundle:true,platform:"node",format:"esm",jsx:"automatic",packages:"external",plugins:[{name:"fake-react",setup(api){
  api.onResolve({filter:/^react$/},()=>({path:"react",namespace:"stub"}));
  api.onLoad({filter:/.*/,namespace:"stub"},()=>({contents:
   ["useState","useRef","useEffect","useMemo"].map(n=>`export const ${n}=(...args)=>globalThis.__pickerHost.${n}(...args);`).join("\n")+"\nexport const useId=()=>\"source-list\";" }));
  api.onLoad({filter:/\.css$/},()=>({contents:"",loader:"js"}));
 }}]});
 ({OrderingSourcePicker}=await import(pathToFileURL(outfile)));
}finally{if(existsSync(outfile))unlinkSync(outfile);rmdirSync(directory)}
const descendants=n=>!n||typeof n!=="object"?[]:[n,...[n.props?.children].flat(Infinity).flatMap(descendants)];
const text=n=>typeof n==="string"?n:Array.isArray(n)?n.map(text).join(""):text(n?.props?.children??"");
const sources=[
 ...["台北","台中","洲美","定期中國貨","自訂中國貨"].map((name,i)=>({id:i+1,name,kind:i===3?"CN_REGULAR":i===4?"CN_CUSTOM":"GENERAL",isActive:true})),
 {id:6,name:"永全",kind:"VENDOR",isActive:true},{id:7,name:"坤日",kind:"VENDOR",isActive:true},
 {id:8,name:"已停用廠商",kind:"VENDOR",isActive:false}
];
function mount({allowAll=false,includeHidden=false}={}){
 let cursor=0,dirty=true,tree,effects=[],value=0;
 const slots=[],changed=[];
 const host={
  useRef(v){const n=cursor++;return slots[n]??={current:v}},
  useState(v){const n=cursor++;slots[n]??={value:typeof v==="function"?v():v};return [slots[n].value,update=>{slots[n].value=typeof update==="function"?update(slots[n].value):update;dirty=true}]},
  useMemo(fn,deps){const n=cursor++;if(!slots[n]||deps.some((v,i)=>v!==slots[n].deps[i]))slots[n]={deps,value:fn()};return slots[n].value},
  useEffect(fn,deps){const n=cursor++,prev=slots[n];if(!prev||deps.some((v,i)=>v!==prev.deps[i])){prev?.cleanup?.();slots[n]={deps};effects.push(()=>{slots[n].cleanup=fn()})}}
 };
 function render(){globalThis.__pickerHost=host;do{cursor=0;dirty=false;effects=[];tree=OrderingSourcePicker({sources,value,allowAll,includeHidden,label:"選擇來源",onChange(v){value=v;changed.push(v);dirty=true}});effects.forEach(fn=>fn())}while(dirty)}
 const buttons=()=>descendants(tree).filter(n=>n.type==="button"&&n.props?.className!=="cy-ordering-source-picker-toggle");
 const input=()=>descendants(tree).find(n=>n.type==="input");
 function click(label){const node=buttons().find(n=>text(n).includes(label));assert.ok(node,"option "+label);node.props.onClick();render()}
 render();
 return {input,buttons,click,render,changed,get value(){return value},dispose(){slots.forEach(s=>s?.cleanup?.())}};
}
test("two-level picker opens only five internal sources and vendor entry; can select vendor by mouse",()=>{
 const picker=mount();
 picker.input().props.onFocus();picker.render();
 const root=picker.buttons().map(text);
 for(const name of ["台北","台中","洲美","定期中國貨","自訂中國貨","廠商"])assert.ok(root.some(x=>x.includes(name)),name);
 assert.equal(root.some(x=>x.includes("永全")),false,"external vendor must start on second level");
 picker.click("廠商");assert.ok(picker.buttons().some(n=>text(n).includes("永全")));
 picker.click("永全");assert.equal(picker.value,6);
 picker.dispose();
});
test("typing searches vendor names directly and excludes hidden vendors when making new orders",()=>{
 const picker=mount();
 picker.input().props.onChange({target:{value:"坤"}});picker.render();
 assert.ok(picker.buttons().some(n=>text(n).includes("坤日")));
 picker.click("坤日");assert.equal(picker.value,7);
 picker.input().props.onFocus();picker.render();picker.click("廠商");
 assert.equal(picker.buttons().some(n=>text(n).includes("已停用廠商")),false);
 picker.dispose();
});
test("history picker permits hidden sources and clearing All",()=>{
 const picker=mount({allowAll:true,includeHidden:true});
 picker.input().props.onFocus();picker.render();
 picker.click("全部來源");assert.equal(picker.value,0);
 picker.input().props.onFocus();picker.render();picker.click("廠商");picker.click("已停用廠商");assert.equal(picker.value,8);
 picker.dispose();
});
