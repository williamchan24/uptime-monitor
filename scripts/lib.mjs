// The parts of the monitor that don't touch the network or the disk, so they're easy to test.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** Keep a week of checks per site (2,016 at one every 5 minutes). */
export const KEEP = 7 * DAY;

/**
 * Decide whether one HTTP response counts as "up".
 * Up means a 2xx/3xx status and, if the site lists an `expect` phrase, that phrase is in the page
 * (catches a host's error page or a blank page that still returns 200).
 */
export function judge(site, { status, body, error }) {
  if (error) return { ok: false, reason: error };
  if (status < 200 || status >= 400) return { ok: false, reason: `HTTP ${status}` };
  if (site.expect && !String(body ?? '').includes(site.expect)) {
    return { ok: false, reason: `“${site.expect}” missing from the page` };
  }
  return { ok: true, reason: null };
}

/** Drop checks older than the keep window. */
export function trim(history, now, keep = KEEP) {
  return history.filter((h) => now - h.t <= keep);
}

/** Share of checks that were up within the window, as a percentage (null when there are none). */
export function uptime(history, now, window) {
  const inWindow = history.filter((h) => now - h.t <= window);
  if (inWindow.length === 0) return null;
  const up = inWindow.filter((h) => h.ok).length;
  return Math.round((up / inWindow.length) * 10000) / 100;
}

/** Average response time of the successful checks in the window, in ms. */
export function averageMs(history, now, window) {
  const ok = history.filter((h) => h.ok && now - h.t <= window);
  if (ok.length === 0) return null;
  return Math.round(ok.reduce((sum, h) => sum + h.ms, 0) / ok.length);
}

/** Has the site just gone down or come back? null when nothing changed (or it's the first check). */
export function transition(previousOk, nowOk) {
  if (previousOk === undefined || previousOk === null || previousOk === nowOk) return null;
  return nowOk ? 'up' : 'down';
}

/**
 * Keep the incident log in step with a transition:
 * going down opens an incident, coming back up closes the open one.
 */
export function updateIncidents(incidents, site, change, now, reason) {
  if (change === 'down') {
    return [{ site: site.id, name: site.name, start: now, end: null, reason }, ...incidents].slice(0, 50);
  }
  if (change === 'up') {
    return incidents.map((i) => (i.site === site.id && i.end === null ? { ...i, end: now } : i));
  }
  return incidents;
}

/** "3 min", "1 h 20 min", "2 d 4 h" */
export function humanDuration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
}

/** The Telegram message for a change of state. */
export function alertText(site, change, { reason, downSince, now }) {
  if (change === 'down') return `🔴 ${site.name} is down (${reason})\n${site.url}`;
  const lasted = downSince != null ? ` after ${humanDuration(now - downSince)}` : '';
  return `✅ ${site.name} is back up${lasted}\n${site.url}`;
}
