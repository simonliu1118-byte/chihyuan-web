import assert from "node:assert/strict";
import test from "node:test";
import { verifyProgramCatalogSchedule } from "./verify-program-catalog-schedule.mjs";
const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CF_WORKER_NAME:"synthetic-worker",CLOUDFLARE_API_TOKEN:"synthetic-token"};
test("protected schedule verification uses one fixed-origin GET and checks backup isolation",async()=>{
  for(const backup of [false,true]) {
    let calls=0;
    const result=await verifyProgramCatalogSchedule({env:{...env,CF_BACKUP_SCHEDULE_ENABLED:String(backup)},fetcher:async(url,init)=>{
      calls++;assert.equal(new URL(url).origin,"https://api.cloudflare.com");assert.equal(init.method,"GET");assert.equal(init.redirect,"manual");
      assert.equal(init.headers.Authorization,"Bearer synthetic-token");
      return Response.json({success:true,result:{schedules:[{cron:"0 19 * * *"},...(backup?[{cron:"30 19 * * *"}]:[])]}});
    }});
    assert.deepEqual(result,{dailyCatalogSchedule:true,backupSchedule:backup});assert.equal(calls,1);
  }
});
test("missing, duplicated or unintended schedules fail closed",async()=>{
  for(const crons of [[],["30 19 * * *"],["0 19 * * *","0 19 * * *"],["0 19 * * *","30 19 * * *"]]) {
    await assert.rejects(verifyProgramCatalogSchedule({env,fetcher:async()=>Response.json({success:true,result:{schedules:crons.map(cron=>({cron}))}})}),/PROGRAM_SCHEDULE_MISMATCH/);
  }
});
test("provider and network errors expose stable codes only, without retry or credential/body leakage",async()=>{
  for(const fetcher of [async()=>new Response("sensitive provider body",{status:403}),async()=>{throw Error("sensitive credential");},async()=>new Response("invalid")]) {
    let calls=0;await assert.rejects(verifyProgramCatalogSchedule({env,fetcher:(...args)=>{calls++;return fetcher(...args);}}),error=>error.message==="PROGRAM_SCHEDULE_READ_FAILED");assert.equal(calls,1);
  }
  await assert.rejects(verifyProgramCatalogSchedule({env:{...env,CF_WORKER_NAME:"https://untrusted.test"},fetcher:()=>{throw Error("must not fetch");}}),/PROGRAM_SCHEDULE_INPUT_INVALID/);
});
