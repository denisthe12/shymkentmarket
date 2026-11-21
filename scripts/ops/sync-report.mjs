// One-shot daily report: reads sync run files and the monitor state (read-only), sends one Telegram message.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseStateText } from './monitor-state.mjs';
import { createTelegramSender, validateTelegramConfig } from './telegram-notifier.mjs';

const RUNS_DIR = '/var/lib/aktau-sync/runs', STATE_PATH = '/var/lib/aktau-monitor/state/state.json';
const HOUR = 3600000, DAY = 24 * HOUR, AKTAU = 5 * HOUR, STUCK = 25 * 60000, STALE_MONITOR = 15 * 60000;
const FILE_NAME = /^(daily|weekly)-\d{8}T\d{6}Z\.json$/;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const hhmm = ms => new Date(ms + AKTAU).toISOString().slice(11, 16);

export function parseRunFile(text) {
  let v;
  try { v = JSON.parse(text); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.version !== 1 || !['daily', 'weekly'].includes(v.kind)
    || typeof v.startedAt !== 'string' || !Number.isFinite(Date.parse(v.startedAt)) || !['running', 'finished'].includes(v.status)
    || !(v.exitCode === null || Number.isInteger(v.exitCode)) || (v.status === 'finished' && !Number.isInteger(v.exitCode))
    || !v.stores || typeof v.stores !== 'object' || Array.isArray(v.stores)) return null;
  return v;
}

export function expectedSlots(now) {
  const slots = [], from = now - DAY, day0 = Math.floor(from / DAY) * DAY;
  for (let d = day0 - DAY; d <= now; d += DAY) {
    for (const h of [1, 13]) slots.push({ kind: 'daily', slotUTC: d + h * HOUR });
  }
  return slots.filter(s => s.slotUTC > from && s.slotUTC <= now).sort((a, b) => a.slotUTC - b.slotUTC);
}

export function pickRun(slot, runs) {
  let best;
  for (const r of runs) {
    const t = Date.parse(r?.startedAt);
    if (r?.kind !== slot.kind || !(t >= slot.slotUTC && t < slot.slotUTC + HOUR)) continue;
    if (!best || t >= Date.parse(best.startedAt)) best = r;
  }
  return best;
}

const bad = v => v !== 0;
function dailyLine(slot, run, now) {
  const t = hhmm(slot.slotUTC);
  if (!run) return `❌ ${t} — прогон не найден`;
  if (run.status === 'running') return now - Date.parse(run.startedAt) >= STUCK ? `❌ ${t} — не завершился` : `⏳ ${t} — ещё идёт`;
  const code = run.exitCode, vals = Object.values(run.stores);
  if (code === 0) return `✅ ${t} — опубликовано, ${vals.filter(v => v === 0).length}/${vals.length} сети`;
  if (code === 3) {
    const stale = Array.isArray(run.stale) && run.stale.length ? run.stale : Object.keys(run.stores).filter(k => bad(run.stores[k]));
    return `⚠️ ${t} — опубликовано, ${stale.join(', ')} из прошлого файла (скрапер упал)`;
  }
  if (code === 4) return `⚠️ ${t} — опубликовано, сбой очистки старых snapshot (код 4)`;
  if (code === 1) return vals.length > 0 && vals.every(bad) ? `❌ ${t} — не опубликовано: все скраперы упали (код 1)`
    : `❌ ${t} — не опубликовано: сбой публикации (код 1)`;
  return `❌ ${t} — не опубликовано (код ${code})`;
}
const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one
  : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
function monitorLine(now, s) {
  if (!s) return '❌ Монитор API: состояние не прочитано';
  const n = s.queue.length;
  if (s.lastUTC === null) return '⚠️ Монитор API: ещё не запускался';
  const at = hhmm(s.lastUTC);
  const tail = n > 0 ? `${n} ${plural(n, 'неотправленная', 'неотправленные', 'неотправленных')} ${plural(n, 'тревога', 'тревоги', 'тревог')}` : '';
  if (now - s.lastUTC > STALE_MONITOR) {
    const l = new Date(s.lastUTC + AKTAU), c = new Date(now + AKTAU);
    const date = l.toISOString().slice(0, 10) !== c.toISOString().slice(0, 10) ? ` (${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]})` : '';
    return `⚠️ Монитор API: не запускался с ${at}${date}${tail ? `, ${tail}` : ''}`;
  }
  if (n > 0) return `⚠️ Монитор API: ${tail}, проверка в ${at}`;
  return `${s.phase === 'OK' ? '✅' : '⚠️'} Монитор API: ${s.phase}, проверка в ${at}`;
}

export function buildReport({ now, runs, monitorState }) {
  const a = new Date(now + AKTAU);
  const lines = [`Отчёт Aktau Market · ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`];
  const slots = expectedSlots(now), pick = s => pickRun(s, runs);
  for (const s of slots.filter(x => x.kind === 'daily')) lines.push(dailyLine(s, pick(s), now));
  lines.push(monitorLine(now, monitorState));
  return lines.join('\n');
}

export async function sendReport(text, { send, attempts = 3, pauseMs = 30000, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(pauseMs);
    try { if (await send(text) === true) return true; } catch { /* counts as a failed attempt */ }
  }
  return false;
}

export async function main(args, env = {}, deps = {}) {
  const log = deps.log ?? (l => console.log(l));
  const done = (code, obj) => { log(JSON.stringify(obj)); return code; };
  if (args.length === 0 || (args.length === 1 && args[0] === '--offline')) return done(0, { outcome: 'OFFLINE' });
  if (args.length !== 1 || args[0] !== '--run') return done(2, { outcome: 'BLOCKED', reason: 'usage' });
  let send;
  try {
    const config = validateTelegramConfig({ token: env.BOT_TOKEN, admin: env.ADMIN_ID });
    send = deps.send ?? createTelegramSender(config);
  } catch { return done(2, { outcome: 'BLOCKED', reason: 'delivery_not_configured' }); }
  const dir = deps.runsDir ?? RUNS_DIR, readdir = deps.readdir ?? (p => fs.readdir(p)), readFile = deps.readFile ?? (p => fs.readFile(p, 'utf8'));
  const now = (deps.now ?? Date.now)();
  const runs = [];
  let names = [];
  try { names = await readdir(dir); } catch { /* missing directory: every slot is reported as not found */ }
  for (const name of names) {
    if (!FILE_NAME.test(name)) continue;
    try { const r = parseRunFile(await readFile(`${dir}/${name}`)); if (r) runs.push(r); } catch { /* unreadable counts as absent */ }
  }
  let monitorState = null;
  try { monitorState = parseStateText(await readFile(deps.statePath ?? STATE_PATH)); } catch { monitorState = null; }
  const text = buildReport({ now, runs, monitorState }), lines = text.split('\n').length;
  const ok = await sendReport(text, { send, sleep: deps.sleep });
  return ok ? done(0, { outcome: 'SENT', reason: null, lines }) : done(1, { outcome: 'FAILED', reason: 'delivery_failed', lines });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2), process.env);
