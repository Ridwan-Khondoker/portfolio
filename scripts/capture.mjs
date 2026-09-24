// Screenshots every project with a URL (desktop + mobile) into src/assets/shots as WebP.
// Usage: npm run capture            -> all projects
//        npm run capture -- stax-army -> only the named slugs
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'src/assets/shots');
const only = process.argv.slice(2);

// Pre-installed Chromium in the cloud sandbox; set CHROME_PATH to use another browser.
const exe = process.env.CHROME_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);

async function targets() {
  const list = [];
  const clientsDir = path.join(root, 'src/content/clients');
  for (const f of await readdir(clientsDir)) {
    const d = JSON.parse(await readFile(path.join(clientsDir, f), 'utf8'));
    if (d.url) list.push({ slug: f.replace(/\.json$/, ''), url: d.url });
  }
  const devDir = path.join(root, 'src/content/dev');
  for (const f of await readdir(devDir)) {
    const src = await readFile(path.join(devDir, f), 'utf8');
    const url = src.match(/^url:\s*(\S+)/m)?.[1];
    const shot = src.match(/^shot:\s*(\S+)/m)?.[1];
    if (url && shot) list.push({ slug: shot, url });
  }
  return only.length ? list.filter((t) => only.includes(t.slug)) : list;
}

const views = [
  { name: 'desktop', width: 1440, height: 900, mobile: false, out: 1600 },
  { name: 'mobile', width: 390, height: 844, mobile: true, out: 780 },
];

// In the cloud sandbox HTTPS is re-terminated by a proxy whose CA Chromium doesn't read from the
// system store. Trust exactly that CA (by its key hash) — verification stays on for everything else.
const proxyCa = '/root/.ccr/agent-proxy-ca.crt';
const args = [];
if (existsSync(proxyCa)) {
  const der = new X509Certificate(readFileSync(proxyCa)).publicKey.export({ type: 'spki', format: 'der' });
  args.push(`--ignore-certificate-errors-spki-list=${createHash('sha256').update(der).digest('base64')}`);
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args });
let ok = 0, failed = [];
for (const t of await targets()) {
  for (const v of views) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.mobile,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage();
    try {
      await page.goto(t.url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(2500); // let hero media and fonts settle
      const png = await page.screenshot({ type: 'png' });
      await sharp(png).resize({ width: v.out }).webp({ quality: 78 }).toFile(path.join(out, `${t.slug}-${v.name}.webp`));
      ok++;
      console.log(`ok   ${t.slug}-${v.name}`);
    } catch (e) {
      failed.push(`${t.slug}-${v.name}`);
      console.log(`fail ${t.slug}-${v.name}: ${String(e.message).split('\n')[0]}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${ok} saved, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
