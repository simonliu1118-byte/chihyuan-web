/** CYWEB home-hub contract. 1 source for Worker/API and React UI. */
export type NoticeKind = "company" | "personal";
export type TodoPriority = "normal" | "important";
export interface PersonalTodo {
 id:number; title:string; detail:string; dueDate:string|null; dueTime:string|null;
 priority:TodoPriority; completedAt:string|null; createdAt:string; updatedAt:string;
}
export interface HubNotice {
 id:string; kind:NoticeKind; title:string; body:string; authorName:string;
 createdAt:string; readAt:string|null; revokedAt:string|null;
 recipientCount?:number; readCount?:number;
}
export interface HubRecipient {id:number; employeeNo:string|null; name:string;}
export interface HubReadReceipt {id:number; employeeNo:string|null; name:string; readAt:string|null;}
export interface HubReminder {
 id:string; kind:"todo"|NoticeKind; title:string; subtitle:string; sortAt:string; tier:number;
}
export interface HubReminderCounts {overdue:number; today:number; personal:number; company:number; total:number;}
export interface HubReminderPage {items:HubReminder[]; nextCursor:string|null; more:boolean; counts:HubReminderCounts;}
export interface HubSummary {
 counts:HubReminderCounts;
 todos:PersonalTodo[];
 company:HubNotice[];
 personal:HubNotice[];
}
export interface HubPage<T>{items:T[]; nextCursor:string|null; more:boolean;}
