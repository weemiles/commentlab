import { readFileSync } from 'node:fs';

// JEV_ENV_PATH is an explicit opt-in path to your own environment file. It is
// read once at startup and never overrides a value already in the environment,
// so nothing here can shadow a key the operator set deliberately. The app does
// not search neighbouring projects for credentials.
export function loadEnvFile(env = process.env) {
  if (!env.JEV_ENV_PATH) return env;
  let contents;
  try {
    contents = readFileSync(env.JEV_ENV_PATH, 'utf8');
  } catch {
    return env;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}
