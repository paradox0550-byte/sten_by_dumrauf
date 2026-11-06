import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const manifestPath = path.resolve('dist/.vite/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const entries = Object.entries(manifest);
const entry = entries.find(([, value]) => value.isEntry && value.src === 'src/main.tsx');
if (!entry) throw new Error('Vite manifest has no src/main.tsx entry.');

const visited = new Set();
const initialFiles = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const item = manifest[key];
  if (!item) return;
  if (item.file) initialFiles.add(item.file);
  for (const file of item.css || []) initialFiles.add(file);
  for (const dependency of item.imports || []) visit(dependency);
}
visit(entry[0]);

async function measure(file) {
  const bytes = await readFile(path.resolve('dist', file));
  return { file, raw: bytes.length, gzip: gzipSync(bytes).length };
}
const jsFiles = [...new Set(entries.map(([, value]) => value.file).filter(file => file?.endsWith('.js')))];
const jsMeasures = await Promise.all(jsFiles.map(measure));
const initialMeasures = await Promise.all([...initialFiles].map(measure));
const initialJs = initialMeasures.filter(item => item.file.endsWith('.js'));
const initialCss = initialMeasures.filter(item => item.file.endsWith('.css'));
const total = list => list.reduce((sum, item) => sum + item.gzip, 0);
const kib = bytes => (bytes / 1024).toFixed(1);
const largest = [...jsMeasures].sort((a, b) => b.gzip - a.gzip).slice(0, 12);

console.log('Bundle budget report (gzip):');
console.log(`- Initial static JS graph: ${kib(total(initialJs))} KiB across ${initialJs.length} files`);
console.log(`- Initial CSS graph: ${kib(total(initialCss))} KiB across ${initialCss.length} files`);
console.log('- Largest JS chunks:');
for (const item of largest) console.log(`  ${item.file}: ${kib(item.gzip)} KiB gzip / ${kib(item.raw)} KiB raw`);

const violations = [];
if (total(initialJs) > 650 * 1024) violations.push(`Initial JS graph exceeds 650 KiB gzip (${kib(total(initialJs))} KiB).`);
if (total(initialCss) > 250 * 1024) violations.push(`Initial CSS graph exceeds 250 KiB gzip (${kib(total(initialCss))} KiB).`);
for (const item of jsMeasures) {
  if (item.gzip > 450 * 1024) violations.push(`${item.file} exceeds 450 KiB gzip (${kib(item.gzip)} KiB).`);
}
if (violations.length) {
  for (const violation of violations) console.error(`[bundle] ${violation}`);
  process.exitCode = 1;
} else {
  console.log('Bundle budgets passed.');
}
