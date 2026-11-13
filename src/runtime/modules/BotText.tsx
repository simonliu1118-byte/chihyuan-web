import type {ReactNode} from "react";
/** Plain text with line breaks kept and http(s) links clickable; nothing is parsed as HTML. */
export function BotText({text}:{text:string}){
 const parts:ReactNode[]=[];let last=0;
 for(const m of text.matchAll(/https?:\/\/[^\s<>()（）]+/g)){
  parts.push(text.slice(last,m.index));
  parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer">{m[0]}</a>);
  last=(m.index??0)+m[0].length;
 }
 parts.push(text.slice(last));
 return <div className="cy-bot-rich">{parts}</div>;
}

