// Turns dist-standalone/index.html into a page fragment for a claude.ai artifact.
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist-standalone/index.html', 'utf8');
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
if (!styles || !scripts) throw new Error('Could not find inlined style or script');
const out = `<title>QC Alert</title>
<meta name="description" content="Catch a yarn fault sooner and make sure the right person fixes it.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700&display=swap">
<style>${styles}</style>
<div id="root"></div>
<script type="module">${scripts.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync(process.argv[2] ?? 'dist-standalone/qc-alert.html', out);
console.log('wrote', process.argv[2] ?? 'dist-standalone/qc-alert.html', (out.length / 1024).toFixed(0), 'KB');

// Full web page for GitHub Pages (or any static host): dist-standalone/site/index.html.
// Everything is inlined and routing uses #app / #dashboard / #demo, so it works under any sub-path.
import { mkdirSync, copyFileSync } from 'node:fs';
const icon = readFileSync('public/icon.svg', 'utf8');
mkdirSync('dist-standalone/site', { recursive: true });
const [head, body] = out.split('<div id="root"></div>');
writeFileSync(
  'dist-standalone/site/index.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual">
<meta name="theme-color" content="#161616">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}">
<link rel="manifest" href="manifest.webmanifest">
${head}</head>
<body>
<div id="root"></div>${body}</body>
</html>
`,
);
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
manifest.start_url = './#app';
manifest.icons = [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];
writeFileSync('dist-standalone/site/manifest.webmanifest', JSON.stringify(manifest, null, 2));
copyFileSync('public/icon.svg', 'dist-standalone/site/icon.svg');
copyFileSync('public/rules-sample.pdf', 'dist-standalone/site/rules-sample.pdf');
for (const f of ['rule-sets-sample.csv', 'rule-sets-sample.pdf']) copyFileSync(`public/${f}`, `dist-standalone/site/${f}`);
writeFileSync('dist-standalone/site/.nojekyll', '');
console.log('wrote dist-standalone/site/ (web page for GitHub Pages)');
