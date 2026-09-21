import { loadEnvFile } from '../lib/env-file.js';
import { analyzeVideo } from '../lib/analyze-video.js';
import { resolveMaxComments } from '../lib/limits.js';

loadEnvFile();

const [url, analysisLanguage = 'ko'] = process.argv.slice(2);
if (!url || !['ko', 'en'].includes(analysisLanguage)) {
  console.error('Usage: npm run analyze -- <YouTube-URL> [ko|en]\nSet TYPESAFE_API_KEY in .env first. JSON is written to stdout.');
  process.exitCode = 1;
} else if (!process.env.TYPESAFE_API_KEY?.trim()) {
  console.error('Missing TYPESAFE_API_KEY. Set your own key in .env.');
  process.exitCode = 1;
} else {
  try {
    const result = await analyzeVideo({ url, analysisLanguage }, {
      apiKey: process.env.TYPESAFE_API_KEY.trim(),
      maxAllowed: resolveMaxComments(),
      collectorUrl: process.env.YOUTUBE_COLLECTOR_URL || '',
    });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Analysis failed. Check your key, provider access and video availability.');
    process.exitCode = 1;
  }
}
