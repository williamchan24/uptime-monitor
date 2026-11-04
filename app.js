// Status page: reads the latest results and draws them. On GitHub Pages the results come from the
// repo's `data` branch (the checker pushes there every 5 minutes); locally they come from ./data.
const config = await fetch('sites.json').then((r) => r.json());
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
const DATA = local ? './data/' : `https://raw.githubusercontent.com/${config.repo}/data/`;

const $ = (id) => document.getElementById(id);
const fmtPct = (n) => (n == null ? '–' : `${n % 1 === 0 ? n : n.toFixed(2)}%`);
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const duration = (ms) => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function load() {
  try {
    const bust = `?t=${Date.now()}`;
    const [status, incidents] = await Promise.all([
      fetch(DATA + 'status.json' + bust).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(DATA + 'incidents.json' + bust).then((r) => (r.ok ? r.json() : [])),
    ]);
    render(status, incidents);
  } catch {
    $('checked').textContent = 'No results yet. Run a check first.';
  }
}

function render(status, incidents) {
  document.title = `${status.title} · Status`;
  $('title').textContent = status.title;
  const checked = $('checked');
  checked.textContent = `Last checked ${ago(status.checkedAt)}`;
  checked.title = new Date(status.checkedAt).toLocaleString();

  const down = status.sites.filter((s) => !s.ok);
  const summary = $('summary');
  summary.className = `summary ${down.length ? 'is-down' : 'is-up'}`;
  summary.textContent = down.length
    ? `${down.length === 1 ? down[0].name + ' is' : down.length + ' sites are'} down`
    : `All ${status.sites.length} sites are up`;

  const tpl = $('site-row');
  $('sites').replaceChildren(...status.sites.map((s) => {
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.classList.toggle('down', !s.ok);
    const a = row.querySelector('.site-name');
    a.href = s.url;
    a.textContent = s.name;
    row.querySelector('.pill').textContent = s.ok ? 'Up' : `Down: ${s.reason}`;
    row.querySelector('[data-ms]').textContent = s.ok ? `${s.ms} ms` : '–';
    row.querySelector('[data-u24]').textContent = fmtPct(s.uptime24h);
    row.querySelector('[data-u7]').textContent = fmtPct(s.uptime7d);

    // The last few hours of checks: bar height is response time, red bars are failed checks
    const bars = row.querySelector('.bars');
    const max = Math.max(500, ...s.recent.map((c) => c.ms));
    bars.setAttribute('aria-label', `Last ${s.recent.length} checks, ${s.recent.filter((c) => !c.ok).length} failed`);
    bars.replaceChildren(...s.recent.map((c) => {
      const b = document.createElement('span');
      b.className = c.ok ? 'bar' : 'bar fail';
      b.style.setProperty('--h', c.ok ? Math.max(0.12, c.ms / max) : 1);
      b.title = `${when(c.t)}: ${c.ok ? c.ms + ' ms' : 'failed'}`;
      return b;
    }));
    return row;
  }));

  const week = incidents.filter((i) => Date.now() - i.start < 7 * 24 * 3600 * 1000);
  const list = $('incidents');
  if (week.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No outages. 🎉';
    list.replaceChildren(li);
    return;
  }
  list.replaceChildren(...week.map((i) => {
    const li = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = i.name;
    const what = document.createElement('span');
    what.textContent = i.end ? `down for ${duration(i.end - i.start)} (${i.reason})` : `down since ${when(i.start)} (${i.reason})`;
    const t = document.createElement('time');
    t.dateTime = new Date(i.start).toISOString();
    t.textContent = when(i.start);
    li.append(name, what, t);
    if (!i.end) li.classList.add('open');
    return li;
  }));
}

load();
setInterval(load, 60_000);
