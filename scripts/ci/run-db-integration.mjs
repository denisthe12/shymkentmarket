import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root, env } from './common.mjs';
import { postgres } from './postgres.mjs';

await postgres(async ({ url, sql, login, load, go }) => {
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration',
    '-run', '^(TestDestructiveTargetGuard|TestDeterministicCatalog|TestDeterministicSzpt|TestBootstrapFailsClosed)$', '-v'], {
    TEST_DATABASE_URL: url('part04_fixture'), TEST_API_DATABASE_URL: url('part04_fixture', 'part04_api_login'),
  });
  go(['test', '-count=1', '-race', '-tags=integration', './internal/postgres', '-run', '^TestLocalProductionIdentity$', '-v'], {
    PART10_ADMIN_DATABASE_URL: url('part10_security'), PART10_DISPOSABLE_CONFIRM: '1',
  });
  login('aktau_api_runtime', 'aktau_api_reader');
  for (const db of ['part04_security', 'part08', 'part11_recovery']) load(db);
  go(['test', '-count=1', '-race', '-tags=integration', './internal/ingestion', '-run', '^TestLocalTxBatchAtomicity$', '-v'], {
    TEST_INGEST_ADMIN_DATABASE_URL: url('part08'),
  });
  sql('part08', "INSERT INTO snapshots(id) VALUES('fixture-unpublished');");
  sql('part08', readFileSync(join(root, 'backend/prisma/security/aktau_ingest_writer_role.sql')));
  login('part08_api', 'aktau_api_reader'); login('part08_writer', 'aktau_ingest_writer');
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration', '-run', '^TestLocalSnapshotSecurity$', '-v'], {
    SNAPSHOT_SECURITY_DATABASE_URL: url('part08'), SNAPSHOT_SECURITY_READER_URL: url('part08', 'part08_api'),
    SNAPSHOT_SECURITY_WRITER_URL: url('part08', 'part08_writer'), SNAPSHOT_ROLLBACK_CONFIRM: '1',
  });
  go(['test', '-count=1', '-race', '-tags=integration', './internal/postgres',
    '-run', '^(TestLocalPhysicalPoolSessionPolicy|TestLocalClonePlans|TestLocalObservability|TestLocalCanceledQuery)$', '-v'], {
    POOL_POLICY_DATABASE_URL: url('part04_security', 'part04_api_login'),
    SMOKE_DATABASE_URL: url('part04_security', 'part04_api_login'),
    PART11_OPERATOR_DATABASE_URL: url('part11_recovery'), PART11_READER_DATABASE_URL: url('part11_recovery', 'aktau_api_runtime'),
  });
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration', '-run', '^TestCloneRestrictedSecurity$', '-v'], {
    SMOKE_DATABASE_URL: url('part04_security', 'part04_api_login'),
  });
  sql('part13_retention', readFileSync(join(root, 'ops/postgres/security/aktau_retention_writer_role.sql')));
  sql('part13_retention', readFileSync(join(root, 'ops/postgres/security/aktau_retention_price_history_access.sql')));
  login('part13_retention_login', 'aktau_retention_writer');
  go(['test', '-count=1', '-race', '-tags=integration', './internal/retention', '-run', '^TestLocalRetention', '-v'], {
    TEST_RETENTION_ADMIN_DATABASE_URL: url('part13_retention'),
    TEST_RETENTION_WRITER_DATABASE_URL: url('part13_retention', 'part13_retention_login'),
  });
  // Access-only rollback must be executable: remove the LOGIN member first, then drop the group.
  sql('part13_retention', 'DROP ROLE part13_retention_login;');
  sql('part13_retention', readFileSync(join(root, 'ops/postgres/security/rollback_aktau_retention_price_history_access.sql')));
  sql('part13_retention', readFileSync(join(root, 'ops/postgres/security/rollback_aktau_retention_writer_access.sql')));
  if (sql('part13_retention', "SELECT to_regrole('aktau_retention_writer') IS NULL;") !== 't') {
    throw new Error('retention rollback left aktau_retention_writer behind');
  }
  // part08 has already dropped the writer role, so it is created again here, in its own database.
  sql('part14_identities', readFileSync(join(root, 'backend/prisma/security/aktau_ingest_writer_role.sql')));
  sql('part14_identities', readFileSync(join(root, 'ops/postgres/security/aktau_ingest_product_identities_access.sql')));
  login('part14_writer', 'aktau_ingest_writer');
  go(['test', '-count=1', '-race', '-tags=integration', './internal/ingestion', '-run', '^TestLocalIdentity', '-v'], {
    TEST_IDENTITY_ADMIN_DATABASE_URL: url('part14_identities'),
    TEST_IDENTITY_WRITER_DATABASE_URL: url('part14_identities', 'part14_writer'),
  });
  sql('part14_identities', 'DROP ROLE part14_writer;');
  sql('part14_identities', readFileSync(join(root, 'ops/postgres/security/rollback_aktau_ingest_product_identities_access.sql')));
  sql('part14_identities', readFileSync(join(root, 'backend/prisma/security/rollback_aktau_ingest_writer_access.sql')));
  if (sql('part14_identities', "SELECT to_regrole('aktau_ingest_writer') IS NULL;") !== 't') {
    throw new Error('identity rollback left aktau_ingest_writer behind');
  }
});


// Emergency reader rollback (operator tool, never run on production by CI) on a database with every
// migration and the ingest writer's policies, as in production. Own container: aktau_api_reader is a
// cluster-wide role and the container above grants it in every database, so DROP ROLE could not pass there.
await postgres(async ({ name, sql, login, load }) => {
  const db = 'part04_reader_rollback';
  const rollback = readFileSync(join(root, 'backend/prisma/security/rollback_aktau_api_reader_access.sql'));
  load(db);
  sql(db, readFileSync(join(root, 'backend/prisma/security/aktau_ingest_writer_role.sql')));
  login('part04_rollback_api', 'aktau_api_reader');
  const counts = `SELECT string_agg(t || '=' || n, ',' ORDER BY t) FROM (
    SELECT 'stores' t, count(*) n FROM stores UNION ALL SELECT 'store_locations', count(*) FROM store_locations
    UNION ALL SELECT 'categories', count(*) FROM categories UNION ALL SELECT 'raw_products', count(*) FROM raw_products
    UNION ALL SELECT 'canonical_products', count(*) FROM canonical_products UNION ALL SELECT 'product_mappings', count(*) FROM product_mappings
    UNION ALL SELECT 'offers', count(*) FROM offers UNION ALL SELECT 'snapshots', count(*) FROM snapshots
    UNION ALL SELECT 'offer_price_basis', count(*) FROM offer_price_basis) x;`;
  const readerState = `SELECT (SELECT count(*) FROM pg_policy WHERE polname = 'aktau_api_reader_select') || ',' ||
    (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace) || ',' ||
    has_table_privilege('aktau_api_reader', 'offer_price_basis', 'SELECT');`;
  const before = sql(db, counts);
  if (sql(db, readerState) !== '6,23,true') throw new Error('reader rollback fixture is not the production policy layout');
  // A runtime LOGIN member is still present: the guard must refuse, and the whole transaction rolls back.
  const refused = spawnSync('docker', ['exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-qAt'],
    { env, input: rollback, encoding: 'utf8', timeout: 60_000 });
  if (refused.status === 0 || !/Remove runtime members/.test(refused.stderr)) throw new Error('reader rollback did not refuse a runtime member');
  if (sql(db, readerState) !== '6,23,true') throw new Error('refused reader rollback was not atomic');
  sql(db, 'DROP ROLE part04_rollback_api;');
  sql(db, rollback);
  if (sql(db, "SELECT to_regrole('aktau_api_reader') IS NULL;") !== 't') throw new Error('reader rollback left aktau_api_reader behind');
  if (sql(db, "SELECT (SELECT count(*) FROM pg_policy WHERE polname = 'aktau_api_reader_select') || ',' || (SELECT count(*) FROM pg_policy WHERE polname LIKE 'aktau_ingest_writer_%');") !== '0,17') {
    throw new Error('reader rollback removed the wrong policies');
  }
  if (sql(db, counts) !== before) throw new Error('reader rollback changed data');
  // The role bootstrap must apply again after the rollback.
  sql(db, readFileSync(join(root, 'backend/prisma/security/aktau_api_reader_role.sql')));
  if (sql(db, "SELECT NOT rolcanlogin FROM pg_roles WHERE rolname = 'aktau_api_reader';") !== 't') throw new Error('reader role did not re-apply');
  console.log(`reader rollback: PASS (${before})`);
}, ['part04_reader_rollback']);
