import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4173';
const outputDir = 'artifacts/visual-acceptance';
const routes = [
  ['dashboard', '/dashboard'],
  ['sten-ai', '/sten'],
  ['shift-report', '/ops'],
  ['manager-plan', '/plan'],
  ['pnl', '/pnl'],
  ['pnl-import', '/pnl/import'],
  ['finances', '/finances'],
  ['budget', '/budget'],
  ['analytics', '/analytics'],
  ['team-fot', '/staff'],
  ['documents', '/documents'],
  ['memory', '/memory'],
  ['settings', '/settings'],
  ['legal', '/legal'],
  ['organizations', '/admin/organizations'],
];
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const themes = ['dark', 'light'];
const failures = [];
let server;
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* preview server is starting */ }
    await delay(500);
  }
  throw new Error('Vite preview did not become ready on port 4173.');
}

async function mockApi(route) {
  const requestUrl = new URL(route.request().url());
  const path = requestUrl.pathname;
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-request-id',
  };
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  if (path === '/auth/me') {
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ user: {
        id: 'visual-qa-user',
        organizationId: 'visual-qa-org',
        firstName: 'Visual',
        lastName: 'QA',
        role: 'super_admin',
      } }),
    });
    return;
  }
  if (path === '/api/b2b/context') {
    await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ context: {} }) });
    return;
  }
  if (path === '/api/b2b/org/tree') {
    await route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '[]' });
    return;
  }
  if (path === '/api/admin/organizations' && route.request().method() === 'GET') {
    // A valid empty-state fixture for the system-admin screen; no synthetic organizations.
    await route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ organizations: [] }),
    });
    return;
  }
  if (path.startsWith('/api/') || path.startsWith('/auth/')) {
    // Empty/error-state fixture only. No synthetic business or financial values.
    await route.fulfill({
      status: 404,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'В тестовом контуре нет данных для этого запроса.' } }),
    });
    return;
  }
  await route.continue();
}

try {
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    stdio: 'ignore',
    env: process.env,
  });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const theme of themes) {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      await context.addInitScript(({ initialTheme }) => {
        localStorage.setItem('token', 'visual-acceptance-test-token');
        localStorage.setItem('sten_theme_v5', initialTheme);
        localStorage.setItem('sten_interface_mode_v1', window.innerWidth <= 767 ? 'mobile' : 'desktop');
        localStorage.setItem('sten_reduce_motion_v1', 'true');
      }, { initialTheme: theme });

      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', mockApi);

      for (const [name, path] of routes) {
        try {
          await page.goto(`${baseUrl}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForFunction((routePath) => {
            // Never accept Suspense/Auth loading placeholders as a rendered screen.
            if (document.querySelector('.sten-loading[aria-busy="true"], .sten-loading')) return false;
            if (routePath === '/legal') return Boolean(document.querySelector('.legal-hub'));
            if (routePath === '/admin/organizations') return Boolean(document.querySelector('.admin-organizations-page'));
            return Boolean(document.querySelector('.content > :not(.sten-inline-guide):not(.legal-footer)'));
          }, path, { timeout: 3500 });
          const state = await page.evaluate(() => ({
            width: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            contentWidth: document.querySelector('.content')?.scrollWidth ?? 0,
            contentClientWidth: document.querySelector('.content')?.clientWidth ?? 0,
            fatal: Boolean(document.querySelector('.sten-fatal')),
            loadingScreen: Boolean(document.querySelector('.sten-loading')),
            hasScreen: window.location.hash === '#/legal'
              ? Boolean(document.querySelector('.legal-hub'))
              : window.location.hash === '#/admin/organizations'
                ? Boolean(document.querySelector('.admin-organizations-page'))
                : Boolean(document.querySelector('.content > :not(.sten-inline-guide):not(.legal-footer)')),
            hash: window.location.hash,
            guideExists: Boolean(document.querySelector('.sten-inline-guide')),
            guideBeforePage: (() => {
              const guide = document.querySelector('.sten-inline-guide');
              const page = document.querySelector('.content > .page');
              return !guide || !page || Boolean(guide.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING);
            })(),
            collapsedGuideHasActions: Boolean(document.querySelector('.sten-inline-guide:not(:has(.sten-inline-guide-actions))')),
          }));
          if (state.fatal) failures.push(`${theme}/${viewport.width}/${name}: fatal React boundary`);
          if (state.loadingScreen) failures.push(`${theme}/${viewport.width}/${name}: captured loading placeholder instead of a rendered screen`);
          if (!state.hasScreen) failures.push(`${theme}/${viewport.width}/${name}: route content did not render`);
          if (state.guideExists && !state.guideBeforePage) failures.push(`${theme}/${viewport.width}/${name}: contextual help appears after page content`);
          if (state.guideExists && !state.collapsedGuideHasActions) failures.push(`${theme}/${viewport.width}/${name}: collapsed contextual help exposes expanded actions`);
          if (state.documentWidth > state.width + 1 || state.bodyWidth > state.width + 1 || state.contentWidth > state.contentClientWidth + 1) {
            failures.push(`${theme}/${viewport.width}/${name}: horizontal overflow viewport=${state.width}, document=${state.documentWidth}, body=${state.bodyWidth}, content=${state.contentWidth}/${state.contentClientWidth}`);
          }
          if (!state.hash.endsWith(path)) {
            failures.push(`${theme}/${viewport.width}/${name}: route redirected unexpectedly to ${state.hash}`);
          }
          const dir = `${outputDir}/${theme}/${viewport.width}`;
          await mkdir(dir, { recursive: true });
          await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
          if (pageErrors.length) {
            failures.push(`${theme}/${viewport.width}/${name}: uncaught browser error: ${pageErrors.join(' | ')}`);
            pageErrors.length = 0;
          }
        } catch (error) {
          const diagnostics = await page.evaluate(() => ({
            hash: window.location.hash,
            readyState: document.readyState,
            contentPresent: Boolean(document.querySelector('.content')),
            bodyText: (document.body.innerText || '').slice(0, 240),
          })).catch(() => null);
          const browserErrors = pageErrors.length ? `; browser errors: ${pageErrors.join(' | ')}` : '';
          failures.push(`${theme}/${viewport.width}/${name}: ${error instanceof Error ? error.message : String(error)}; diagnostics=${JSON.stringify(diagnostics)}${browserErrors}`);
        }
      }
      await context.close();

      const loginContext = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
      });
      await loginContext.addInitScript(({ initialTheme }) => {
        localStorage.setItem('sten_theme_v5', initialTheme);
        localStorage.setItem('sten_reduce_motion_v1', 'true');
      }, { initialTheme: theme });
      const loginPage = await loginContext.newPage();
      const loginErrors = [];
      loginPage.on('pageerror', error => loginErrors.push(error.message));
      await loginPage.route('**/*', mockApi);
      await loginPage.goto(`${baseUrl}/#/unlock`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await loginPage.waitForSelector('.login-screen', { state: 'visible', timeout: 5000 }).catch(() => {});
      const loginState = await loginPage.evaluate(() => ({
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        contentWidth: document.querySelector('.login-screen')?.scrollWidth ?? 0,
        contentClientWidth: document.querySelector('.login-screen')?.clientWidth ?? 0,
        loginVisible: Boolean(document.querySelector('.login-screen')),
      }));
      if (!loginState.loginVisible) failures.push(`${theme}/${viewport.width}/login: login screen did not render`);
      if (loginState.documentWidth > loginState.width + 1 || loginState.bodyWidth > loginState.width + 1 || loginState.contentWidth > loginState.contentClientWidth + 1) {
        failures.push(`${theme}/${viewport.width}/login: horizontal overflow viewport=${loginState.width}, document=${loginState.documentWidth}, body=${loginState.bodyWidth}, content=${loginState.contentWidth}/${loginState.contentClientWidth}`);
      }
      const loginDir = `${outputDir}/${theme}/${viewport.width}`;
      await mkdir(loginDir, { recursive: true });
      await loginPage.screenshot({ path: `${loginDir}/login.png`, fullPage: true, animations: 'disabled' });
      if (loginErrors.length) failures.push(`${theme}/${viewport.width}/login: uncaught browser error: ${loginErrors.join(' | ')}`);
      await loginContext.close();
    }
  }

  console.log(`Visual smoke checked ${routes.length} protected routes plus login × ${viewports.length} viewports × ${themes.length} themes = ${(routes.length + 1) * viewports.length * themes.length} screen states.`);
  console.log('Fixture: authenticated test-only user; all business endpoints return empty/error states, never fake financial values.');
  console.log(`Screenshots: ${outputDir}/`);
  if (failures.length) {
    console.error(`FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('PASS: no fatal UI render errors, unexpected route redirects, or document-level horizontal overflow.');
  }
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill('SIGTERM');
}
