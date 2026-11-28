export const HR_OFFICIAL_UPDATE_SCHEDULE="每年 6 月 20 日、12 月 20 日 04:00";
export const HOLIDAY_DATASET="https://data.gov.tw/dataset/14718";
const law=(code:string)=>"https://law.moj.gov.tw/LawClass/LawAll.aspx?PCode="+code;
const mol=(code:string)=>"https://laws.mol.gov.tw/FLAW/FLAWDAT01.aspx?id="+code;
export const HR_LAW_SOURCES=[
 {key:"labor",name:"勞動基準法",url:law("N0030001")},
 {key:"labor-detail",name:"勞動基準法施行細則",url:law("N0030002")},
 {key:"leave",name:"勞工請假規則",url:law("N0030006")},
 {key:"gender",name:"性別平等工作法",url:law("N0030014")},
 {key:"holidays",name:"紀念日及節日實施條例",url:law("D0020095")},
 {key:"minimum",name:"最低工資法",url:law("N0030028")},
 {key:"insurance",name:"勞工保險條例",url:law("N0050001")},
 {key:"employment",name:"就業保險法",url:law("N0050021")},
 {key:"pension",name:"勞工退休金條例",url:law("N0030020")},
 {key:"health",name:"全民健康保險法",url:law("L0060001")},
 {key:"disaster-insurance",name:"勞工職業災害保險及保護法",url:law("N0050031")},
 {key:"withholding",name:"各類所得扣繳率標準",url:law("G0340028")},
 {key:"part-time",name:"僱用部分時間工作勞工應行注意事項",url:mol("FL072875")},
 {key:"disaster",name:"天然災害發生事業單位勞工出勤管理及工資給付要點",url:mol("FL049533")},
] as const;
export type OfficialUpdateState={key:string;checked_at:string|null;success_at:string|null;error:string;revision:string;review_required:number;source_url:string};
