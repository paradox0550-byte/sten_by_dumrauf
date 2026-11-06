import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4174';
const routes = [
  ['dashboard', '/dashboard'], ['sten-ai', '/sten'], ['shift-report', '/ops'],
  ['manager-plan', '/plan'], ['pnl', '/pnl'], ['pnl-import', '/pnl/import'],
  ['finances', '/finances'], ['budget', '/budget'], ['analytics', '/analytics'],
  ['team-fot', '/staff'], ['documents', '/documents'], ['memory', '/memory'],
  ['settings', '/settings'], ['telegram', '/telegram'], ['legal', '/legal'],
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const themes = ['dark', 'light'];
const axeSource = await readFile(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const failures = [];
let server;
let browser;

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await delay(500);
  }
  throw new Error('Vite preview did not become ready on port 4174.');
}

try {
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const theme of themes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, colorScheme: theme, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(({ initialTheme }) => {
        localStorage.setItem('token', 'a11y-audit-test-token');
        localStorage.setItem('sten_user', JSON.stringify({
          id: 'a11y-audit-user', email: 'a11y@qa.local', firstName: 'Audit',
          lastName: 'User', role: 'super_admin', organizationId: 'a11y-audit-org',
        }));
        localStorage.setItem('sten_scope_v5', JSON.stringify({ organizationId: 'a11y-audit-org' }));
        localStorage.setItem('sten_theme_v5', initialTheme);
        localStorage.setItem('sten_cookie_consent_v2', JSON.stringify({
          accepted: true, at: new Date().toISOString(), policyVersion: '3',
        }));
        localStorage.setItem('sten_reduce_motion_v1', 'true');
        localStorage.setItem('sten_interface_mode_v1', window.innerWidth <= 767 ? 'mobile' : 'desktop');
      }, { initialTheme: theme });

      const page = await context.newPage();
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
          await route.abort();
          return;
        }
        if (path.endsWith('/auth/me')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: {
            id: 'a11y-audit-user', organizationId: 'a11y-audit-org', firstName: 'Audit',
            lastName: 'User', role: 'super_admin',
          } }) });
          return;
        }
        if (path.endsWith('/api/b2b/context')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ context: {} }) });
          return;
        }
        if (path.endsWith('/api/b2b/org/tree')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
        if (path.includes('/api/') || path.includes('/auth/') || url.origin !== new URL(baseUrl).origin) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Нет данных в тестовом контуре.' } }) });
          return;
        }
        await route.continue();
      });

      for (const [name, path] of routes) {
        try {
          await page.goto(`${baseUrl}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForFunction(() => !document.querySelector('.sten-loading') && Boolean(document.querySelector('#root')?.childElementCount), null, { timeout: 8000 });
          await page.waitForTimeout(350);
          await page.addScriptTag({ content: axeSource });
          const result = await page.evaluate(async () => window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
          }));
          const severe = result.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
          for (const violation of severe) {
            const nodes = violation.nodes.slice(0, 4).map(node => `${node.target.join(', ')} — ${node.failureSummary?.replace(/\\s+/g, ' ').slice(0, 180)}`);
            failures.push(`${theme}/${viewport.width}/${name}: ${violation.id} [${violation.impact}] ${violation.help}; ${nodes.join(' | ')}`);
          }
          console.log(`[a11y] ${theme} ${viewport.width}px ${name}: ${result.violations.length} violations (${severe.length} serious/critical)`);
        } catch (error) {
          failures.push(`${theme}/${viewport.width}/${name}: audit failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await context.close();
    }
  }
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
}

if (failures.length) {
  console.error(`\\nAccessibility audit failed with ${failures.length} serious/critical findings:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Accessibility audit passed: no serious or critical axe-core violations in audited routes/themes/viewports.');
}
