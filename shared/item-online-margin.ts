// Fee-adjusted contribution is distinct from the merchandise gross-profit metric.
export interface ContributionValue {netSales:string;contributionAmount:string;contributionMarginPercent:string|null;negative:boolean}
export interface PlatformFee {name:string;method:'percent'|'fixed';value:string;minimum:string|null;maximum:string|null}
export interface PlatformCategoryFee extends PlatformFee {id:string}
export interface QuantityDiscount {quantity:number;discount:string}
export interface MarginCoupon {name:string;method:'percent'|'fixed';value:string;threshold:string;cap:string|null}
export interface PlatformMarginRules {platformId:number;revision:number;basicFees:PlatformFee[];categoryFees?:PlatformCategoryFee[];activityFees:PlatformFee[];shipping:{enabled:boolean;carrier:string;amount:string};tiers:QuantityDiscount[];coupons:MarginCoupon[]}
export interface CouponMarginEndpoint {coupon:string;orderAmount:string|null;discountRatio:string;itemDiscount:string;result:ContributionValue;theoretical:boolean}
export interface OnlineTierMargin {quantity:number;discount:string;minimum:CouponMarginEndpoint|null;maximum:CouponMarginEndpoint|null;coupons:{name:string;minimum:CouponMarginEndpoint;maximum:CouponMarginEndpoint}[]}
export interface OnlinePlatformMargin {platformId:number;name:string;price:string;configured:boolean;rules:PlatformMarginRules|null;status:string|null;categoryFee:PlatformCategoryFee|null;basic:ContributionValue|null;activity:ContributionValue|null;shipping:ContributionValue|null;basicShipping:ContributionValue|null;basicTiers:OnlineTierMargin[];tiers:OnlineTierMargin[]}
export const emptyPlatformMarginRules=(platformId:number):PlatformMarginRules=>({platformId,revision:0,basicFees:[],categoryFees:[],activityFees:[],shipping:{enabled:false,carrier:'',amount:'0'},tiers:[],coupons:[]});
