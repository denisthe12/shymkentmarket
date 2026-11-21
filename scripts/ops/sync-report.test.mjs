import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRunFile, expectedSlots, pickRun, buildReport, sendReport, main } from './sync-report.mjs';
import { parseStateText } from './monitor-state.mjs';

const TUE = Date.UTC(2026, 10, 10, 13, 30), MON = Date.UTC(2026, 10, 16, 13, 30);
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const D = (day, h, m = 0, s = 1) => Date.UTC(2026, 10, day, h, m, s);
const daily = (startMs, over = {}) => ({ version: 1, kind: 'daily', startedAt: iso(startMs), finishedAt: iso(startMs + 600000), status: 'finished',
  exitCode: 0, published: true, stores: { magnum: 0, store_a: 0, store_b: 0, store_c: 0 }, stale: [], retention: 'ok', ...over });
const weekly = (startMs, over = {}) => ({ version: 1, kind: 'weekly', startedAt: iso(startMs), finishedAt: iso(startMs + 600000), status: 'finished',
  exitCode: 0, published: false, stores: { magnum: 0, store_a: 0, store_b: 0 }, scopeFailed: [], ...over });
const okState = lastUTC => ({ version: 2, phase: 'OK', failures: 0, lastUTC, queue: [] });
const q = n => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(32, 'a'), type: i % 2 ? 'incident_recovered' : 'incident_opened', atUTC: 1, attempts: 1 }));
const one = (now, runs, monitorState = okState(now - 3 * 60000)) => buildReport({ now, runs, monitorState }).split('\n');
const slot13 = over => one(TUE, [daily(D(10, 1)), daily(D(10, 13), over)])[2];

test('Tuesday example', () => {
  const runs = [daily(D(10, 1)), daily(D(10, 13))];
  assert.equal(buildReport({ now: TUE, runs, monitorState: okState(Date.UTC(2026, 10, 10, 13, 27)) }),
    ['Отчёт Aktau Market · 10 ноября', '✅ 06:00 — опубликовано, 4/4 сети', '✅ 18:00 — опубликовано, 4/4 сети',
      '✅ Монитор API: OK, проверка в 18:27'].join('\n'));
});
test('Monday example', () => {
  const runs = [daily(D(16, 1), { exitCode: 3, stores: { magnum: 0, store_a: 1, store_b: 0, store_c: 0 }, stale: ['store_a'] }),
    daily(D(16, 13), { exitCode: 1, published: false, retention: null })];
  const st = { version: 2, phase: 'OK', failures: 0, lastUTC: Date.UTC(2026, 10, 16, 13, 27), queue: q(2) };
  assert.equal(buildReport({ now: MON, runs, monitorState: st }),
    ['Отчёт Aktau Market · 16 ноября', '⚠️ 06:00 — опубликовано, store_a из прошлого файла (скрапер упал)',
      '❌ 18:00 — не опубликовано: сбой публикации (код 1)',
      '⚠️ Монитор API: 2 неотправленные тревоги, проверка в 18:27'].join('\n'));
});
test('late report next day uses slots relative to now', () => {
  assert.deepEqual(expectedSlots(Date.UTC(2026, 10, 11, 2, 0)),
    [{ kind: 'daily', slotUTC: Date.UTC(2026, 10, 10, 13) }, { kind: 'daily', slotUTC: Date.UTC(2026, 10, 11, 1) }]);
});
test('expectedSlots has only daily slots (no weekly full scrape)', () => {
  assert.equal(expectedSlots(MON).filter(s => s.kind !== 'daily').length, 0);
  assert.deepEqual(expectedSlots(MON).map(s => s.slotUTC), [D(16, 1, 0, 0), D(16, 13, 0, 0)]);
});
test('daily rows', () => {
  assert.equal(slot13(), '✅ 18:00 — опубликовано, 4/4 сети');
  assert.equal(slot13({ exitCode: 3, stale: ['store_a', 'store_c'], stores: { magnum: 0, store_a: 1, store_b: 0, store_c: 1 } }), '⚠️ 18:00 — опубликовано, store_a, store_c из прошлого файла (скрапер упал)');
  assert.equal(slot13({ exitCode: 4, retention: 'failed' }), '⚠️ 18:00 — опубликовано, сбой очистки старых snapshot (код 4)');
  assert.equal(slot13({ exitCode: 1, published: false, stores: { magnum: 1, store_a: 1, store_b: 2, store_c: 1 } }), '❌ 18:00 — не опубликовано: все скраперы упали (код 1)');
  assert.equal(slot13({ exitCode: 1, published: false, stores: { magnum: 1, store_a: 0, store_b: 1, store_c: 1 } }), '❌ 18:00 — не опубликовано: сбой публикации (код 1)');
  assert.equal(slot13({ exitCode: 7 }), '❌ 18:00 — не опубликовано (код 7)');
});
test('running rows', () => {
  const run = ageMin => ({ status: 'running', finishedAt: null, exitCode: null, retention: null, startedAt: iso(TUE - ageMin * 60000) });
  assert.equal(one(TUE, [daily(D(10, 1)), daily(D(10, 13), run(25))])[2], '❌ 18:00 — не завершился');
  assert.equal(one(TUE, [daily(D(10, 1)), daily(D(10, 13), run(24))])[2], '⏳ 18:00 — ещё идёт');
});
test('missing row', () => {
  assert.equal(one(TUE, [daily(D(10, 1))])[2], '❌ 18:00 — прогон не найден');
});
test('monitor rows and plurals', () => {
  const last = l => l.at(-1), fresh = TUE - 3 * 60000;
  assert.equal(last(one(TUE, [], okState(fresh))), '✅ Монитор API: OK, проверка в 18:27');
  const withQ = n => last(one(TUE, [], { ...okState(fresh), queue: q(n) }));
  assert.equal(withQ(1), '⚠️ Монитор API: 1 неотправленная тревога, проверка в 18:27');
  assert.equal(withQ(2), '⚠️ Монитор API: 2 неотправленные тревоги, проверка в 18:27');
  assert.equal(withQ(5), '⚠️ Монитор API: 5 неотправленных тревог, проверка в 18:27');
  assert.equal(withQ(10), '⚠️ Монитор API: 10 неотправленных тревог, проверка в 18:27');
  assert.equal(last(one(TUE, [], okState(TUE - 50 * 60000))), '⚠️ Монитор API: не запускался с 17:40');
  assert.equal(last(one(TUE, [], { version: 2, phase: 'INCIDENT', failures: 2, lastUTC: fresh, queue: [] })), '⚠️ Монитор API: INCIDENT, проверка в 18:27');
  assert.equal(last(one(TUE, [], null)), '❌ Монитор API: состояние не прочитано');
});
test('phase INCIDENT with empty queue is a warning', () => {
  const l = one(TUE, [], { version: 2, phase: 'DEGRADED', failures: 1, lastUTC: TUE - 60000, queue: [] }).at(-1);
  assert.equal(l, '⚠️ Монитор API: DEGRADED, проверка в 18:29');
});
test('v1 latched monitor state is read', () => {
  const v1 = { version: 1, phase: 'INCIDENT', failures: 2, lastUTC: 1792869347441, pending: { id: 'a'.repeat(32), type: 'incident_opened', atUTC: 1792869347441, nextAttemptUTC: 1792869407441, attempts: 1, manualReconciliation: true } };
  const st = parseStateText(JSON.stringify(v1) + '\n');
  // lastUTC is stale (25 Oct): staleness wins, the queue count is a suffix.
  assert.equal(one(TUE, [], st).at(-1), '⚠️ Монитор API: не запускался с 00:15 (25 октября), 1 неотправленная тревога');
});
test('stale monitor with queued alerts: staleness first, date only on another Aktau day', () => {
  const last = l => l.at(-1);
  const st = (lastUTC, n) => ({ version: 2, phase: 'INCIDENT', failures: 2, lastUTC, queue: q(n) });
  assert.equal(last(one(TUE, [], st(TUE - 50 * 60000, 2))), '⚠️ Монитор API: не запускался с 17:40, 2 неотправленные тревоги');
  assert.equal(last(one(TUE, [], st(Date.UTC(2026, 10, 9, 9, 5), 5))), '⚠️ Монитор API: не запускался с 14:05 (9 ноября), 5 неотправленных тревог');
  // 19:30 UTC on the 9th is 00:30 on the 10th in Aktau: same Aktau day as now, so no date.
  assert.equal(last(one(TUE, [], st(Date.UTC(2026, 10, 9, 19, 30), 1))), '⚠️ Монитор API: не запускался с 00:30, 1 неотправленная тревога');
});
test('manual rerun inside the slot hour wins', () => {
  const runs = [daily(D(10, 1)), daily(D(10, 13), { exitCode: 1, published: false, stores: { magnum: 1, store_a: 0, store_b: 0, store_c: 0 } }), daily(D(10, 13, 20, 0))];
  assert.equal(one(TUE, runs)[2], '✅ 18:00 — опубликовано, 4/4 сети');
});
test('pickRun: other kind or outside hour is ignored', () => {
  const slot = { kind: 'daily', slotUTC: D(10, 13, 0, 0) };
  assert.equal(pickRun(slot, [weekly(D(10, 13))]), undefined);
  assert.equal(pickRun(slot, [daily(D(10, 14, 0, 0))]), undefined);
  assert.equal(pickRun(slot, [daily(D(10, 12, 59, 59))]), undefined);
  assert.ok(pickRun(slot, [daily(D(10, 13, 59, 59))]));
});
test('parseRunFile validates shape', () => {
  assert.ok(parseRunFile(JSON.stringify(daily(D(10, 1)))));
  assert.equal(parseRunFile('{"version":1'), null);
  assert.equal(parseRunFile('[]'), null);
  assert.equal(parseRunFile(JSON.stringify({ ...daily(D(10, 1)), version: 2 })), null);
  assert.equal(parseRunFile(JSON.stringify({ ...daily(D(10, 1)), startedAt: 'nope' })), null);
  assert.equal(parseRunFile(JSON.stringify({ ...daily(D(10, 1)), status: 'weird' })), null);
});
test('sendReport retries three times 30 s apart then fails', async () => {
  const sleeps = []; let n = 0;
  assert.equal(await sendReport('x', { send: async () => { n++; return false; }, sleep: async ms => { sleeps.push(ms); } }), false);
  assert.equal(n, 3); assert.deepEqual(sleeps, [30000, 30000]);
  const s2 = []; let k = 0;
  assert.equal(await sendReport('x', { send: async () => ++k === 2, sleep: async ms => { s2.push(ms); } }), true);
  assert.deepEqual(s2, [30000]);
  assert.equal(await sendReport('x', { send: async () => { throw Error('boom'); }, sleep: async () => {} }), false);
});

const env = { BOT_TOKEN: '123456789:' + 'S'.repeat(35), ADMIN_ID: '123456789' };
const harness = (files, state, over = {}) => {
  const out = [], sent = [];
  const deps = { now: () => TUE, log: l => out.push(l), sleep: async () => {},
    readdir: async () => { if (files === null) throw Object.assign(Error('x'), { code: 'ENOENT' }); return Object.keys(files); },
    readFile: async p => {
      const name = p.split('/').pop();
      if (name === 'state.json') { if (state === null) throw Error('ENOENT'); return state; }
      return files[name];
    },
    send: async t => { sent.push(t); return true; }, ...over };
  return { deps, out, sent };
};
test('main offline does no I/O', async () => {
  const boom = async () => { throw Error('io'); };
  const h = harness({}, null, { readdir: boom, readFile: boom, send: boom });
  assert.equal(await main([], {}, h.deps), 0);
  assert.equal(await main(['--offline'], {}, h.deps), 0);
  assert.deepEqual(h.out, ['{"outcome":"OFFLINE"}', '{"outcome":"OFFLINE"}']);
});
test('main --run sends report, prints only fixed JSON, ignores foreign names', async () => {
  const files = { 'daily-20261110T010001Z.json': JSON.stringify(daily(D(10, 1))), 'daily-20261110T130001Z.json': JSON.stringify(daily(D(10, 13))),
    '.tmp-daily-x.json': '{"version":1', 'notes.txt': 'secret', 'daily-bad.json': JSON.stringify(daily(D(10, 13), { exitCode: 9 })) };
  const h = harness(files, JSON.stringify(okState(Date.UTC(2026, 10, 10, 13, 27))) + '\n');
  assert.equal(await main(['--run'], env, h.deps), 0);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].split('\n')[2], '✅ 18:00 — опубликовано, 4/4 сети');
  assert.deepEqual(h.out, ['{"outcome":"SENT","reason":null,"lines":4}']);
});
test('missing runs dir and invalid file still produce a report', async () => {
  for (const files of [null, { 'daily-20261110T130001Z.json': '{"version":1' }]) {
    const h = harness(files, null);
    assert.equal(await main(['--run'], env, h.deps), 0);
    const lines = h.sent[0].split('\n');
    assert.equal(lines[1], '❌ 06:00 — прогон не найден');
    assert.equal(lines[2], '❌ 18:00 — прогон не найден');
    assert.equal(lines[3], '❌ Монитор API: состояние не прочитано');
  }
});
test('main maps failures and missing config; never prints secrets', async () => {
  let h = harness({}, null, { send: async () => false });
  assert.equal(await main(['--run'], env, h.deps), 1);
  assert.deepEqual(h.out, ['{"outcome":"FAILED","reason":"delivery_failed","lines":4}']);
  h = harness({}, null);
  assert.equal(await main(['--run'], {}, h.deps), 2);
  assert.deepEqual(h.out, ['{"outcome":"BLOCKED","reason":"delivery_not_configured"}']);
  assert.equal(h.sent.length, 0);
  h = harness({}, null);
  assert.equal(await main(['--bogus'], env, h.deps), 2);
  assert.ok(!h.out.join('').includes(env.BOT_TOKEN));
});
