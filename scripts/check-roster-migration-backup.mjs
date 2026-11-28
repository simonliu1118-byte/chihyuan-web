import {pathToFileURL} from "node:url";
const TARGETS=["0086_hr_holiday_note.sql","0087_hr_roster_text.sql"];
export async function checkRosterMigrationBackup(query,workspace,now=new Date()){
 const applied=await query("SELECT name FROM d1_migrations ORDER BY name",[]);
 const names=new Set(applied.map(r=>r.name));
 if(TARGETS.every(n=>names.has(n)))return "already-applied";
 if(!names.has("0085_bot_patrol_status.sql"))throw Error("ROSTER_MIGRATION_BASELINE_REQUIRED");
 if(!workspace)throw Error("ROSTER_BACKUP_SCOPE_REQUIRED");
 // The catalog records a copy as verified only after its stored content has passed verification.
 // Require a recent verified copy for this workspace; never emit its object key or contents.
 const cutoff=new Date(now.getTime()-48*3600_000).toISOString();
 const rows=await query("SELECT EXISTS(SELECT 1 FROM backup_sets s JOIN backup_copies c ON c.backup_id=s.backup_id WHERE s.workspace_scope=? AND s.status_code='verified' AND c.status_code='verified' AND s.created_at>=? AND s.created_at<=? AND c.verified_at IS NOT NULL AND length(s.data_sha256)=64 AND s.data_byte_length>0) AS verified",[workspace,cutoff,now.toISOString()]);
 if(rows.length!==1||Number(rows[0].verified)!==1)throw Error("ROSTER_RECENT_VERIFIED_BACKUP_REQUIRED");
 return "verified-catalog";
}
async function main(){
 const e=process.env;
 if(!/^[a-f0-9]{32}$/i.test(e.CLOUDFLARE_ACCOUNT_ID??"")||!/^[a-f0-9-]{36}$/i.test(e.CF_D1_DATABASE_ID??"")||!e.CLOUDFLARE_API_TOKEN)throw Error("ROSTER_BACKUP_INPUT_REQUIRED");
 const query=async(sql,params)=>{
  const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+e.CLOUDFLARE_ACCOUNT_ID+"/d1/database/"+e.CF_D1_DATABASE_ID+"/query",{method:"POST",headers:{Authorization:"Bearer "+e.CLOUDFLARE_API_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const json=await response.json();
  if(!response.ok||!json.success||json.result?.length!==1||!json.result[0].success||!Array.isArray(json.result[0].results))throw Error("ROSTER_BACKUP_QUERY_FAILED");
  return json.result[0].results;
 };
 const status=await checkRosterMigrationBackup(query,e.CF_IDENTITY_WORKSPACE_ID);
 console.log("ROSTER_MIGRATION_BACKUP_"+(status==="already-applied"?"NOT_REQUIRED":"CATALOG_VERIFIED"));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(/^ROSTER_[A-Z_]+$/.test(e?.message??"")?e.message:"ROSTER_BACKUP_CHECK_FAILED");process.exitCode=1});
