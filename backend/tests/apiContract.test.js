'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function normalizeBackendPath(value) {
  return value.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectBackendRoutes(source) {
  const routes = [];
  const pattern = /\bapp\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
  for (const match of source.matchAll(pattern)) {
    routes.push(match[1].toUpperCase() + ' ' + normalizeBackendPath(match[3]));
  }
  return [...new Set(routes)].sort();
}

function collectOpenApiOperations(source) {
  const paths = [...source.matchAll(/^  (\/[^:\n]+):\s*$/gm)];
  const operations = [];
  for (let i = 0; i < paths.length; i += 1) {
    const start = paths[i].index;
    const end = i + 1 < paths.length ? paths[i + 1].index : source.length;
    const block = source.slice(start, end);
    const route = paths[i][1];
    for (const method of block.matchAll(/^    (get|post|put|patch|delete):\s*$/gm)) {
      operations.push(method[1].toUpperCase() + ' ' + route);
    }
  }
  return [...new Set(operations)].sort();
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    if (entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.[^.]+$/.test(entry.name)) return [absolute];
    return [];
  });
}


function walkJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'tests' || entry.name === 'node_modules') return [];
      return walkJavaScript(absolute);
    }
    return entry.isFile() && /\.js$/.test(entry.name) ? [absolute] : [];
  });
}

function frontendRoute(raw) {
  const withoutQuery = raw.split(/[?#]/, 1)[0].replace(/\$\{[^}]+\}/g, '{param}');
  return { path: withoutQuery, prefix: withoutQuery.endsWith('/') };
}

function pathMatches(client, backend) {
  const a = client.path.split('/').filter(Boolean);
  const b = backend.split('/').filter(Boolean);
  if (client.prefix ? a.length > b.length : a.length !== b.length) return false;
  return a.every((segment, index) => {
    const other = b[index];
    const isParam = (value) => /^\{[^}]+\}$/.test(value);
    return segment === other || isParam(other) || (isParam(segment) && isParam(other));
  });
}

function collectFrontendCalls() {
  const calls = [];
  const pattern = /\bapi\.(get|post|put|patch|delete)\s*(?:<[^>\n]+>)?\s*\(\s*(['"`])([^'"`]+)\2/g;
  for (const file of walk(path.join(ROOT, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      if (!match[3].startsWith('/')) continue;
      calls.push({
        method: match[1].toUpperCase(),
        ...frontendRoute(match[3]),
        file: path.relative(ROOT, file),
      });
    }
  }
  return calls;
}

function gatewayBlock(source, route) {
  const marker = '  ' + route + ':';
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('\n  /', start + marker.length);
  const components = source.indexOf('\ncomponents:', start + marker.length);
  const ends = [next, components].filter((value) => value >= 0);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}

test('api-spec.yaml exactly matches registered Express route methods', () => {
  const backend = collectBackendRoutes(read('backend/index.js'));
  const contract = collectOpenApiOperations(read('api-spec.yaml'));
  assert.deepEqual(contract, backend, 'Update api-spec.yaml whenever backend routes or methods change.');
});

test('every literal frontend API client call resolves to a backend route', () => {
  const backend = collectBackendRoutes(read('backend/index.js'));
  const calls = collectFrontendCalls();
  const missing = calls.filter((call) => !backend.some((route) => {
    const separator = route.indexOf(' ');
    return route.slice(0, separator) === call.method && pathMatches(call, route.slice(separator + 1));
  }));
  assert.deepEqual(missing, [], 'Frontend API calls without a matching backend route:');
});


test('backend runtime environment reads are documented in the environment contract', () => {
  const variables = new Set();
  for (const file of walkJavaScript(path.join(ROOT, 'backend'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      variables.add(match[1]);
    }
  }
  const contract = read('docs/BACKEND_ENV_CONTRACT.md');
  const missing = [...variables].filter((name) => !contract.includes('`' + name + '`')).sort();
  assert.deepEqual(missing, [], 'Backend runtime environment variables missing from docs/BACKEND_ENV_CONTRACT.md:');
});

test('frontend API host, package versions, Gateway bindings, and backend CORS contract agree', () => {
  const gateway = read('api-gateway.yaml');
  const apiSpec = read('api-spec.yaml');
  const envExample = read('.env.example');
  const ci = read('.github/workflows/ci.yml');
  const apiClient = read('src/lib/api.ts');
  const backend = read('backend/index.js');
  const backendPackage = JSON.parse(read('backend/package.json'));
  const deployment = read('docs/DEPLOYMENT_CURRENT.md');

  const serverUrl = gateway.match(/^\s+- url:\s*(\S+)\s*$/m)?.[1];
  const apiSpecUrl = apiSpec.match(/^\s+- url:\s*(\S+)\s*$/m)?.[1];
  const envUrl = envExample.match(/^VITE_API_URL=(\S+)$/m)?.[1];
  const ciUrl = ci.match(/VITE_API_URL:\s*(\S+)/)?.[1];
  assert.ok(serverUrl, 'Gateway server URL is required.');
  assert.equal(envUrl, serverUrl, '.env.example must point to the canonical Gateway.');
  assert.equal(ciUrl, serverUrl, 'CI build must use the canonical Gateway URL.');
  assert.equal(apiSpecUrl, serverUrl, 'OpenAPI server URL must point to the canonical Gateway.');
  assert.match(apiClient, /import\.meta\.env\.VITE_API_URL/u);

  const gatewayVersion = gateway.match(/^\s+version:\s*(\S+)/m)?.[1];
  const apiSpecVersion = apiSpec.match(/^\s+version:\s*(\S+)/m)?.[1];
  assert.equal(backendPackage.version, '5.4.1');
  assert.equal(backendPackage.main, 'index.js');
  assert.equal(backendPackage.engines?.node, '22');
  assert.equal(gatewayVersion, backendPackage.version);
  assert.equal(apiSpecVersion, backendPackage.version);
  assert.match(backend, /Version:\s*5\.4\.1/u);

  const health = gatewayBlock(gateway, '/healthz');
  const proxy = gatewayBlock(gateway, '/{proxy+}');
  const markitdown = gatewayBlock(gateway, '/markitdown/{proxy+}');
  assert.ok(
    gateway.indexOf('/markitdown/{proxy+}:') < gateway.indexOf('/{proxy+}:'),
    'Dedicated MarkItDown route must be declared before the application catch-all.'
  );
  const backendFunction = health.match(/function_id:\s*([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(backendFunction, 'Health route must bind to the backend Cloud Function.');
  assert.match(proxy, new RegExp('function_id:\\s*' + backendFunction + '\\b'), 'Application wildcard must bind to the same backend function.');
  const healthTag = health.match(/tag:\s*(\S+)/)?.[1];
  const proxyTag = proxy.match(/tag:\s*(\S+)/)?.[1];
  assert.equal(healthTag, '$latest');
  assert.equal(proxyTag, healthTag);

  const converterFunction = markitdown.match(/function_id:\s*([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(converterFunction, 'MarkItDown must have its own function binding.');
  assert.notEqual(converterFunction, backendFunction, 'MarkItDown must not be routed to the main backend function.');
  assert.equal(markitdown.match(/tag:\s*(\S+)/)?.[1], '$latest');
  assert.ok(deployment.includes(backendFunction), 'Deployment passport must record the backend function ID from Gateway config.');
  assert.ok(deployment.includes(converterFunction), 'Deployment passport must record the separate MarkItDown function ID from Gateway config.');
  assert.match(deployment, /service_account_id|invocation permission|functions\.functionInvoker/u);

  assert.match(backend, /Access-Control-Allow-Methods',\s*'GET, POST, PUT, PATCH, DELETE, OPTIONS'/u);
  assert.match(backend, /Access-Control-Allow-Headers',\s*'Authorization, Content-Type, X-Request-ID'/u);
});
