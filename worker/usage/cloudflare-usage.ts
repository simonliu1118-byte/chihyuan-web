import { aggregateD1Usage, type D1AnalyticsGroup, type D1UsageReport } from "../../shared/cloudflare-usage";

export interface UsageCloudflareEnv {
  CF_ACCOUNT_ID?: string;
  CF_USAGE_API_TOKEN?: string;
}
export class CloudflareUsageError extends Error {
  constructor(readonly code: "USAGE_NOT_CONFIGURED" | "USAGE_UNAVAILABLE") {
    super(code);
  }
}
type UsageCache = Pick<Cache,"match"|"put">;
type Fetcher = typeof fetch;
export interface UsageFetchOptions {
  fetchImpl?: Fetcher;
  cache?: UsageCache | null;
  now?: Date;
}
const D1_GRAPHQL = `query D1Usage($accountTag: string!, $start: Date, $end: Date) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: {date_geq: $start, date_leq: $end}, orderBy: [date_DESC]) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date databaseId }
      }
    }
  }
}`;
function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function jsonResponse(response: Response): Promise<Record<string,unknown>> {
  if(!response.ok)throw new CloudflareUsageError("USAGE_UNAVAILABLE");
  const json:unknown=await response.json();
  if(!isObj(json) || (Array.isArray(json.errors) && json.errors.length) || json.success === false)
    throw new CloudflareUsageError("USAGE_UNAVAILABLE");
  return json;
}
function dateDays(now: Date, days: number) {
  const end=now.toISOString().slice(0,10);
  const start=new Date(Date.parse(end+"T00:00:00.000Z") - (days-1)*86_400_000).toISOString().slice(0,10);
  return {start,end};
}
/** Read-only Cloudflare Analytics + account-wide D1 list. No D1 bindings are accessed. */
export async function fetchD1Usage(env: UsageCloudflareEnv, days: number, options: UsageFetchOptions = {}): Promise<D1UsageReport> {
  if(!env.CF_ACCOUNT_ID || !env.CF_USAGE_API_TOKEN)throw new CloudflareUsageError("USAGE_NOT_CONFIGURED");
  if(!Number.isInteger(days) || days<1 || days>31)throw new CloudflareUsageError("USAGE_UNAVAILABLE");
  const now=options.now??new Date();
  const cache=options.cache === undefined ? (typeof caches !== "undefined" ? caches.default : null) : options.cache;
  const key=new Request("https://usage-cache.invalid/d1?days="+days+"&utcDate="+now.toISOString().slice(0,10));
  if(cache) {
    try {const hit=await cache.match(key);if(hit?.ok)return await hit.json() as D1UsageReport;} catch { /* Cache is best-effort. */ }
  }
  const deadline=new AbortController();
  const timeout=setTimeout(()=>deadline.abort(),10_000);
  try {
    const fetcher=options.fetchImpl??fetch;
    const headers={authorization:"Bearer "+env.CF_USAGE_API_TOKEN};
    const {start,end}=dateDays(now,days);
    const graph=await jsonResponse(await fetcher("https://api.cloudflare.com/client/v4/graphql",{
      method:"POST",headers:{...headers,"content-type":"application/json"},signal:deadline.signal,
      body:JSON.stringify({query:D1_GRAPHQL,variables:{accountTag:env.CF_ACCOUNT_ID,start,end}})
    }));
    const viewer=graph.data;
    if(!isObj(viewer) || !isObj(viewer.viewer) || !Array.isArray(viewer.viewer.accounts)
        || viewer.viewer.accounts.length!==1 || !isObj(viewer.viewer.accounts[0]))
      throw new CloudflareUsageError("USAGE_UNAVAILABLE");
    const groups=viewer.viewer.accounts[0].d1AnalyticsAdaptiveGroups;
    if(!Array.isArray(groups) || groups.length>=10_000)throw new CloudflareUsageError("USAGE_UNAVAILABLE");
    const names:Record<string,string>={};
    for(let page=1;page<=100;page++){
      const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/d1/database?per_page=100&page=${page}`;
      const listing=await jsonResponse(await fetcher(url,{headers,signal:deadline.signal}));
      if(!Array.isArray(listing.result))throw new CloudflareUsageError("USAGE_UNAVAILABLE");
      for(const item of listing.result) {
        if(isObj(item)&&typeof item.uuid==="string" && typeof item.name==="string")names[item.uuid]=item.name;
      }
      if(listing.result.length<100)break;
      if(page===100)throw new CloudflareUsageError("USAGE_UNAVAILABLE");
    }
    const report=aggregateD1Usage(groups as D1AnalyticsGroup[],names,days,now);
    if(cache) {
      try {await cache.put(key,new Response(JSON.stringify(report),{headers:{"content-type":"application/json","cache-control":"public, max-age=600"}}));}
      catch { /* An unavailable Cache API must not suppress the report. */ }
    }
    return report;
  } catch {
    throw new CloudflareUsageError("USAGE_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
