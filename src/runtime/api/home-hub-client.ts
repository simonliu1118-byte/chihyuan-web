import {apiRequest} from "../../api/client";
import type {HubSummary,HubReminderPage,HubNotice,HubRecipient,HubReadReceipt,HubPage,PersonalTodo,NoticeKind,TodoPriority} from "../../../shared/home-hub";
export const HUB_UPDATED_EVENT="cyweb:hub-updated";
export function signalHubUpdated(){window.dispatchEvent(new Event(HUB_UPDATED_EVENT))}
export const getHomeSummary=()=>apiRequest<HubSummary>("/api/hub/summary");
export const getHubReminders=(before?:string,limit=5)=>{
 const url=new URLSearchParams({limit:String(limit)});
 if(before)url.set("before",before);
 return apiRequest<HubReminderPage>("/api/hub/reminders?"+url);
};
export const getTodos=(status:"open"|"done",before?:string)=>apiRequest<HubPage<PersonalTodo>>("/api/hub/todos?"+new URLSearchParams({status,...before?{before}:{}}));
export const getTodo=(id:number)=>apiRequest<PersonalTodo>("/api/hub/todos/"+id);
export const saveTodo=(input:{title:string;detail:string;dueDate:string|null;dueTime:string|null;priority:TodoPriority},id?:number)=>apiRequest<PersonalTodo>("/api/hub/todos"+(id?"/"+id:""),{method:id?"PATCH":"POST",json:input});
export const setTodoCompleted=(id:number,completed:boolean)=>apiRequest<PersonalTodo>("/api/hub/todos/"+id,{method:"PATCH",json:{completed}});
export const deleteTodo=(id:number)=>apiRequest<{deleted:true}>("/api/hub/todos/"+id,{method:"DELETE"});
export const getNotices=(kind:NoticeKind,mode:"inbox"|"sent",before?:string)=>{
 const params=new URLSearchParams({kind,mode});if(before)params.set("before",before);
 return apiRequest<HubPage<HubNotice>>("/api/hub/notices?"+params);
};
export const getNotice=(id:string)=>apiRequest<HubNotice>("/api/hub/notices/"+encodeURIComponent(id));
export const getNoticeRecipients=()=>apiRequest<HubRecipient[]>("/api/hub/recipients");
export const sendNotice=(kind:NoticeKind,title:string,body:string,recipients:number[])=>
 apiRequest<HubNotice>("/api/hub/notices",{method:"POST",json:{kind,title,body,recipients}});
export const markNoticeRead=(id:string)=>apiRequest<{read:true}>("/api/hub/notices/"+id+"/read",{method:"POST",json:{}});
export const revokeNotice=(id:string)=>apiRequest<{revoked:true}>("/api/hub/notices/"+id+"/revoke",{method:"POST",json:{}});
export const getNoticeReadReceipts=(id:string)=>apiRequest<HubReadReceipt[]>("/api/hub/notices/"+id+"/receipts");
