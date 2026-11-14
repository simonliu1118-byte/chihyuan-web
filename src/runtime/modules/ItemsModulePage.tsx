import {ModuleSections} from "../../ui/mobile/ModuleSections";
import {routeHref} from "../navigation/route-params";
import {ItemOperationalPage} from "./ItemOperationalPage";
import {DefectOperationalPage} from "./DefectOperationalPage";

/** 商品與瑕疵為同一導覽入口；既有 #defects 深連結不改，授權各自獨立。 */
export function ItemsModulePage({route,canItems,canDefects,canViewCustomers,canViewCost=false}:{
 route:"items"|"defects";canItems:boolean;canDefects:boolean;canViewCustomers:boolean;canViewCost?:boolean;
}) {
 const sections=[
  ...(canItems?[{key:"items" as const,label:"商品"}]:[]),
  ...(canDefects?[{key:"defects" as const,label:"瑕疵"}]:[]),
 ];
 const active=route==="defects"&&canDefects?"defects":canItems?"items":"defects";
 return <div className="cy-items-module">
  <ModuleSections label="商品功能" sections={sections} value={active}
   onChange={key=>{window.location.hash=routeHref(key)}}/>
  {active==="items"?<ItemOperationalPage canViewDefects={canDefects} canViewCustomers={canViewCustomers} canViewCost={canViewCost}/>:<DefectOperationalPage/>}
 </div>;
}
