import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const frontend = resolve(import.meta.dirname, '..');
const git = args => execFileSync('git', ['-C', frontend, ...args], { encoding: 'utf8' }).trim();
const sha = git(['rev-parse', 'HEAD']);
if (git(['status', '--porcelain', '--untracked-files=no'])) throw Error('Build requires clean tracked files');
if (sha !== git(['rev-parse', 'origin/main'])) throw Error('Build must use fresh origin/main');
const env = parseEnv(readFileSync(resolve(process.argv.slice(2).find(arg => arg !== '--dry-run') || resolve(frontend, '.env')), 'utf8'));
if (env.NEXT_PUBLIC_API_MODE !== 'http' || env.NEXT_PUBLIC_API_BASE_URL !== 'https://api.aktau.market' ||
    env.API_BASE_URL !== 'https://api.aktau.market' || env.NEXT_PUBLIC_SITE_URL !== 'https://aktau.market' ||
    !/^G-[A-Z0-9]+$/.test(env.NEXT_PUBLIC_GA_ID || '') || !/^[1-9][0-9]*$/.test(env.NEXT_PUBLIC_YANDEX_METRIKA_ID || '')) throw Error('Invalid public production settings');
const keys = ['NEXT_PUBLIC_API_MODE','NEXT_PUBLIC_API_BASE_URL','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_GA_ID','NEXT_PUBLIC_YANDEX_METRIKA_ID'];
const hash = createHash('sha256');
for (const f of ['Dockerfile','.dockerignore','next.config.ts']) hash.update(f).update(readFileSync(resolve(frontend,f)));
const overlay = hash.digest('hex');
const tag = 'aktau-market-frontend:' + sha;
const args = ['build','--platform','linux/amd64','--label','org.opencontainers.image.revision='+sha,
  '--label','aktau.frontend.deployment-config-sha256='+overlay,'-t',tag];
for (const k of keys) args.push('--build-arg',k+'='+env[k]);

if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({sha,tag,overlay,publicBuildKeys:keys,privateBuildKeys:[]})); }
else {
 const existing = spawnSync('docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}', tag], { encoding: 'utf8' });
 if (existing.status !== 0) throw Error('Docker image inventory unavailable');
 if (existing.stdout.split('\n').includes(tag)) throw Error('Release tag already exists');
 const context = mkdtempSync(resolve(tmpdir(), 'aktau-frontend-'));
 try {
   const archive = execFileSync('git', ['-C', frontend, 'archive', 'HEAD:frontend'], { maxBuffer: 64 * 1024 * 1024 });
   execFileSync('tar', ['-xf', '-', '-C', context], { input: archive });
   const result = spawnSync('docker', [...args, context], { stdio: 'inherit' });
   if (result.error) throw Error('Docker startup failed');
   process.exitCode = result.status ?? 1;
 } finally {
   rmSync(context, { recursive: true, force: true });
 }
}
