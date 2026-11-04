import type {ReactNode} from "react";
import {IconButton} from "../../../ui/actions/IconButton";
import {Icons} from "../../../ui/actions/icons";
type Action={label:string;disabled?:boolean;onClick:()=>void};
type HistoryAction=Action&{expanded:boolean;controls:string};
/** Shared four-icon store workflow cell: edit, cancellation, reversal, operation history. */
export function storeWorkflowActions({edit,cancel,back,history,beforeHistory}:{edit:Action;cancel:Action;back:Action;history:HistoryAction;beforeHistory?:ReactNode}){
 return <div className="cy-store-row-actions">
  <IconButton variant="table" icon={Icons.edit} {...edit}/>
  <IconButton variant="table" icon={Icons.cancel} tone="danger" {...cancel}/>
  <IconButton variant="table" icon={Icons.back} {...back}/>
  {beforeHistory}
  <IconButton variant="table" icon={Icons.history} {...history}/>
 </div>;
}
