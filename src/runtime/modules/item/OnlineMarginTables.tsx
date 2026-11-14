import {useState} from 'react';
import type {OnlinePlatformMargin,OnlineTierMargin,CouponMarginEndpoint,PlatformFee,ContributionValue} from '../../../../shared/item-online-margin';
import {StatusChip} from '../../../ui/primitives/StatusChip';
import {ExpandToggle} from '../../../ui/data/ExpandToggle';
export const onlineMoney=(v:string|null)=>v==null?'—':'$'+v.replace(/(\d)(?=(\d{3})+(?:\.|$))/g,'$1,');
function Profit({value}:{value:ContributionValue|null}){
 if(!value)return <>—</>;
 const result=<strong>{onlineMoney(value.contributionAmount)}／{value.contributionMarginPercent==null?'—':value.contributionMarginPercent+'%'}</strong>;
 return value.negative?<StatusChip tone="danger">{result}</StatusChip>:result;
}
function Range({minimum,maximum}:{minimum:CouponMarginEndpoint|null;maximum:CouponMarginEndpoint|null}){
 return <><div><strong>最低毛利：</strong><Profit value={minimum?.result??null}/></div><div><strong>最高毛利：</strong><Profit value={maximum?.result??null}/>{maximum?.theoretical?<div><StatusChip tone="info">理論上界</StatusChip></div>:null}</div></>;
}
function Endpoint({point}:{point:CouponMarginEndpoint|null}){
 if(!point)return <>—</>;
 return <><Profit value={point.result}/><div><small>折讓占比 {point.discountRatio}%・商品折抵 {onlineMoney(point.itemDiscount)}</small></div>{point.theoretical?<StatusChip tone="info">理論上界</StatusChip>:null}</>;
}
function Tier({basic,activity}:{basic:OnlineTierMargin;activity:OnlineTierMargin}){
 const [open,setOpen]=useState(false);const label=activity.quantity===1?'優惠券（無滿件折扣）':`滿${activity.quantity}件 ${activity.discount}折＋優惠券`;
 return <>
  <tr><td data-label="條件" data-priority="title">{label} <ExpandToggle expanded={open} onToggle={()=>setOpen(v=>!v)} label={label+'明細'} variant="text"/></td>
   <td data-label="基本費率"><Range minimum={basic.minimum} maximum={basic.maximum}/></td>
   <td data-label="基本＋活動費率"><Range minimum={activity.minimum} maximum={activity.maximum}/></td></tr>
  {open?<tr><td colSpan={3} data-label="逐券明細"><table className="cy-op-table cy-rt"><thead><tr><th>活動／優惠券</th><th>比較門檻</th><th>基本費率－最低毛利</th><th>基本費率－最高毛利</th><th>基本＋活動－最低毛利</th><th>基本＋活動－最高毛利</th></tr></thead>
   <tbody>{activity.coupons.map((row,i)=><tr key={i}>
    <td data-label="優惠券" data-priority="title">{row.name}</td>
    <td data-label="比較門檻">{row.minimum.orderAmount}～{row.maximum.orderAmount??'無上限'}元</td>
    <td data-label="基本費率－最低毛利" className="is-number"><Endpoint point={basic.coupons[i].minimum}/></td>
    <td data-label="基本費率－最高毛利" className="is-number"><Endpoint point={basic.coupons[i].maximum}/></td>
    <td data-label="基本＋活動－最低毛利" className="is-number"><Endpoint point={row.minimum}/></td>
    <td data-label="基本＋活動－最高毛利" className="is-number"><Endpoint point={row.maximum}/></td>
   </tr>)}</tbody></table>{!activity.coupons.length?<p>未設定優惠券，顯示此折數扣費後的單一毛利。</p>:null}</td></tr>:null}
 </>;
}
const feeText=(rows:PlatformFee[])=>rows.length?rows.map(r=>`${r.name} ${r.method==='percent'?r.value+'%':onlineMoney(r.value)}${r.minimum!=null?'，最低'+onlineMoney(r.minimum):''}${r.maximum!=null?'，最高'+onlineMoney(r.maximum):''}`).join(' ＋ '):'無';
export function OnlineMarginTables({platforms}:{platforms:OnlinePlatformMargin[]}){
 if(!platforms.length)return <p>尚未設定商品網路售價。</p>;
 return <section aria-label="網路平台毛利"><h3>網路平台毛利</h3>{platforms.map(p=><section key={p.platformId} aria-label={p.name+'毛利'}>
  <h4>{p.name}・主檔售價 {onlineMoney(p.price)}</h4>
  {p.status?<StatusChip tone="warning">{p.status}</StatusChip>:null}
  {p.rules&&p.status!=='請先選擇品類'?<>
   <table className="cy-op-table cy-rt"><thead><tr><th>項目</th><th>費率／毛利</th></tr></thead><tbody>
    <tr><td data-label="項目">平台基本費率</td><td data-label="費率">{feeText([...p.rules.basicFees,...(p.categoryFee?[p.categoryFee]:[])])}</td></tr>
    <tr><td data-label="項目">扣除基本費率毛利</td><td data-label="毛利"><Profit value={p.basic}/></td></tr>
    <tr><td data-label="項目">平台活動費率</td><td data-label="費率">{feeText(p.rules.activityFees)}</td></tr>
    <tr><td data-label="項目">扣除基本＋活動費率毛利</td><td data-label="毛利"><Profit value={p.activity}/></td></tr>
    {p.rules.shipping.enabled?<><tr><td data-label="項目">賣家負擔運費</td><td data-label="運費">{p.rules.shipping.carrier} {onlineMoney(p.rules.shipping.amount)}</td></tr><tr><td data-label="項目">扣基本費率及運費毛利</td><td data-label="毛利"><Profit value={p.basicShipping}/></td></tr><tr><td data-label="項目">扣基本＋活動費率及運費毛利</td><td data-label="毛利"><Profit value={p.shipping}/></td></tr></>:null}
    <tr><td data-label="項目">滿件折扣</td><td data-label="折扣">{p.rules.tiers.map(t=>`滿${t.quantity}件${t.discount}折`).join('、')||'無'}</td></tr>
    <tr><td data-label="項目">優惠券</td><td data-label="優惠券">{p.rules.coupons.map((c,i)=><div key={i}>{c.name}：滿{c.threshold}，{c.method==='percent'?c.value+'折':'折'+c.value}{c.cap!=null?'，上限'+c.cap:''}</div>)}{!p.rules.coupons.length?'無':null}</td></tr>
   </tbody></table>
   <table className="cy-op-table cy-rt" aria-label={p.name+'毛利比較'}><thead><tr><th>條件</th><th>基本費率</th><th>基本＋活動費率</th></tr></thead>
    <tbody><tr><td data-label="條件">無折扣</td><td data-label="基本費率"><Profit value={p.basicShipping??p.basic}/></td><td data-label="基本＋活動費率"><Profit value={p.shipping??p.activity}/></td></tr>
     {p.tiers.map((t,i)=><Tier key={t.quantity} basic={p.basicTiers[i]} activity={t}/>)}</tbody></table>
   <p>兩欄皆計入勾選運費。優惠券互斥、各自與滿件折扣並用；預設顯示全部券的整體區間，展開逐券分別查看最低／最高毛利。</p>
  </>:p.status==='請先選擇品類'?<p>請在商品詳情選擇此平台品類；其他通路毛利不受影響。</p>:<p>請由超級管理員至商品設定的「平台費用與優惠」填寫；未設定不視為零費用。</p>}
 </section>)}</section>;
}
