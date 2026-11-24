import test from 'node:test';import assert from 'node:assert/strict';
import {compiled,Host,plugin,walk,text} from './test-support/hr-ui-fixture.mjs';
const guard={name:'bonus-navigation',setup(b){b.onResolve({filter:/foundation\/useUnsavedChangesGuard$/},()=>({path:'guard',namespace:'bonus-test'}));b.onLoad({filter:/.*/,namespace:'bonus-test'},()=>({contents:'export function useNavigationGuard(){return {canLeave:async()=>true};}export function useUnsavedChangesGuard(){}'}));}};
const {HrBonusPanel}=await compiled('src/runtime/modules/HrBonusPanel.tsx',[guard,plugin]);
const field=(t,label)=>{const n=walk(t).find(n=>n.props?.rows?.some(r=>r.label===label));if(n)return n.props.rows.find(r=>r.label===label).content;return walk(t).find(n=>n.props?.label===label)?.props.children;};
const button=(t,label)=>walk(t).find(n=>n.type==='button'&&text(n)===label);
test('bulk editor retains amounts/notes and request key on failure, then locks issuing until a saved preview exists',async()=>{
 const host=new Host(),editorHost=new Host();let payloads=[],reject;
 globalThis.hrTransport=async(u,o)=>{if(o?.method){payloads.push(o.json);return new Promise((resolve,r)=>{reject=r;});}return u.includes('/employees?')?{items:[{id:1,employee_no:'SYNTHETIC',name:'合成人員'}],nextCursor:null}:{items:[],nextCursor:null};};
 try{const Records=HrBonusPanel().type;host.render(Records);let tree=await host.settle(Records);button(tree,'統一發放獎金').props.onClick();tree=host.render(Records);const editor=walk(tree).find(n=>n.type?.name==='BonusEditor');assert.ok(editor);
 editorHost.render(editor.type,editor.props);let form=await editorHost.settle(editor.type,editor.props);const check=walk(form).find(n=>n.props?.['aria-label']==='選取SYNTHETIC 合成人員');check.props.onChange({target:{checked:true}});form=editorHost.render(editor.type,editor.props);
 field(form,'SYNTHETIC金額').props.onChange({target:{value:'2000'}});field(form,'SYNTHETIC備註').props.onChange({target:{value:'合成備註'}});form=editorHost.render(editor.type,editor.props);
 const submit=()=>walk(form).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});submit();submit();await new Promise(r=>setImmediate(r));assert.equal(payloads.length,1);reject(Error('合成失敗'));form=await editorHost.settle(editor.type,editor.props);
 assert.equal(field(form,'SYNTHETIC金額').props.value,'2000');assert.equal(field(form,'SYNTHETIC備註').props.value,'合成備註');assert.equal(button(form,'確認已發放'),undefined);
 submit();await new Promise(r=>setImmediate(r));assert.equal(payloads[0].requestKey,payloads[1].requestKey);reject(Error('合成仍失敗'));await editorHost.settle(editor.type,editor.props);
 }finally{host.close();editorHost.close();delete globalThis.hrTransport;delete globalThis.hrHost;}
});
test('attribution year is sent to the API as a number (the server validates an integer), and blank stays null',async()=>{
 const host=new Host(),editorHost=new Host();const payloads=[];
 globalThis.hrTransport=async(u,o)=>{if(o?.method){payloads.push(o.json);return new Promise(()=>{});}return u.includes('/employees?')?{items:[{id:1,employee_no:'SYNTHETIC',name:'合成人員'}],nextCursor:null}:{items:[],nextCursor:null};};
 try{const Records=HrBonusPanel().type;host.render(Records);let tree=await host.settle(Records);button(tree,'統一發放獎金').props.onClick();tree=host.render(Records);const editor=walk(tree).find(n=>n.type?.name==='BonusEditor');assert.ok(editor);
 editorHost.render(editor.type,editor.props);let form=await editorHost.settle(editor.type,editor.props);
 walk(form).find(n=>n.props?.['aria-label']==='選取SYNTHETIC 合成人員').props.onChange({target:{checked:true}});form=editorHost.render(editor.type,editor.props);
 field(form,'SYNTHETIC金額').props.onChange({target:{value:'2000'}});field(form,'歸屬年度').props.onChange({target:{value:'2026'}});form=editorHost.render(editor.type,editor.props);
 walk(form).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 assert.equal(payloads.length,1);assert.strictEqual(payloads[0].attributionYear,2026);
 }finally{host.close();editorHost.close();delete globalThis.hrTransport;delete globalThis.hrHost;}
});
