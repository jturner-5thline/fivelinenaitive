import postgres from 'postgres';
import { detectDuplicateLenders } from '/dev-server/src/lib/lenderDuplicates';

const sql = postgres({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER, password: process.env.PGPASSWORD, database: process.env.PGDATABASE, ssl: 'require' as any });
const COMPANY = '44556c46-9127-4b12-b14e-d6fee784afcf';

const FIELDS = ['email','lender_type','loan_types','sub_debt','cash_burn','sponsorship','min_revenue','ebitda_min','min_deal','max_deal','industries','industries_to_avoid','b2b_b2c','refinancing','company_requirements','deal_structure_notes','geo','contact_name','contact_title','relationship_owners','lender_one_pager_url','referral_lender','referral_fee_offered','referral_agreement','nda','onboarded_to_flex','upfront_checklist','post_term_sheet_checklist','gift_address','contact_phone','tags','website','linkedin_url','address','phone','funding_source_notes','about_notes'];

// Pointer tables (lender FK or lender_id columns) → repoint dup → canon
const POINTERS: [string, string][] = [
  ['lender_disqualifications','master_lender_id'],
  ['lender_pass_patterns','master_lender_id'],
  ['lender_sync_requests','existing_lender_id'],
  ['lender_sync_requests','source_lender_id'],
  ['lender_contacts','lender_id'],
  ['lender_audit_logs','lender_id'],
  ['lender_notes','master_lender_id'],
  ['lender_fit_attributes','master_lender_id'],
  ['agent_runs','lender_id'],
  ['claap_meetings','matched_lender_id'],
  ['deal_lender_recommendation_exclusions','lender_id'],
  ['deal_space_notes','linked_lender_id'],
  ['lender_match_rules','lender_id'],
  ['lender_recommendation_outcomes','lender_id'],
  ['lender_recommendation_run_items','lender_id'],
  ['outstanding_items','lender_id'],
  ['pending_lender_notifications','lender_id'],
  ['tasks','lender_id'],
  ['wf_term_sheets','lender_id'],
];

function filledCount(row: any): number {
  let n = 0;
  for (const f of FIELDS) {
    const v = row[f];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    n++;
  }
  return n;
}

async function main() {
  const all = await sql<any[]>`SELECT * FROM master_lenders WHERE company_id=${COMPANY}`;
  console.log('total lenders:', all.length);
  const idx = detectDuplicateLenders(all.map(r => ({ id: r.id, name: r.name })));
  console.log('total dup groups:', idx.groups.length);

  const byId = new Map(all.map(r => [r.id, r]));
  const t3Groups: { canonical: any; dups: any[] }[] = [];
  const skipped: { groupId: string; reason: string; members: { name: string; tier: any }[] }[] = [];

  for (const g of idx.groups) {
    const members = g.memberIds.map(id => byId.get(id)).filter(Boolean);
    const tiers = members.map(m => m.tier);
    const allT3 = tiers.every(t => t === 'T3');
    if (!allT3) {
      if (tiers.some(t => t === 'T3')) {
        skipped.push({ groupId: g.groupId, reason: 'mixed tiers (T3 + other)', members: members.map(m => ({ name: m.name, tier: m.tier })) });
      }
      continue;
    }
    // pick canonical: most filled, then oldest
    const sorted = [...members].sort((a, b) => {
      const fa = filledCount(a), fb = filledCount(b);
      if (fb !== fa) return fb - fa;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const canonical = sorted[0];
    const dups = sorted.slice(1);
    t3Groups.push({ canonical, dups });
  }

  console.log('T3-only groups to merge:', t3Groups.length);
  console.log('skipped mixed-tier (containing T3):', skipped.length);

  let deleted = 0;
  let fieldUpdates = 0;

  for (const { canonical, dups } of t3Groups) {
    await sql.begin(async (tx) => {
      // 1) Field merge: fill empty fields on canonical from dups
      const updates: Record<string, any> = {};
      for (const f of FIELDS) {
        const cv = canonical[f];
        const empty = cv === null || cv === undefined || (typeof cv === 'string' && cv.trim() === '') || (Array.isArray(cv) && cv.length === 0);
        if (!empty) continue;
        for (const d of dups) {
          const dv = d[f];
          const dempty = dv === null || dv === undefined || (typeof dv === 'string' && dv.trim() === '') || (Array.isArray(dv) && dv.length === 0);
          if (!dempty) { updates[f] = dv; break; }
        }
      }
      if (Object.keys(updates).length > 0) {
        await tx`UPDATE master_lenders SET ${tx(updates)}, updated_at=now() WHERE id=${canonical.id}`;
        fieldUpdates++;
      }

      const dupIds = dups.map(d => d.id);

      // 2) Repoint all pointer tables
      for (const [table, col] of POINTERS) {
        try {
          await tx.unsafe(`UPDATE ${table} SET ${col}=$1 WHERE ${col} = ANY($2::uuid[])`, [canonical.id, dupIds]);
        } catch (e: any) {
          // Some tables may have unique constraints; try delete-then-update would be needed but rare
          console.error('repoint err', table, col, e.message);
        }
      }

      // 3) deal_lenders: rename by name (within 5th Line deals)
      const dupNames = [...new Set(dups.map(d => d.name).filter(Boolean))];
      if (dupNames.length > 0) {
        await tx`
          UPDATE deal_lenders dl SET name=${canonical.name}, updated_at=now()
          FROM deals d
          WHERE dl.deal_id=d.id AND d.company_id=${COMPANY}
            AND dl.name = ANY(${dupNames}::text[])
            AND dl.name <> ${canonical.name}
        `;
        // dedupe within same deal (keep earliest)
        await tx`
          DELETE FROM deal_lenders dl USING (
            SELECT id FROM (
              SELECT id, ROW_NUMBER() OVER (PARTITION BY deal_id, name ORDER BY created_at ASC, id ASC) rn
              FROM deal_lenders WHERE deal_id IN (SELECT id FROM deals WHERE company_id=${COMPANY})
                AND name=${canonical.name}
            ) s WHERE rn > 1
          ) dupes WHERE dl.id = dupes.id
        `;
      }

      // 4) Dedupe lender_contacts on canonical (name+email+title)
      await tx`
        DELETE FROM lender_contacts lc USING (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY lender_id, lower(coalesce(name,'')), lower(coalesce(email,'')), lower(coalesce(title,'')) ORDER BY created_at ASC, id ASC) rn
            FROM lender_contacts WHERE lender_id=${canonical.id}
          ) s WHERE rn > 1
        ) dupes WHERE lc.id = dupes.id
      `;

      // 5) Delete duplicate master_lenders
      const res = await tx`DELETE FROM master_lenders WHERE id = ANY(${dupIds}::uuid[])`;
      deleted += res.count;
    });
  }

  console.log('--- RESULTS ---');
  console.log('groups merged:', t3Groups.length);
  console.log('records deleted:', deleted);
  console.log('field updates applied:', fieldUpdates);
  console.log('skipped mixed-tier groups:', skipped.length);
  if (skipped.length > 0) {
    console.log('Skipped groups:');
    for (const s of skipped) console.log('  -', s.groupId, '|', s.members.map(m => `${m.name}[${m.tier ?? 'null'}]`).join(', '));
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
