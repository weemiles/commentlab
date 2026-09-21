import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCaptionEvents, transcriptContext } from './video-transcript.js';

// Local installations already use yt-dlp for collection fallback. Never install
// it implicitly and never download audio/video just to obtain available captions.
export async function fetchLocalTranscript({ videoId, language = 'ko' }) {
  const unavailable = { status: 'unavailable', text: '' };
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return unavailable;
  const directory = await mkdtemp(join(tmpdir(), 'commentlab-captions-'));
  try {
    await new Promise(resolve => {
      const child = spawn(process.env.YT_DLP_PATH || 'yt-dlp', [
        '--ignore-config', '--skip-download', '--write-subs', '--write-auto-subs',
        '--sub-langs', language === 'en' ? 'en' : 'ko,en', '--sub-format', 'json3',
        '--no-playlist', '--socket-timeout', '8', '--retries', '0', '--extractor-retries', '0',
        '-o', join(directory, 'captions'), `https://www.youtube.com/watch?v=${videoId}`
      ], { stdio: 'ignore' });
      const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
      child.on('error', () => { clearTimeout(timer); resolve(); });
      child.on('close', () => { clearTimeout(timer); resolve(); });
    });
    // A second language can fail after the first succeeded; retain that success.
    const files = (await readdir(directory)).filter(file => file.endsWith('.json3'));
    files.sort((a, b) => Number(b.includes(`.${language}.`)) - Number(a.includes(`.${language}.`)));
    for (const file of files) {
      try {
        const result = transcriptContext(parseCaptionEvents(JSON.parse(await readFile(join(directory, file), 'utf8'))), {
          language: file.split('.').at(-2), automatic: true
        });
        if (result.status === 'available') return result;
      } catch {}
    }
  } catch {} finally {
    await rm(directory, { recursive: true, force: true });
  }
  return unavailable;
}
