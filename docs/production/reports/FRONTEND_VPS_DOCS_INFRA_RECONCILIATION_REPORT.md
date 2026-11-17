# Frontend VPS documentation and infrastructure reconciliation

Read-only checks on 2026-11-18 confirmed that GitHub main and both healthy VPS images had revision `34654678857ceabf6d68f968eac2c586dcb88909`. The live Frontend reported Next.js 16.4.5 and BUILD_ID `GzGLeOMZnFUIglDm2u-Dn`. Both connectors were active and HTTPS www redirected with 308 to the apex. AUTO_DEPLOY_ENABLED was false. No production mutations were made. This PR changes repository source and documentation only.

The installed Frontend unit matched the retained overlay SHA256 `964352e5bcbac02b5542dbf4d8c324abc24242c2732e909507bc5c3df2bfff6a`. The installed Compose SHA256 was `eb940ea811638311397e7325c179e2a433b99c3cc13a71ed15dae149c59f6b26`. The template takes the chosen release SHA as an input rather than pinning the prior release. Dockerfile and ignore rules come from the qualified overlay. Next config adds standalone without replacing the current config. The build helper exports committed Frontend bytes and only passes the existing public allowlist.

| Documentation | Reconciliation |
|---|---|
| Root README, docs index, Frontend README | VPS Docker hosting and operational links replace current Vercel statements |
| Go deployment and Frontend ops | Record the observed release and rollback references |
| Revalidation | Document protected VPS runtime HMAC and the existing signed flush helper |
| Roadmap, Part 17, network perimeter, activation checklist, Cloudflare ops, Frontend handoff | Preserve historical claims with a current runbook pointer |
| Dated reports and design plans | Preserve dated evidence. Follow the current [Frontend runbook](../FRONTEND_VPS_DEPLOYMENT.md) and [release inventory](../../../deploy/README.md#current-release) |
| Frontend VPS runbook | Track build, transfer, verification and rollback steps |

The tracked inventory included 158 Markdown paths, with 116 keyword matches. The final PR commit, hosted CI and packaging results are captured independently after publication to avoid a self-referential commit hash.
