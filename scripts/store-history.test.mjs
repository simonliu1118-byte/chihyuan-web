import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const {orderHistoryPresentation,retiredArrivalEvent,cacheHistory,cachedHistory}=await load('shared/store-history.ts');
const {historySummary}=await load('src/runtime/modules/StoreOperationHistory.tsx');
const event=(over={})=>({id:1,at:'2026-11-01T00:00:00Z',actorName:'合成',kind:'推進',before:{status:'ORDERED'},after:{status:'NOTIFIED',date:'2026-10-31'},reason:'',...over});
test('history projects creation without details and progress as one named action plus work date',()=>{
 const created=orderHistoryPresentation(event({kind:'建立',after:{customerName:'合成',lines:['long']}}));assert.equal(historySummary(created),'');assert.deepEqual(created.after,{});
 for(const [status,label] of [['ORDERED','叫貨'],['NOTIFIED','通知'],['PICKED_UP','取貨']]){const e=orderHistoryPresentation(event({after:{status,dates:{[status]:'2026-10-31'}}}));assert.equal(e.kind,'登記'+label);assert.equal(historySummary(e),'作業日期：2026-10-31');}
 assert.equal(historySummary(orderHistoryPresentation(event({after:{status:'ORDERED',dates:{ORDERED:null}}}))),'作業日期：無日期');
});
test('retired arrival events disappear while notification survives without ARRIVED anywhere in the projection',()=>{
 assert(retiredArrivalEvent(event({after:{status:'ARRIVED',date:'2026-10-20'}})));
 assert(retiredArrivalEvent(event({kind:'更正日期',before:{ARRIVED:null},after:{ARRIVED:'2026-10-20'}})));
 const original=event({before:{status:'ARRIVED',dates:{ARRIVED:'2026-10-20'}},after:{status:'NOTIFIED',date:'2026-10-21'}});assert(!retiredArrivalEvent(original));const display=orderHistoryPresentation(original);assert(!JSON.stringify(display).includes('ARRIVED'));assert.equal(display.kind,'登記通知');assert.equal(original.before.status,'ARRIVED');
});
test('a missing old value has no leading arrow, while an explicitly undated milestone has a named old value',()=>{
 assert.equal(historySummary(event({kind:'更正日期',before:{},after:{date:'2026-04-16'}})),'作業日期：2026-04-16');
 assert.equal(historySummary(event({kind:'更正日期',before:{date:''},after:{date:'2026-04-16'}})),'作業日期：2026-04-16');
 assert.equal(historySummary(event({kind:'更正日期',before:{ORDERED:null},after:{ORDERED:'2026-04-16'}})),'叫貨日期：無日期 → 2026-04-16');
});
test('history cache is bounded, expires without extending on reads, and retains a usable pagination cursor',()=>{
 const cache=new Map(),rows=Array.from({length:120},(_,i)=>event({id:200-i}));cacheHistory(cache,'/one',{rows,nextCursor:79},0);assert.equal(cachedHistory(cache,'/one',1000).rows.length,100);assert.equal(cachedHistory(cache,'/one',2000).nextCursor,101);assert.equal(cachedHistory(cache,'/one',60000),null);
 for(let i=0;i<21;i++)cacheHistory(cache,'/'+i,{rows:[],nextCursor:null},1000);assert.equal(cache.size,20);assert.equal(cachedHistory(cache,'/0',2000),null);assert(cachedHistory(cache,'/1',2000));cacheHistory(cache,'/last',{rows:[],nextCursor:null},2000);assert.equal(cachedHistory(cache,'/2',2000),null);cache.clear();assert.equal(cachedHistory(cache,'/1',2000),null);
});
