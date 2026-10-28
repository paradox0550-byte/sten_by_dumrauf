#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const pairs = [
  { text: '--text-primary', bg: '--bg-surface' },
  { text: '--text-secondary', bg: '--bg-surface' },
  { text: '--text-muted', bg: '--bg-surface' },
  { text: '--text-disabled', bg: '--bg-surface', exception: 'disabled-only' },
  { text: '--text-primary', bg: '--bg-elevated' },
  { text: '--text-secondary', bg: '--bg-base' },
  { text: '--text-muted', bg: '--bg-base' },
  { text: '--color-danger', bg: '--bg-surface' },
  { text: '--color-warning', bg: '--bg-surface' },
  { text: '--text-on-accent', bg: '--color-brand' },
  { text: '--color-danger', bg: '--bg-danger' },
  { text: '--color-warning', bg: '--bg-warning' },
  { text: '--color-success', bg: '--bg-success' },
];

const tokensCss = await readFile(new URL('../src/styles/visual-system/tokens.css', import.meta.url), 'utf8');
const stenCss = await readFile(new URL('../src/styles/sten-visual-system.css', import.meta.url), 'utf8');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${tokensCss}\n${stenCss}</style></head><body></body></html>`;

function parseRgb(value) {
  const nums = value.match(/[\d.]+/g)?.map(Number);
  if (!nums || nums.length < 3) throw new Error(`Unsupported computed color: ${value}`);
  return nums.slice(0, 3).map((v) => v / 255);
}
function linearize(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(rgb) {
  const [r, g, b] = rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(foreground, background) {
  const a = luminance(parseRgb(foreground));
  const b = luminance(parseRgb(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function computedColor(page, property, token) {
  return page.evaluate(({ property, token }) => {
    const node = document.createElement('span');
    node.style[property] = `var(${token})`;
    document.body.appendChild(node);
    const result = getComputedStyle(node)[property];
    node.remove();
    return result;
  }, { property, token });
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html);
  const results = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const pair of pairs) {
      const foreground = await computedColor(page, 'color', pair.text);
      const background = await computedColor(page, 'backgroundColor', pair.bg);
      const ratio = Number(contrastRatio(foreground, background).toFixed(2));
      const row = results.find((item) => item.text === pair.text && item.bg === pair.bg);
      const detail = {
        ratio,
        aaNormal: ratio >= 4.5,
        aaLarge: ratio >= 3,
        aaa: ratio >= 7,
        foreground,
        background,
      };
      if (row) row[theme] = detail;
      else results.push({ text: pair.text, bg: pair.bg, exception: pair.exception ?? null, [theme]: detail });
    }
  }

  const output = {
    standard: 'WCAG 2.2 contrast minimums: AA normal >= 4.5:1, AA large >= 3:1, AAA >= 7:1',
    method: 'Chromium headless getComputedStyle; token values resolved after theme selectors and cascade',
    results,
  };
  console.log(JSON.stringify(output, null, 2));

  const failures = results.filter((row) =>
    (!row.light.aaNormal || !row.dark.aaNormal) && row.exception !== 'disabled-only'
  );
  if (failures.length) {
    console.error(`Contrast check failed: ${failures.length} non-exempt token pair(s) fail AA normal text.`);
    process.exitCode = 1;
  } else {
    console.log('Contrast check passed for all non-exempt token pairs; disabled-only pair is reported separately.');
  }
} finally {
  await browser.close();
}
