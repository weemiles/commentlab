import { extractBalancedJson, requestCollector } from './youtube-fast.js';

const MAX_TEXT = 24000;
const unavailable = () => ({ status: 'unavailable', text: '' });

// Preserve the ending and explicitly mark omissions, rather than presenting a
// long video's opening as its complete content. Never return signed track URLs.
export function transcriptContext(text, details = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return unavailable();
  const partial = clean.length > MAX_TEXT;
  return {
    status: 'available', language: details.language || null,
    automatic: Boolean(details.automatic), partial: partial || Boolean(details.partial),
    text: partial ? `${clean.slice(0, 15900)}\n[Transcript middle omitted]\n${clean.slice(-8000)}` : clean
  };
}

export function parseCaptionEvents(data) {
  return (data?.events || []).flatMap(event => {
    if (!Array.isArray(event.segs)) return [];
    return [event.segs.map(segment => typeof segment.utf8 === 'string' ? segment.utf8 : '').join('')];
  }).join('\n');
}

export async function fetchVideoTranscript({ videoId, language = 'ko', collectorUrl = '', fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return unavailable();
  // One deadline covers the page, caption downloads and optional remote route.
  const signal = AbortSignal.timeout(15000);
  const boundedFetch = (url, options = {}) => fetchImpl(url, { ...options, signal });
  try {
    if (collectorUrl) {
      const result = await requestCollector(collectorUrl, { action: 'transcript', videoId, language }, boundedFetch);
      return result?.status === 'available' ? transcriptContext(result.text, result) : unavailable();
    }
    const response = await boundedFetch(`https://www.youtube.com/watch?v=${videoId}&hl=${language === 'en' ? 'en' : 'ko'}`, {
      headers: { 'user-agent': 'Mozilla/5.0', cookie: 'CONSENT=YES+cb' }
    });
    if (!response.ok) return unavailable();
    const player = extractBalancedJson(await response.text(), ['var ytInitialPlayerResponse =', 'ytInitialPlayerResponse =']);
    const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const preference = track => (track.languageCode?.split('-')[0] === language ? 4 : 0) + (track.kind !== 'asr' ? 2 : 0);
    for (const track of [...tracks].sort((a, b) => preference(b) - preference(a)).slice(0, 3)) {
      try {
        const url = new URL(track.baseUrl);
        // Caption metadata is external input: restrict downloads and redirects.
        if (url.protocol !== 'https:' || !['www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/api/timedtext' || url.username || url.password || url.port) continue;
        url.searchParams.set('fmt', 'json3');
        const captions = await boundedFetch(url, { redirect: 'error' });
        if (!captions.ok) continue;
        const result = transcriptContext(parseCaptionEvents(await captions.json()), { language: track.languageCode, automatic: track.kind === 'asr' });
        if (result.status === 'available') return result;
      } catch {
        if (signal.aborted) break;
      }
    }
  } catch {
    // Missing, blocked or expired captions must not prevent comment analysis.
  }
  return unavailable();
}
