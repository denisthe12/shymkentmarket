// Migration immutability rule with a one-time exception: the inherited migration
// history may be replaced, in a single change, by the Shymkent baseline.
export const SHYMKENT_BASELINE = '20261122000000_shymkent_baseline';
export const REPLACED_MIGRATIONS = Object.freeze([
  '20260923000000_init',
  '20261004000000_rls_runtime_access',
  '20261005000000_snapshot_history',
  '20261006000000_catalog_taxonomy',
  '20261021000000_scrum19_milk_taxonomy',
  '20261102000000_store_anvar_enum',
  '20261102000100_store_anvar_rows',
  '20261102000200_anvar_taxonomy',
  '20261107000000_price_history',
  '20261107000100_product_identities',
  '20261114000000_offer_price_basis',
  '20261116000000_szpt_phase3_taxonomy',
]);

const PROBLEM = 'existing migration modified/deleted';
// Rename detection would turn the baseline into `R<score>` lines the guard rejects.
export const migrationDiffArgs = base => ['diff', '--name-status', '--no-renames', base, '--', 'backend/prisma/migrations'];
const migrationDir = /^backend\/prisma\/migrations\/([^/]+)\/[^/]+$/;

// Takes `git diff --name-status` lines; returns a problem description or null.
export function migrationDiffProblem(nameStatusLines) {
  const added = new Set();
  const deleted = new Set();
  for (const line of nameStatusLines.filter(Boolean)) {
    const [status, path] = line.split('\t');
    const dir = migrationDir.exec(path ?? '')?.[1];
    if (status === 'A') { if (dir && path === `backend/prisma/migrations/${dir}/migration.sql`) added.add(dir); continue; }
    if (status === 'D' && dir && REPLACED_MIGRATIONS.includes(dir)) { deleted.add(dir); continue; }
    return PROBLEM;
  }
  if (deleted.size === 0) return null;
  if (deleted.size !== REPLACED_MIGRATIONS.length) return `${PROBLEM}: the replacement must delete all ${REPLACED_MIGRATIONS.length} inherited migrations`;
  if (!added.has(SHYMKENT_BASELINE)) return `${PROBLEM}: deletion requires the added ${SHYMKENT_BASELINE} baseline`;
  return null;
}
