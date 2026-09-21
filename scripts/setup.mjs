import { copyFile, mkdir, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function copyNew(source, target) {
  try { await copyFile(source, target, constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
await copyNew(join(root, '.env.example'), join(root, '.env'));
await chmod(join(root, '.env'), 0o600);
for (const folder of ['.agents', '.claude']) {
  const target = join(root, folder, 'skills', 'commentlab-maintenance');
  await mkdir(target, { recursive: true });
  await copyNew(join(root, 'skills/commentlab-maintenance/SKILL.md'), join(target, 'SKILL.md'));
}
console.log('Project-local skills installed; existing files preserved. Set YOUR TYPESAFE_API_KEY in .env once. Then run npm run build && npm start, or npm run analyze -- <YouTube-URL> [ko|en].');
