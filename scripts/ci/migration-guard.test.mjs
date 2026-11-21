import assert from 'node:assert/strict';
import test from 'node:test';
import { REPLACED_MIGRATIONS, SHYMKENT_BASELINE, migrationDiffArgs, migrationDiffProblem } from './migration-guard.mjs';

const dir = 'backend/prisma/migrations';
const added = name => `A\t${dir}/${name}/migration.sql`;
const deleted = name => `D\t${dir}/${name}/migration.sql`;
const allDeleted = REPLACED_MIGRATIONS.map(deleted);

test('the replaced list holds the twelve inherited migrations', () => {
  assert.equal(REPLACED_MIGRATIONS.length, 12);
  assert.equal(REPLACED_MIGRATIONS[0], '20260923000000_init');
  assert.equal(SHYMKENT_BASELINE, '20261122000000_shymkent_baseline');
});

test('only added migrations pass', () => {
  assert.equal(migrationDiffProblem([added('20270101000000_next')]), null);
  assert.equal(migrationDiffProblem([]), null);
});

test('replacing all inherited migrations by the baseline passes', () => {
  assert.equal(migrationDiffProblem([...allDeleted, added(SHYMKENT_BASELINE)]), null);
});

test('deleting without the baseline fails', () => {
  assert.match(migrationDiffProblem(allDeleted), /baseline/);
});

test('deleting only eleven of twelve fails', () => {
  assert.notEqual(migrationDiffProblem([...allDeleted.slice(1), added(SHYMKENT_BASELINE)]), null);
});

test('deleting a migration outside the list fails', () => {
  assert.equal(migrationDiffProblem([deleted('20250101000000_other')]), 'existing migration modified/deleted');
});

test('modifying the baseline fails', () => {
  assert.notEqual(migrationDiffProblem([`M\t${dir}/${SHYMKENT_BASELINE}/migration.sql`]), null);
});

test('renames fail', () => {
  assert.notEqual(migrationDiffProblem([`R100\t${dir}/${REPLACED_MIGRATIONS[0]}/migration.sql\t${dir}/${SHYMKENT_BASELINE}/migration.sql`]), null);
});

test('deleting the lock file fails', () => {
  assert.notEqual(migrationDiffProblem([...allDeleted, added(SHYMKENT_BASELINE), `D\t${dir}/migration_lock.toml`]), null);
});

test('a stray file under the baseline dir does not count as the baseline', () => {
  assert.match(migrationDiffProblem([...allDeleted, `A	${dir}/${SHYMKENT_BASELINE}/notes.txt`]), /baseline/);
});

test('the git diff disables rename detection', () => {
  const args = migrationDiffArgs('a'.repeat(40));
  assert.ok(args.includes('--no-renames'));
  assert.ok(args.indexOf('--no-renames') < args.indexOf('--'));
});
