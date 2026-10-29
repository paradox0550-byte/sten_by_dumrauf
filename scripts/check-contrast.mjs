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
  // Composite surfaces: translucent semantic backgrounds must be composited over
  // the actual surface instead of being incorrectly treated as opaque RGB values.
  { text: '--text-primary', bg: '--bg-danger', backdrop: '--bg-surface' },
  { text: '--text-secondary', bg: '--bg-danger', backdrop: '--bg-surface' },
  { text: '--text-primary', bg: '--bg-warning', backdrop: '--bg-surface' },
  { text: '--text-secondary', bg: '--bg-warning', backdrop: '--bg-surface' },
  { text: '--text-primary', bg: '--bg-success', backdrop: '--bg-surface' },
  { text: '--text-secondary', bg: '--bg-success', backdrop: '--bg-surface' },
  { text: '--text-primary', bg: '--bg-danger', backdrop: '--bg-base' },
  { text: '--text-secondary', bg: '--bg-warning', backdrop: '--bg-base' },
  { text: '--text-secondary', bg: '--bg-success', backdrop: '--bg-base' },
  { text: '--text-primary', bg: '--bg-info', backdrop: '--bg-surface' },
  { text: '--text-secondary', bg: '--bg-info', backdrop: '--bg-surface' },
];

const requiredTokens = {
  '--bg-danger': '#2A1517',
  '--bg-warning': '#2A220F',
  '--bg-success': '#0F291A',
};

const tokensCss = await readFile(new URL('../src/styles/visual-system/tokens.css', import.meta.url), 'utf8');
const stenCss = await readFile(new URL('../src/styles/sten-visual-system.css', import.meta.url), 'utf8');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><style>${tokensCss}\n${stenCss}</style></head><body></body></html>`;

function parseColor(value) {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) throw new Error(`Unsupported computed color "${value}"`);
  const channels = match[1].replace(/\//g, ' ').split(/[ ,]+/).filter(Boolean).map((part) => {
    if (part.endsWith('%')) return Number.parseFloat(part) * 2.55;
    return Number.parseFloat(part);
  });
  if (channels.length < 3 || channels.slice(0, 3).some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid computed color "${value}"`);
  }
  const alpha = channels.length >= 4 ? channels[3] : 1;
  return { rgb: channels.slice(0, 3).map((n) => n / 255), alpha };
}

function composite(foreground, background) {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  const alpha = fg.alpha + bg.alpha * (1 - fg.alpha);
  if (alpha <= 0) throw new Error('Cannot composite fully transparent colors.');
  return {
    rgb: fg.rgb.map((channel, i) => (channel * fg.alpha + bg.rgb[i] * bg.alpha * (1 - fg.alpha)) / alpha),
    alpha,
  };
}

function hexFromColor(value) {
  const channels = parseColor(value).rgb.map((channel) => Math.round(channel * 255));
  return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function asCssRgb(color) {
  return `rgb(${color.rgb.map((channel) => Math.round(channel * 255)).join(', ')})`;
}
function linearize(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(color) {
  const [r, g, b] = color.rgb.map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrastRatio(foreground, background) {
  const a = luminance(parseColor(foreground));
  const b = luminance(parseColor(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function computedColor(page, property, token) {
  return page.evaluate(({ property, token }) => {
    const node = document.createElement('span');
    node.style.setProperty(property, `var(${token})`);
    document.body.appendChild(node);
    const result = getComputedStyle(node).getPropertyValue(property).trim();
    node.remove();
    if (!result || result === 'rgba(0, 0, 0, 0)') {
      throw new Error(`Token ${token} did not resolve to a usable ${property} value.`);
    }
    return result;
  }, { property, token });
}

async function resolvedToken(page, token) {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!value) throw new Error(`CSS custom property ${name} is missing or empty.`);
    const probe = document.createElement('span');
    probe.style.setProperty('background-color', `var(${name})`);
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (!computed || computed === 'rgba(0, 0, 0, 0)') {
      // Transparent semantic backgrounds are valid, but they must be handled
      // through a declared backdrop rather than silently counted as black.
      if (!/^rgba?\(/i.test(value)) {
        throw new Error(`CSS custom property ${name} does not resolve to a color: "${value}"`);
      }
    }
    return { value, computed };
  }, token);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html);
  const results = [];
  const tokenReport = {};

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    tokenReport[theme] = {};
    for (const token of Object.keys(requiredTokens)) {
      const resolved = await resolvedToken(page, token);
      tokenReport[theme][token] = resolved;
      if (theme === 'dark' && hexFromColor(resolved.computed) !== requiredTokens[token]) {
        throw new Error(`${theme} ${token}: expected ${requiredTokens[token]}, got ${resolved.computed}`);
      }
    }

    for (const pair of pairs) {
      const foreground = await computedColor(page, 'color', pair.text);
      const background = await computedColor(page, 'background-color', pair.bg);
      let effectiveBackground = background;
      if (pair.backdrop) {
        const backdrop = await computedColor(page, 'background-color', pair.backdrop);
        effectiveBackground = asCssRgb(composite(background, backdrop));
      } else if (parseColor(background).alpha < 1) {
        throw new Error(`Translucent ${pair.bg} requires an explicit backdrop for contrast calculation.`);
      }
      const ratio = Number(contrastRatio(foreground, effectiveBackground).toFixed(2));
      const row = results.find((item) => item.text === pair.text && item.bg === pair.bg && (item.backdrop ?? null) === (pair.backdrop ?? null));
      const detail = {
        ratio,
        aaNormal: ratio >= 4.5,
        aaLarge: ratio >= 3,
        aaa: ratio >= 7,
        foreground,
        background,
        effectiveBackground,
      };
      if (row) row[theme] = detail;
      else results.push({ text: pair.text, bg: pair.bg, backdrop: pair.backdrop ?? null, exception: pair.exception ?? null, [theme]: detail });
    }
  }

  const output = {
    standard: 'WCAG 2.2 contrast minimums: AA normal >= 4.5:1, AA large >= 3:1, AAA >= 7:1',
    method: 'Chromium headless getComputedStyle; custom-property resolution validated; alpha colors composited over explicit backdrop',
    tokenReport,
    compositePairs: pairs.filter((pair) => pair.backdrop).length,
    results,
  };
  console.log('CONTRAST_JSON=' + JSON.stringify(output));

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
