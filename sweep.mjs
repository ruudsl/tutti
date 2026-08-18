import { chromium } from 'playwright';
const base = 'http://localhost:5174';
const paths = ['/', '/my-music', '/rehearsals', '/availability', '/concerts', '/members', '/contacts',
  '/issues', '/practice', '/practice-schedules', '/posts', '/polls', '/tasks', '/email-campaigns',
  '/seating', '/voice-parts', '/occupancy', '/neighbor-preferences', '/stage-designer',
  '/external-musicians', '/replacement-requests', '/tools', '/music-pieces', '/lists', '/titles',
  '/upload', '/imslp', '/loans', '/pdf-tools', '/genres', '/statistics', '/instrument-assets',
  '/uniforms', '/equipment', '/projects', '/tours', '/resources', '/wiki', '/outfits',
  '/performances', '/workflows', '/users', '/onboarding', '/orchestras', '/custom-fields',
  '/accounting', '/settings', '/modules', '/theme', '/changelog', '/audit-logs', '/health',
  '/profile', '/privacy-settings', '/season-planner', '/attendance-analytics', '/my-tickets',
  '/ticket-sales', '/holiday-settings'];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });

await p.goto(`${base}/login`, { waitUntil: 'networkidle' });
await p.fill('input[type="email"]', 'e2e-admin@test.local');
await p.fill('input[type="password"]', 'E2eTest!2026');
await p.click('button[type="submit"]');
await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 });
await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('user') || '{}'); if (u.id) localStorage.setItem(`onboarding-completed-${u.id}`, 'true'); });

// alle modules aan, zodat elke pagina bereikbaar is
const token = await p.evaluate(() => localStorage.getItem('token'));
for (const k of ['accounting','ticketing','stage','polls','tasks','posts','mailings','contacts','issues','practice','externals','inventory','projects','resources','wiki','performances','workflows','seasons','attendance']) {
  await p.evaluate(async ([key, t]) => {
    await fetch(`/api/modules/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ enabled: true }) });
  }, [k, token]);
}

const results = [];
for (const path of paths) {
  const errors = [];
  const onErr = (e) => errors.push(String(e).slice(0, 90));
  p.on('pageerror', onErr);
  try {
    await p.goto(`${base}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      // welke klassen op gerenderde elementen hebben geen enkele CSS-regel?
      const defined = new Set();
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            const sel = rule.selectorText || '';
            for (const m of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);
            if (rule.cssRules) for (const inner of rule.cssRules) for (const m of (inner.selectorText||'').matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);
          }
        } catch { /* cross-origin */ }
      }
      const main = document.querySelector('.main-content');
      const dead = new Set();
      if (main) for (const el of main.querySelectorAll('*'))
        for (const c of el.classList) if (!defined.has(c)) dead.add(c);
      const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
      const h1 = document.querySelector('.main-content h1');
      return { dead: [...dead], overflow, heeftTitel: !!h1, titel: h1?.textContent?.trim().slice(0, 28) || null };
    });
    results.push({ path, ...r, errors });
  } catch (e) {
    results.push({ path, fout: String(e).slice(0, 80), errors });
  }
  p.off('pageerror', onErr);
}
console.log('JSON' + JSON.stringify(results));
await b.close();
