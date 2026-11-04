// Visit every site in sites.json once, record the result, and alert on Telegram when one goes
// down or comes back. GitHub Actions runs this every 5 minutes; run it yourself with `npm run check`.
//
// Writes into DATA_DIR (default ./data):
//   status.json    the latest state of every site, with 24 h and 7 d uptime and recent checks (the page reads this)
//   history.json   every check from the last 7 days, per site
//   incidents.json the last 50 outages
//
// Telegram alerts need two environment variables (GitHub secrets in the workflow):
//   TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Without them, the check still runs and just skips alerts.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DAY, alertText, averageMs, judge, transition, trim, updateIncidents, uptime } from './lib.mjs';

const DATA_DIR = process.env.DATA_DIR || 'data';
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 5_000;
const RECENT = 60; // checks shown as the bar on the page (5 hours at 5-minute checks)

const config = JSON.parse(await readFile('sites.json', 'utf8'));
const readJson = async (file, fallback) => {
  try { return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')); } catch { return fallback; }
};

/** One request: status, body (for the `expect` check) and how long it took. */
async function visit(url) {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'uptime-monitor (+https://github.com/' + config.repo + ')', 'Cache-Control': 'no-cache' },
    });
    const body = await res.text();
    return { status: res.status, body, ms: Math.round(performance.now() - started) };
  } catch (err) {
    const error = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (err.cause?.code || err.message);
    return { error, ms: Math.round(performance.now() - started) };
  }
}

/** Check a site; a failure gets one retry a few seconds later, so a single blip doesn't page you. */
async function check(site) {
  let res = await visit(site.url);
  let verdict = judge(site, res);
  if (!verdict.ok) {
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    res = await visit(site.url);
    verdict = judge(site, res);
  }
  return { ok: verdict.ok, ms: res.ms, code: res.status ?? null, reason: verdict.reason };
}

async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const now = Date.now();
const history = await readJson('history.json', {});
const previous = await readJson('status.json', { sites: [] });
let incidents = await readJson('incidents.json', []);
const prevOk = Object.fromEntries(previous.sites.map((s) => [s.id, s.ok]));

const results = await Promise.all(config.sites.map(async (site) => ({ site, result: await check(site) })));

const sites = [];
for (const { site, result } of results) {
  const list = trim([...(history[site.id] ?? []), { t: now, ok: result.ok, ms: result.ms, code: result.code }], now);
  history[site.id] = list;

  const change = transition(prevOk[site.id], result.ok);
  const openIncident = incidents.find((i) => i.site === site.id && i.end === null);
  if (change) {
    const sent = await telegram(alertText(site, change, { reason: result.reason, downSince: openIncident?.start, now }));
    console.log(`${change === 'down' ? 'DOWN' : 'UP  '} ${site.name}${sent ? ' (alert sent)' : ''}`);
  }
  incidents = updateIncidents(incidents, site, change ?? (prevOk[site.id] === undefined && !result.ok ? 'down' : null), now, result.reason);

  sites.push({
    id: site.id,
    name: site.name,
    url: site.url,
    ok: result.ok,
    ms: result.ms,
    code: result.code,
    reason: result.reason,
    uptime24h: uptime(list, now, DAY),
    uptime7d: uptime(list, now, 7 * DAY),
    avgMs24h: averageMs(list, now, DAY),
    recent: list.slice(-RECENT).map(({ t, ok, ms }) => ({ t, ok, ms })),
  });
  console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${String(result.ms).padStart(5)} ms  ${site.name}${result.reason ? `  (${result.reason})` : ''}`);
}

await mkdir(DATA_DIR, { recursive: true });
await writeFile(join(DATA_DIR, 'status.json'), JSON.stringify({ title: config.title, checkedAt: now, sites }, null, 1));
await writeFile(join(DATA_DIR, 'history.json'), JSON.stringify(history));
await writeFile(join(DATA_DIR, 'incidents.json'), JSON.stringify(incidents, null, 1));
