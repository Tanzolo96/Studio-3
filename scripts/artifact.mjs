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
