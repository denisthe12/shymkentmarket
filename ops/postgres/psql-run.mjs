import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const operations = new Map([
  ["import-price-history", ["DATABASE_URL", "./import-price-history.sql"]],
  ["backfill-product-identities", ["DATABASE_URL", "./backfill-product-identities.sql"]],
  ["offer-price-basis-check", ["DATABASE_URL", "./szpt/offer_price_basis_check.sql"]],
  ["szpt-explain", ["API_DATABASE_URL", "./szpt/szpt_members_explain.sql"]],
]);

const parameters = new Map([
  ["sslmode", ["PGSSLMODE", /^(disable|allow|prefer|require|verify-ca|verify-full)$/]],
  ["sslrootcert", ["PGSSLROOTCERT", /^[^\x00-\x1f\x7f]+$/]],
  ["channel_binding", ["PGCHANNELBINDING", /^(disable|prefer|require)$/]],
  ["connect_timeout", ["PGCONNECT_TIMEOUT", /^[1-9]\d{0,8}$/]],
]);

function connectionEnv(name) {
  const raw = process.env[name];
  if (!raw || /[\x00-\x20\x7f]/.test(raw) || raw.includes("#")) throw Error();
  const uri = new URL(raw);
  if (!["postgresql:", "postgres:"].includes(uri.protocol) ||
      !/^(?:[a-zA-Z0-9._-]+|\[[a-fA-F0-9:.]+\])$/.test(uri.hostname) ||
      (uri.port && (Number(uri.port) < 1 || Number(uri.port) > 65535))) throw Error();

  const decode = value => {
    const result = decodeURIComponent(value);
    if (!result || /[\x00-\x1f\x7f]/.test(result)) throw Error();
    return result;
  };
  if (!/^\/[^/]+$/.test(uri.pathname)) throw Error();

  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith("PG") && !/DATABASE_URL$/.test(key) && key !== "DIRECT_URL"));
  Object.assign(env, {
    PGHOST: uri.hostname.replace(/^\[|\]$/g, ""),
    PGPORT: uri.port || "5432",
    PGUSER: decode(uri.username),
    PGPASSWORD: decode(uri.password),
    PGDATABASE: decode(uri.pathname.slice(1)),
    PGCONNECT_TIMEOUT: "15",
  });
  const seen = new Set();
  for (const [key, value] of uri.searchParams) {
    const parameter = parameters.get(key);
    if (!parameter || seen.has(key) || !parameter[1].test(value)) throw Error();
    seen.add(key);
    env[parameter[0]] = value;
  }
  return env;
}

function main(args) {
  const operation = operations.get(args[0]);
  let env;
  try {
    if (!operation || args.length !== 1) throw Error();
    env = connectionEnv(operation[0]);
  } catch {
    console.error("psql_configuration_rejected");
    return 1;
  }
  const script = fileURLToPath(new URL(operation[1], import.meta.url));
  const result = spawnSync("psql", ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", script], {
    env, stdio: ["inherit", "inherit", "ignore"],
  });
  if (result.status !== 0) console.error(result.error ? "psql_start_failed" : "psql_operation_failed");
  return result.status ?? 1;
}

process.exitCode = main(process.argv.slice(2));
