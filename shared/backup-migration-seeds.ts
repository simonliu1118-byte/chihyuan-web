// Canonical migration fixtures shared by the portable Worker restore guard and
// the protected Node deployment recovery provisioner. Never loosen these
// predicates without updating the canonical migration source and test fixtures.
// This module does not contain production data.
export const MIGRATION_SEEDS: Record<string, { count: number; predicate: string }> = {
  hr_stores:{count:1,predicate:"id=1 AND name='志遠高雄門市' AND sort_order=0 AND is_active=1 AND cycle_anchor_date='2026-09-28' AND rules_template=''"},
  hr_job_titles:{count:5,predicate:"(id=1 AND name='店長' AND sort_order=1) OR (id=2 AND name='門市' AND sort_order=2) OR (id=3 AND name='業務' AND sort_order=3) OR (id=4 AND name='美編' AND sort_order=4) OR (id=5 AND name='兼職' AND sort_order=5)"},
  hr_shift_types:{count:6,predicate:"(id=1 AND code='早' AND start_time='09:00' AND end_time='17:30' AND normal_minutes=480) OR (id=2 AND code='晚' AND start_time='12:30' AND end_time='21:00' AND normal_minutes=480) OR (id=3 AND code='日' AND start_time='10:30' AND end_time='19:00' AND normal_minutes=480) OR (id=4 AND code='A' AND normal_minutes=240) OR (id=5 AND code='B' AND normal_minutes=240) OR (id=6 AND code='C' AND normal_minutes=240)"},
  hr_leave_types:{count:18,predicate:["特","事","病","生","婚","喪","產","檢","陪","家","公","傷","颱","國","補","換","獎","院"].map((code,i)=>"(id="+(i+1)+" AND code='"+code+"' AND sort_order="+(i+1)+" AND is_active="+(code==="換"?0:1)+" AND is_statutory="+(i<12||code==="院"?1:0)+")").join(" OR ")}
};
/** True only if this table contains an operator row, a mutated seed, or extra rows.
 * SQL identifiers come solely from audited sqlite_master table names or
 * the static backup table whitelist, never untrusted user input.
 */
export function nonSeedRowCondition(table: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(table)) throw Error("RECOVERY_SCHEMA_INVALID");
  const name = '"' + table + '"';
  const seed = MIGRATION_SEEDS[table];
  return seed
    ? `((SELECT COUNT(*) FROM ${name}) != ${seed.count} OR EXISTS(SELECT 1 FROM ${name} WHERE NOT ((${seed.predicate}) IS TRUE)))`
    : `EXISTS(SELECT 1 FROM ${name})`;
}
