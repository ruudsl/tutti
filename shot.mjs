import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(6000);
const anim = await p.evaluate(() => {
  const uit = [];
  document.querySelectorAll('*').forEach((el) => {
    const st = getComputedStyle(el);
    if (st.animationIterationCount.includes('infinite')) {
      const r = el.getBoundingClientRect();
      uit.push({
        cls: (el.className || '').toString().slice(0, 60),
        naam: st.animationName,
        zichtbaar: r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none',
      });
    }
  });
  return uit;
});
console.log('URL', p.url());
console.log(JSON.stringify(anim, null, 1));
await p.screenshot({
  path: '/tmp/claude-0/-home-user-tutti/e0bfb839-735d-5bc8-a017-e42682d4226f/scratchpad/login.png',
});
await b.close();
