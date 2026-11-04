import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR, alertText, averageMs, humanDuration, judge, transition, trim, updateIncidents, uptime } from '../scripts/lib.mjs';

const site = { id: 'portfolio', name: 'Portfolio', url: 'https://example.com/', expect: 'William' };

test('a page counts as up only with a good status and the expected text', () => {
  assert.deepEqual(judge(site, { status: 200, body: '<title>William Chan</title>' }), { ok: true, reason: null });
  assert.equal(judge(site, { status: 503, body: '' }).reason, 'HTTP 503');
  assert.equal(judge(site, { status: 200, body: 'Index of /' }).ok, false); // host's default page
  assert.equal(judge(site, { error: 'timed out after 15s' }).reason, 'timed out after 15s');
  assert.equal(judge({ ...site, expect: undefined }, { status: 301, body: '' }).ok, true);
});

test('uptime and average response time cover only the window asked for', () => {
  const now = 10 * DAY;
  const history = [
    { t: now - 2 * DAY, ok: false, ms: 0 }, // outside 24 h, inside 7 d
    { t: now - 3 * HOUR, ok: true, ms: 200 },
    { t: now - 2 * HOUR, ok: false, ms: 0 },
    { t: now - 1 * HOUR, ok: true, ms: 400 },
    { t: now, ok: true, ms: 300 },
  ];
  assert.equal(uptime(history, now, DAY), 75);
  assert.equal(uptime(history, now, 7 * DAY), 60);
  assert.equal(averageMs(history, now, DAY), 300);
  assert.equal(uptime([], now, DAY), null);
});

test('history older than a week is dropped', () => {
  const now = 30 * DAY;
  const kept = trim([{ t: now - 8 * DAY }, { t: now - 6 * DAY }, { t: now }], now);
  assert.equal(kept.length, 2);
});

test('only real changes of state raise an alert', () => {
  assert.equal(transition(undefined, false), null); // first ever check: no alert
  assert.equal(transition(true, true), null);
  assert.equal(transition(true, false), 'down');
  assert.equal(transition(false, true), 'up');
});

test('incidents open when a site goes down and close when it comes back', () => {
  let log = updateIncidents([], site, 'down', 1000, 'HTTP 503');
  assert.deepEqual(log[0], { site: 'portfolio', name: 'Portfolio', start: 1000, end: null, reason: 'HTTP 503' });
  log = updateIncidents(log, site, null, 2000, null);
  assert.equal(log[0].end, null);
  log = updateIncidents(log, site, 'up', 5000, null);
  assert.equal(log[0].end, 5000);
});

test('durations and alert messages read naturally', () => {
  assert.equal(humanDuration(30 * 1000), '1 min');
  assert.equal(humanDuration(80 * 60 * 1000), '1 h 20 min');
  assert.equal(humanDuration(52 * HOUR), '2 d 4 h');
  assert.equal(alertText(site, 'down', { reason: 'HTTP 503' }), '🔴 Portfolio is down (HTTP 503)\nhttps://example.com/');
  assert.equal(alertText(site, 'up', { downSince: 0, now: 12 * 60 * 1000 }), '✅ Portfolio is back up after 12 min\nhttps://example.com/');
});
