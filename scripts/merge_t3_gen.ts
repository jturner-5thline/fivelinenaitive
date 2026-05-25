import postgres from 'postgres';
import { detectDuplicateLenders } from '../src/lib/lenderDuplicates';

const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: 'require' as any });
const COMPANY = '44556c46-9127-4b12-b14e-d6fee784afcf';

const FIELDS = ['email','lender_type','loan_types','sub_debt','cash_burn','sponsorship','min_revenue','ebitda_min','min_deal','max_deal','industries','industries_to_avoid','b2b_b2c','refinancing','company_requirements','deal_structure_notes','geo','contact_name','contact_title','relationship_owners','lender_one_pager_url','referral_lender','referral_fee_offered','referral_agreement','nda','onboarded_to_flex','upfront_checklist','post_term_sheet_checklist','gift_address','contact_phone','tags','website','linkedin_url','address','phone','funding_source_notes','about_notes'];

const POINTERS: [string,string][] = [
  ['lender_disqualifications','master_lender_id'],['lender_pass_patterns','master_lender_id'],
  ['lender_sync_requests','existing_lender_id'],['lender_sync_requests','source_lender_id'],
  ['lender_contacts','lender_id'],['lender_audit_logs','lender_id'],
  ['lender_notes','master_lender_id'],['lender_fit_attributes','master_lender_id'],
  ['agent_runs','lender_id'],['claap_meetings','matched_lender_id'],
  ['deal_lender_recommendation_exclusions','lender_id'],['deal_space_notes','linked_lender_id'],
  ['lender_match_rules','lender_id'],['lender_recommendation_outcomes','lender_id'],
  ['lender_recommendation_run_items','lender_id'],['outstanding_items','lender_id'],
  ['pending_lender_notifications','lender_id'],['tasks','lender_id'],['wf_term_sheets','lender_id'],
];

function filled(row:any){let n=0;for(const f of FIELDS){const v=row[f];if(v==null)continue;if(typeof v==='string'&&v.trim()==='')continue;if(Array.isArray(v)&&v.length===0)continue;n++}return n;}
function isEmpty(v:any){return v==null||(typeof v==='string'&&v.trim()==='')||(Array.isArray(v)&&v.length===0);}
function lit(v:any):string{
  if(v==null)return 'NULL';
  if(typeof v==='boolean')return v?'true':'false';
  if(typeof v==='number')return String(v);
  if(Array.isArray(v))return `ARRAY[${v.map(x=>lit(x)).join(',')}]::text[]`;
  if(v instanceof Date)return `'${v.toISOString()}'::timestamptz`;
  if(typeof v==='object')return `'${JSON.stringify(v).replace(/'/g,"''")}'::jsonb`;
  return `'${String(v).replace(/'/g,"''")}'`;
}

const all = await sql<any[]>`SELECT * FROM master_lenders WHERE company_id=${COMPANY}`;
const idx = detectDuplicateLenders(all.map(r=>({id:r.id,name:r.name})));
const byId = new Map(all.map(r=>[r.id,r]));

const t3: {canonical:any;dups:any[]}[] = [];
const skipped: {groupId:string;members:{name:string;tier:any}[]}[] = [];
for(const g of idx.groups){
  const m = g.memberIds.map(id=>byId.get(id)).filter(Boolean);
  const tiers = m.map(x=>x.tier);
  if(!tiers.every(t=>t==='T3')){
    if(tiers.some(t=>t==='T3')) skipped.push({groupId:g.groupId, members:m.map(x=>({name:x.name,tier:x.tier}))});
    continue;
  }
  const sorted=[...m].sort((a,b)=>{const fa=filled(a),fb=filled(b);if(fa!==fb)return fb-fa;return new Date(a.created_at).getTime()-new Date(b.created_at).getTime();});
  t3.push({canonical:sorted[0],dups:sorted.slice(1)});
}

const lines: string[] = ['BEGIN;'];
for(const {canonical,dups} of t3){
  const dupIdsArr = `ARRAY[${dups.map(d=>`'${d.id}'`).join(',')}]::uuid[]`;
  const dupNamesArr = `ARRAY[${[...new Set(dups.map(d=>d.name).filter(Boolean))].map(n=>`'${n.replace(/'/g,"''")}'`).join(',')}]::text[]`;

  // field merge
  const sets:string[]=[];
  for(const f of FIELDS){
    if(!isEmpty(canonical[f]))continue;
    for(const d of dups){if(!isEmpty(d[f])){sets.push(`${f}=${lit(d[f])}`);break;}}
  }
  if(sets.length>0) lines.push(`UPDATE master_lenders SET ${sets.join(', ')}, updated_at=now() WHERE id='${canonical.id}';`);

  // repoint
  for(const [t,c] of POINTERS){
    lines.push(`UPDATE ${t} SET ${c}='${canonical.id}' WHERE ${c} = ANY(${dupIdsArr});`);
  }

  // deal_lenders rename + dedupe
  if(dups.some(d=>d.name)){
    lines.push(`UPDATE deal_lenders dl SET name='${canonical.name.replace(/'/g,"''")}', updated_at=now() FROM deals d WHERE dl.deal_id=d.id AND d.company_id='${COMPANY}' AND dl.name = ANY(${dupNamesArr}) AND dl.name <> '${canonical.name.replace(/'/g,"''")}';`);
    lines.push(`DELETE FROM deal_lenders dl USING (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY deal_id, name ORDER BY created_at ASC, id ASC) rn FROM deal_lenders WHERE deal_id IN (SELECT id FROM deals WHERE company_id='${COMPANY}') AND name='${canonical.name.replace(/'/g,"''")}') s WHERE rn>1) x WHERE dl.id=x.id;`);
  }

  // dedupe contacts
  lines.push(`DELETE FROM lender_contacts lc USING (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY lender_id, lower(coalesce(name,'')), lower(coalesce(email,'')), lower(coalesce(title,'')) ORDER BY created_at ASC, id ASC) rn FROM lender_contacts WHERE lender_id='${canonical.id}') s WHERE rn>1) x WHERE lc.id=x.id;`);

  // delete dups
  lines.push(`DELETE FROM master_lenders WHERE id = ANY(${dupIdsArr});`);
}
lines.push('COMMIT;');

await Bun.write('/tmp/merge_t3.sql', lines.join('\n'));
await Bun.write('/tmp/merge_t3_report.json', JSON.stringify({groups:t3.length, deleted:t3.reduce((s,g)=>s+g.dups.length,0), skipped, t3_clusters: t3.map(g=>({canonical:g.canonical.name, dups:g.dups.map(d=>d.name)}))}, null, 2));
console.log('groups:', t3.length, 'to_delete:', t3.reduce((s,g)=>s+g.dups.length,0), 'skipped:', skipped.length);
await sql.end();
