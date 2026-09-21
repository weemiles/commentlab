import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({ entryPoints: ['src/main.tsx'], bundle: true, minify: true, jsx: 'automatic', outfile: 'public/ui.js', define: { 'process.env.NODE_ENV': '"production"' } });
execFileSync('node_modules/.bin/tailwindcss', ['-i','src/theme.css','-o','public/ui.css','--minify'], {stdio:'inherit'});
