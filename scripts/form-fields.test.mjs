import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";

// PROJECT_RULES §5; no exclusion list: all data-entry forms must use shared fields.
function sources(dir){
 return readdirSync(dir).flatMap(name=>{
  const file=join(dir,name);
  return statSync(file).isDirectory()?sources(file):file.endsWith(".tsx")?[file]:[];
 });
}
function openingEnd(text,start){
 let braces=0,quote="",escaped=false;
 for(let i=start;i<text.length;i++){
  const ch=text[i];
  if(quote){if(escaped){escaped=false;continue}if(ch==="\\"){escaped=true;continue}if(ch===quote)quote="";continue}
  if(ch==='"'||ch==="'"||ch==="`"){quote=ch;continue}
  if(ch==="{")braces++;else if(ch==="}")braces--;else if(ch===">"&&braces===0)return i+1;
 }
 throw new Error("Unclosed form tag");
}
test("every non-search form uses shared fields, never native labels or obsolete form grid",()=>{
 const failures=[];
 for(const filepath of sources("src")){
  // Shared form infrastructure itself is not a business form.
  if(filepath.replaceAll("\\","/").startsWith("src/ui/forms/"))continue;
  const text=readFileSync(filepath,"utf8");
  for(const m of text.matchAll(/<form\b[\s\S]*?<\/form>/g)){
   const form=m[0],head=form.slice(0,openingEnd(form,0));
   if(/\brole=["']search["']/.test(head))continue;
   const content=form.slice(head.length,-7),line=text.slice(0,m.index).split("\n").length;
   if(/<label\b/.test(content))failures.push(`${filepath}:${line} has native <label> — use Field or CheckField`);
   if(/cy-op-form-grid/.test(form))failures.push(`${filepath}:${line} uses cy-op-form-grid — use FormSection`);
   if(!/\b(?:FormSection|FieldFrame|Field|CheckField)\b/.test(content))failures.push(`${filepath}:${line} has no shared field or FormSection`);
  }
 }
 assert.deepEqual(failures,[],"Use Field, CheckField and FormSection; no exceptions:\n"+failures.join("\n"));
});
