import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './common.mjs';
import { postgres } from './postgres.mjs';

await postgres(async ({ url, sql, login, load, go }) => {
  go(['test', '-count=1', '-race', '-tags=integration', './tests/integration',
    '-run', '^(TestDestructiveTargetGuard|TestDeterministicCatalog|TestBootstrapFailsClosed)$', '-v'], {
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
    '-run', '^(TestLocalPhysicalPoolSessionPolicy|TestLocalClonePlans|TestLocalObservability)$', '-v'], {
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
  sql('part14_identities', 'DROP ROLE part14_writer;');
  sql('part14_identities', readFileSync(join(root, 'ops/postgres/security/rollback_aktau_ingest_product_identities_access.sql')));
  sql('part14_identities', readFileSync(join(root, 'backend/prisma/security/rollback_aktau_ingest_writer_access.sql')));
  if (sql('part14_identities', "SELECT to_regrole('aktau_ingest_writer') IS NULL;") !== 't') {
    throw new Error('identity rollback left aktau_ingest_writer behind');
  }
});

