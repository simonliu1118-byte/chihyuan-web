// Synthetic official-shaped public documents. Never a substitute for live-source validation.
export function payrollSources(){
 const amounts=[11100,12000,13000,14000,15000,16000,17000,18000,19000,20000,21000,22000,23000,24000,25000,26000,27000,29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800];
 const labor=amounts.map((basis,i)=>({'序號':String(i+1),'勞保普通費率':'11.5%','就保費率':'1%','投保薪資':String(basis),'勞工應負擔保費金額':String(Math.round(basis*.115*.2)+Math.round(basis*.01*.2)),'單位應負擔保費金額':String(Math.round(basis*.115*.7)+Math.round(basis*.01*.7))}));
 const grades=amounts.slice(17).map(basis=>({'適用起日':'1150101','身分別':'一般勞工','月投保薪資':String(basis)}));
 const pension=Array.from({length:62},(_,i)=>({'等級':String(i+1),'生效日':'1150101','月提繳工資金額/月提繳執行業務所得金額':String(i===61?150000:1500+i*2400)}));
 const health=[['投保金額等級','月投保金額','本人負擔金額','本人+1眷口','本人+2眷口','本人+3眷口','投保單位負擔金額','政府負擔金額'],...Array.from({length:58},(_,i)=>{const basis=i===0?29500:i===1?30300:i===57?313000:30300+(i-1)*5000,worker=i===0?458:i===1?470:470+i*50;return [i+1,basis,worker,worker*2,worker*3,worker*4,worker*3,worker/2];})].map(r=>r.join(',')).join('\r\n');
 const tax=[['每月薪資所得',...Array.from({length:12},(_,i)=>`配偶及受扶養親屬計${i}人(元)`)],...Array.from({length:840},(_,i)=>[`${80001+i*500} ~ ${80500+i*500}`,...Array.from({length:12},(_,j)=>i<21?0:Math.max(0,2020+(i-21)*30-j*500))])].map(r=>r.join(',')).join('\r\n');
 const json=x=>JSON.stringify(x),link=(url,label,description)=>`<a href="${url}"><svg><path d="${'M0 0 '.repeat(200)}"/></svg>${label}</a><span>${description}</span>`;
 const bodies=new Map();
 for(const [id,path,data] of [[6259,'labor',labor],[6258,'grades',grades],[6274,'pension',pension]]){
  bodies.set('https://data.gov.tw/dataset/'+id,'自115年1月1日起適用 '+link('https://apiservice.mol.gov.tw/'+path,'JSON','115年1月適用'));
  bodies.set('https://apiservice.mol.gov.tw/'+path,json(data));
 }
 bodies.set('https://data.gov.tw/dataset/20246',link('https://info.nhi.gov.tw/old','CSV','100年舊表')+link('https://info.nhi.gov.tw/health','CSV','115年1月有一定雇主受僱者健保費負擔金額表'));
 bodies.set('https://info.nhi.gov.tw/health',health);
 bodies.set('https://data.gov.tw/dataset/25627',link('https://www.ntbt.gov.tw/tax','CSV','薪資所得扣繳稅額表'));
 bodies.set('https://www.ntbt.gov.tw/tax',tax);
 bodies.set('https://www.etax.nat.gov.tw/etwmain/tax-info/understanding/tax-q-and-a/national/individual-income-tax/withheld-rule/rule/NM11BZY','115年度為90,501元，按照全月給付總額扣繳5%，每月應扣繳稅額不超過2,000元者，免予扣繳；非居住者按照全月給付總額扣繳18%，最低工資之1.5倍以下扣繳6%。');
 bodies.set('https://www.mol.gov.tw/1607/28162/28166/28180/99861/28184/29016/','民國114年10月21日發布，自115年1月1日起實施，訂定每月最低工資為29,500元，每小時最低工資為196元。民國115年10月16日發布，自116年1月1日起實施，訂定每月最低工資為30,900元，每小時最低工資為205元。');
 const calls=[];
 const fetcher=async(url,options)=>{calls.push(String(url));const body=bodies.get(String(url));return new Response(body??'not found',{status:body==null?404:200,headers:{'content-type':'text/plain;charset=utf-8'}});};
 return {bodies,calls,fetcher};
}
