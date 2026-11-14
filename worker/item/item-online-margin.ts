import type {ItemDetail,ItemWebPlatform} from '../../shared/item';
import type {PlatformMarginRules,PlatformFee,MarginCoupon,OnlinePlatformMargin,CouponMarginEndpoint} from '../../shared/item-online-margin';
import {value,multiply,subtract,display,margin,itemNetCost,type Rational} from './item-margin-service';
const zero=()=>value('0');
const add=(a:Rational,b:Rational):Rational=>({numerator:a.numerator*b.denominator+b.numerator*a.denominator,denominator:a.denominator*b.denominator});
const cmp=(a:Rational,b:Rational)=>a.numerator*b.denominator-b.numerator*a.denominator;
const min=(a:Rational,b:Rational)=>cmp(a,b)<=0n?a:b;
const max=(a:Rational,b:Rational)=>cmp(a,b)>=0n?a:b;
const divide=(a:Rational,b:Rational):Rational=>({numerator:a.numerator*b.denominator,denominator:a.denominator*b.numerator});
export function couponRatio(coupon:MarginCoupon,orderAmount:string|null):Rational {
  // Last uncapped percentage coupon keeps its discount; capped/fixed coupons tend to zero.
  if(orderAmount==null)return coupon.method==='percent'&&coupon.cap==null?subtract(value('1'),multiply(value(coupon.value),1n,10n)):zero();
  const order=value(orderAmount);
  let discount=coupon.method==='fixed'?value(coupon.value):multiply(order,10n*value(coupon.value).denominator-value(coupon.value).numerator,10n*value(coupon.value).denominator);
  if(coupon.cap!=null)discount=min(discount,value(coupon.cap));
  return divide(min(discount,order),order);
}
function feeAmount(fee:PlatformFee,price:Rational):Rational {
  const v=value(fee.value);
  let result=fee.method==='fixed'?v:multiply(price,v.numerator,v.denominator*100n);
  if(fee.minimum!=null)result=max(result,value(fee.minimum));
  if(fee.maximum!=null)result=min(result,value(fee.maximum));
  return result;
}
export function onlineMargins(item:ItemDetail,platforms:readonly ItemWebPlatform[],rules:readonly PlatformMarginRules[]):OnlinePlatformMargin[] {
 const cost=itemNetCost(item);const byId=new Map(rules.map(r=>[r.platformId,r]));
 return item.onlinePrices.map(entry=>{
  const rule=byId.get(entry.platformId)??null;
  const output:OnlinePlatformMargin={platformId:entry.platformId,name:platforms.find(p=>p.id===entry.platformId)?.name??String(entry.platformId),price:entry.price,configured:!!rule,rules:rule,status:cost==null?'待補成本／稅別':rule==null?'費率待設定':null,basic:null,activity:null,shipping:null,basicShipping:null,basicTiers:[],tiers:[]};
  if(!cost||!rule)return output;
  const calculate=(price:Rational,fees:PlatformFee[],shipping:boolean)=>{
   let deductions=cost;
   for(const fee of fees)deductions=add(deductions,feeAmount(fee,price));
   if(shipping&&rule.shipping.enabled)deductions=add(deductions,value(rule.shipping.amount));
   const result=margin(multiply(price,100n,105n),deductions);
   return {netSales:result.netSales,contributionAmount:result.grossProfit,contributionMarginPercent:result.grossMarginPercent,negative:result.negative};
  };
  const price=value(entry.price),allFees=[...rule.basicFees,...rule.activityFees];
  output.basic=calculate(price,rule.basicFees,false);output.activity=calculate(price,allFees,false);
  output.shipping=rule.shipping.enabled?calculate(price,allFees,true):null;
  output.basicShipping=rule.shipping.enabled?calculate(price,rule.basicFees,true):null;
  const thresholds=[...new Set(rule.coupons.map(c=>Number(c.threshold)))].sort((a,b)=>a-b);
  const tierResults=(fees:PlatformFee[])=>(rule.tiers.length?rule.tiers:[{quantity:1,discount:'10'}]).map(tier=>{
   const fold=value(tier.discount),tierPrice=multiply(price,fold.numerator,fold.denominator*10n);
   const candidates:{endpoint:CouponMarginEndpoint;ratio:Rational}[]=[];
   const endpoint=(coupon:string,orderAmount:string|null,ratio:Rational,theoretical:boolean)=>{
    const itemDiscount=multiply(tierPrice,ratio.numerator,ratio.denominator);
    candidates.push({ratio,endpoint:{coupon,orderAmount,discountRatio:display(multiply(ratio,100n)),itemDiscount:display(itemDiscount),result:calculate(subtract(tierPrice,itemDiscount),fees,true),theoretical}});
   };
   if(!rule.coupons.length)endpoint('無優惠券',null,zero(),false);
   const couponRanges:OnlinePlatformMargin["tiers"][number]["coupons"]=[];
   for(const coupon of rule.coupons){
    const next=thresholds.find(t=>t>Number(coupon.threshold));
    const begin=candidates.length;
    endpoint(coupon.name,coupon.threshold,couponRatio(coupon,coupon.threshold),false);
    const upper=next==null?null:String(next-1);
    endpoint(coupon.name,upper,couponRatio(coupon,upper),next==null&&!(coupon.method==='percent'&&coupon.cap==null));
    couponRanges.push({name:coupon.name,minimum:candidates[begin].endpoint,maximum:candidates[begin+1].endpoint});
   }
   // Nonnegative costs and capped/nonnegative fees make margin monotone with net proceeds.
   // Compare exact coupon ratios, not rounded display percentages or rounded money.
   let low=candidates[0],high=candidates[0];
   for(const candidate of candidates){if(cmp(candidate.ratio,low.ratio)>0n)low=candidate;if(cmp(candidate.ratio,high.ratio)<0n)high=candidate;}
   return {...tier,minimum:low.endpoint,maximum:high.endpoint,coupons:couponRanges};
  });
  output.basicTiers=tierResults(rule.basicFees);output.tiers=tierResults(allFees);
  return output;
 });
}
