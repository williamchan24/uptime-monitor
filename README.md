# Uptime Monitor

Checks my sites every 5 minutes, shows their status and uptime on a page, and messages me on Telegram when one goes down or comes back. It runs entirely on GitHub for free: no server, no database, no dependencies.

## How it works
- **`sites.json`** lists the sites. Each has a name and URL, and optionally an `expect` phrase that must appear on the page, which catches a host's error page that still returns "200 OK".
- **`scripts/check.mjs`** visits every site, retries a failure once after 5 seconds so a single blip doesn't count, and records the result. It writes three files:
  - `status.json`: the latest state, with 24-hour and 7-day uptime and the recent checks
  - `history.json`: a week of checks per site
  - `incidents.json`: the last 50 outages
- **GitHub Actions** (`.github/workflows/check.yml`) runs the check every 5 minutes and saves the results to the **`data` branch**. That branch is always a single force-pushed commit, so the repo doesn't grow.
- **The status page** (`index.html`, `app.js`, `style.css`) is published to GitHub Pages once, and reads the latest results straight from the `data` branch, refreshing every minute.
- **The logic** (judging a response, uptime maths, incidents, alert messages) lives in `scripts/lib.mjs` and is covered by tests.

## Telegram alerts (optional)
1. In Telegram, talk to **@BotFather**, send `/newbot` and copy the bot token it gives you.
2. Send your new bot any message, then open `https://api.telegram.org/bot<your token>/getUpdates` and copy the `chat.id` number.
3. In this repo on GitHub, go to **Settings → Secrets and variables → Actions** and add two secrets: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Without them, the checks still run; there are just no messages.

## Run it locally
Needs Node 20 or later, with nothing to install.
```bash
npm run check    # check every site once (writes ./data)
npm run serve    # status page at http://localhost:8770
npm test         # tests for the logic
```

## Notes
- GitHub runs scheduled workflows on a best-effort basis, so checks can be a few minutes late at busy times.
- GitHub pauses scheduled workflows in repos with no activity for 60 days. The data branch commits may not count as activity, so if checks stop, push any small change or re-enable the workflow in the Actions tab.
