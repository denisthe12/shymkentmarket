# Voice session dependency unavailable

> **INHERITED_REFERENCE — Aktau operations.** The VPS and provider guidance below is an Aktau reference. Use local fixtures for Shymkent tests. See [Shymkent local diagnostics](README.md).

## General rules (local and VPS)

Symptoms: session get/set/delete failures and controlled Voice503. Catalog GET
and DB readiness must remain available. Inspect fixed session_dependency
operation/outcome_class/error_code and duration, not Redis keys, session IDs,
session payloads or full provider errors. Check private Upstash endpoint/token
configuration and connectivity with approved isolated session smoke only.
Never print tokens or provider bodies.

No in-memory production fallback, PostgreSQL session persistence or catalog
cache dependency. Keep TTL600 and hashed internal keys unchanged. If credential
rotation is needed use [rotation](secret-rotation.md); do not change semantics.
Recovery: isolated SET EX600/GET/DEL and direct+clarification→continue smoke,
followed by catalog200/ready200. Real provider calls require scoped authorization;
Part11 tests use fake providers and make none.

## VPS

Upstash is used only for Voice sessions; catalog, dashboard and `ready` do not
depend on it, so the API monitor does not alert on a Redis outage. Check with a
Voice clarification → continue smoke. No Redis-specific alerting or runtime
fallback is installed.
