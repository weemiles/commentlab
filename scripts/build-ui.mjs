import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({ entryPoints: ['src/main.tsx'], bundle: true, minify: true, jsx: 'automatic', outfile: 'public/ui.js', define: { 'process.env.NODE_ENV': '"production"' } });
execFileSync('node_modules/.bin/tailwindcss', ['-i','src/theme.css','-o','public/ui.css','--minify'], {stdio:'inherit'});

// Fingerprint both bundles so deployed and local pages never reuse stale UI.
const { readFile, writeFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
let html = await readFile('public/index.html', 'utf8');
for (const name of ['ui.js', 'ui.css']) {
  const hash = createHash('sha256').update(await readFile(`public/${name}`)).digest('hex').slice(0,12);
  html = html.replace(new RegExp('/' + name.replace('.', '\\.') + '(?:\\?[^\"]*)?', 'g'), `/${name}?v=${hash}`);
}
await writeFile('public/index.html', html);
