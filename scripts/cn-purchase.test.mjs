import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";

const compiled=await build({entryPoints:["shared/cn-purchase.ts"],bundle:true,format:"esm",platform:"node",write:false});
const cn=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));

// A 10 → 5/3/2, B 5, C 20: card 1 = A5+B+C, card 2 = A3, card 3 = A2 (user 2026-11-10).
const lines=[{id:1,discontinued:false},{id:2,discontinued:false},{id:3,discontinued:false}];
const pieces=[
 {id:11,lineId:1,sortOrder:1,quantity:5,rmbPrice:3500,chargeId:101},
 {id:21,lineId:2,sortOrder:2,quantity:5,rmbPrice:680,chargeId:101},
 {id:31,lineId:3,sortOrder:3,quantity:20,rmbPrice:520,chargeId:101},
 {id:12,lineId:1,sortOrder:1,quantity:3,rmbPrice:3500,chargeId:102},
 {id:13,lineId:1,sortOrder:1,quantity:2,rmbPrice:3500,chargeId:103},
];
const charges=[
 {id:101,kind:"CARD",sortOrder:1,chargedOn:"2026-11-11",amount:1400,fee:14,note:""},
 {id:102,kind:"CARD",sortOrder:2,chargedOn:"2026-11-12",amount:480,fee:null,note:""},
 {id:103,kind:"CARD",sortOrder:3,chargedOn:"2026-11-12",amount:320,fee:3,note:""},
];

test("money parsing",()=>{
 assert.equal(cn.parseRmbFen("35"),3500);assert.equal(cn.parseRmbFen("¥6.8"),680);assert.equal(cn.parseRmbFen(""),null);
 assert.ok(Number.isNaN(cn.parseRmbFen("6.805")));assert.equal(cn.parseNtd("1,234"),1234);assert.ok(Number.isNaN(cn.parseNtd("1.5")));
});

test("stage follows 完成訂購, 運費, 營業稅 and 結案",()=>{
 assert.equal(cn.cnStage({orderedAt:null,charges},false),"ORDERING");
 assert.equal(cn.cnStage({orderedAt:"x",charges},false),"ORDERED");
 assert.equal(cn.cnStage({orderedAt:"x",charges:[...charges,{id:9,kind:"SHIPPING"}]},false),"SHIPPED");
 assert.equal(cn.cnStage({orderedAt:"x",charges:[...charges,{id:9,kind:"SHIPPING"},{id:8,kind:"TAX"}]},false),"ARRIVED");
 assert.equal(cn.cnStage({orderedAt:null,charges},true),"CLOSED");
});

test("card shares are whole 台幣 that add up to each card exactly",()=>{
 const {pieces:r,totals}=cn.computeCnPurchase(lines,{pieces,charges,returns:[]});
 // card 1 RMB = 175 + 34 + 104 = 313; 1414 split 790.57/153.60/469.83 → 790/154/470 (largest remainder).
 assert.deepEqual([11,21,31].map(id=>r.get(id).ntdShare),[790,154,470]);
 assert.equal([11,21,31].reduce((s,id)=>s+r.get(id).ntdShare,0),1414);
 assert.equal(r.get(12).ntdShare,480);
 assert.equal(totals.missingFee,1);assert.equal(totals.cardAmount,2200);assert.equal(totals.cardFee,17);
 assert.equal(totals.grand,2217);
});

test("allocate never loses a dollar",()=>{
 assert.deepEqual(cn.allocate(10,[1,1,1]),[4,3,3]);
 assert.deepEqual(cn.allocate(100,[0,0]),[100,0]);
 assert.deepEqual(cn.allocate(-7,[1,1]),[-4,-3]);
 for(let t=0;t<200;t++){const w=[1+t%7,3+t%5,11,2+t%3],total=1000+t*37;assert.equal(cn.allocate(total,w).reduce((a,b)=>a+b,0),total)}
});
test("whole-table recalculation: shipping and tax spread by net and borne by kept goods",()=>{
 const withCosts=[...charges,{id:201,kind:"SHIPPING",sortOrder:1,chargedOn:"2026-11-20",amount:300,fee:3,note:""},{id:301,kind:"TAX",sortOrder:1,chargedOn:"2026-12-18",amount:100,fee:null,note:""}];
 const returns=[{lineId:3,quantity:2,rmbAmount:1040,ntdAmount:50,fee:2,reason:"瑕疵"}];
 const {pieces:r,totals}=cn.computeCnPurchase(lines,{pieces,charges:withCosts,returns});
 assert.equal(totals.grand,2217+303+100-50+2);
 // 含稅含運小計 are whole 台幣 and add up to the grand total exactly.
 assert.ok(pieces.every(p=>Number.isInteger(r.get(p.id).landedTotal)));
 assert.equal(pieces.reduce((s,p)=>s+r.get(p.id).landedTotal,0),totals.grand);
 assert.equal(r.get(31).returnedQuantity,2);
 // A 退貨 raises nothing for C but changes everyone's share: recompute without it differs.
 const before=cn.computeCnPurchase(lines,{pieces,charges:withCosts,returns:[]}).pieces.get(11).landedUnit;
 assert.notEqual(before,r.get(11).landedUnit);
});

test("missing card amount leaves landed cost blank; discontinued lines take no part",()=>{
 const open=charges.map(c=>c.id===103?{...c,amount:null}:c);
 const res=cn.computeCnPurchase(lines,{pieces,charges:open,returns:[]});
 assert.equal(res.totals.grand,null);assert.equal(res.pieces.get(11).landedUnit,null);assert.equal(res.totals.missingCardAmount,1);
 const dead=cn.computeCnPurchase([{id:1,discontinued:false},{id:2,discontinued:true},{id:3,discontinued:false}],{pieces,charges,returns:[]});
 assert.equal(dead.pieces.has(21),false);
});

test("table rows group each card, then uncharged, then discontinued",()=>{
 const extra=[...pieces,{id:14,lineId:1,sortOrder:9,quantity:1,rmbPrice:null,chargeId:null}];
 const rows=cn.cnTableRows([...lines,{id:4,discontinued:true}],{pieces:extra,charges});
 assert.deepEqual(rows.map(r=>r.piece.id),[11,21,31,12,13,14,-4]);
 assert.deepEqual(rows.map(r=>r.cardSpan),[3,0,0,1,1,0,0]);
 assert.equal(rows[5].unchargedSpan,1);
 assert.deepEqual(rows.map(r=>r.firstOfLine),[true,true,true,false,false,false,true]);
 assert.equal(rows[6].discontinued,true);assert.equal(rows[6].seq,4);
});

test("品項合計 folds an item's pieces into one weighted row",()=>{
 const ps=[{id:1,lineId:9,sortOrder:0,quantity:20,rmbPrice:10000,chargeId:7},{id:2,lineId:9,sortOrder:1,quantity:10,rmbPrice:12000,chargeId:8}];
 const cs=[{id:7,kind:"CARD",sortOrder:0,chargedOn:null,amount:9000,fee:0,note:""},{id:8,kind:"CARD",sortOrder:1,chargedOn:null,amount:6000,fee:0,note:""}];
 const lines=[{id:9,discontinued:false}],res=cn.computeCnPurchase(lines,{pieces:ps,charges:cs,returns:[]});
 const s=cn.summarizeCnLines(lines,ps,res.pieces).get(9);
 assert.equal(s.quantity,30);assert.equal(s.rmbSubtotal,320000);
 assert.ok(Math.abs(s.rmbUnit-(100*20+120*10)/30*100)<1e-9);
 assert.equal(s.ntdShare,15000);assert.equal(s.ntdUnit,500);
 assert.equal(s.landedTotal,15000);assert.equal(s.landedUnit,500);
});
