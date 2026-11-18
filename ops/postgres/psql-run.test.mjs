import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("live operator commands do not expand credentials into psql argv", () => {
  for (const path of [
    "ops/sync/README.md", "ops/postgres/README.md",
    "ops/postgres/import-price-history.sql", "ops/postgres/szpt/offer_price_basis_check.sql",
    "ops/postgres/szpt/szpt_members_explain.sql", "backend-go/internal/postgres/szpt_explain_test.go",
  ]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\bpsql\s+[^\n]*\$\{?\w*(?:URL|DSN|PASSWORD)/i, path);
  }
});

test("fixed psql operation keeps credentials out of argv and preserves pstdin", () => {
  const dir = mkdtempSync(join(tmpdir(), "psql-run-test-"));
  try {
    const capture = join(dir, "capture.json");
    writeFileSync(join(dir, "psql"), `#!/bin/sh
exec "${process.execPath}" -e 'const fs=require("node:fs");fs.writeFileSync(process.env.CAPTURE,JSON.stringify({args:process.argv.slice(1),pg:Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith("PG"))),stdin:fs.readFileSync(0).toString("hex")}));process.stderr.write(process.env.PGPASSWORD);process.exit(Number(process.env.STUB_EXIT||0));' -- "$@"
`, { mode: 0o700 });
    const password = "fixture-only@password";
    const uri = `postgresql://owner:${encodeURIComponent(password)}@localhost:5433/catalog?sslmode=verify-full&sslrootcert=%2Ffixture%2Froot.crt&channel_binding=require`;
    const csv = Buffer.from("a,b\r\n1,2\r\n");
    const env = { PATH: dir + ":" + process.env.PATH, CAPTURE: capture, DATABASE_URL: uri,
      API_DATABASE_URL: uri.replace("//owner:", "//reader:"), PGHOSTADDR: "192.0.2.1",
      PGSERVICE: "other", PGOPTIONS: "-c search_path=unexpected" };
    function launch(args, extra = {}) {
      const p = spawnSync(process.execPath, ["ops/postgres/psql-run.mjs", ...args],
        { env: { ...env, ...extra }, input: csv, encoding: "utf8" });
      assert.ok(!((p.stderr ?? "") + (p.stdout ?? "")).includes(password), "credential in diagnostics");
      return p;
    }
    assert.equal(launch(["import-price-history"]).status, 0);
    const row = JSON.parse(readFileSync(capture, "utf8"));
    assert.deepEqual(row.args.slice(0, 5), ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f"]);
    assert.equal(row.args.length, 6);
    assert.ok(row.args[5].endsWith("/ops/postgres/import-price-history.sql"));
    assert.equal(row.stdin, csv.toString("hex"));
    assert.deepEqual(row.pg, { PGHOST: "localhost", PGPORT: "5433", PGUSER: "owner",
      PGPASSWORD: password, PGDATABASE: "catalog", PGCONNECT_TIMEOUT: "15",
      PGSSLMODE: "verify-full", PGSSLROOTCERT: "/fixture/root.crt", PGCHANNELBINDING: "require" });
    assert.equal(launch(["szpt-explain"]).status, 0);
    assert.equal(JSON.parse(readFileSync(capture, "utf8")).pg.PGUSER, "reader");
    const failed = launch(["import-price-history"], { STUB_EXIT: "3" });
    assert.equal(failed.status, 3);
    assert.match(failed.stderr, /psql_operation_failed/);
    for (const value of ["", "not-a-uri", uri + "&hostaddr=192.0.2.1", uri + "&sslmode=invalid", uri + "&sslmode=require"]) {
      const rejected = launch(["import-price-history"], { DATABASE_URL: value });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /psql_configuration_rejected/);
    }
    assert.equal(launch(["import-price-history", uri]).status, 1);
    assert.equal(launch(["szpt-explain"], { API_DATABASE_URL: "" }).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
