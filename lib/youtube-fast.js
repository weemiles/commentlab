const VIDEO_URL = "https://www.youtube.com/watch?v=";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const WEB_CLIENT_VERSION = "2.20260623.01.00";

function walk(value, key, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, key, output);
    return output;
  }
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childKey === key) output.push(childValue);
    else walk(childValue, key, output);
  }
  return output;
}

function extractBalancedJson(source, markers) {
  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) continue;
    const start = marker.endsWith("{") ? markerIndex + marker.length - 1 : source.indexOf("{", markerIndex + marker.length);
    if (start < 0) continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  return null;
}

function continuationToken(endpoint) {
  return endpoint?.continuationCommand?.token || endpoint?.continuationEndpoint?.continuationCommand?.token || null;
}

export function normalizePayload(payload) {
  const properties = payload?.properties || {};
  const author = payload?.author || {};
  const toolbar = payload?.toolbar || {};
  const id = properties.commentId;
  if (!id) return null;
  const separator = id.indexOf(".");
  return {
    id,
    parentId: separator > 0 ? id.slice(0, separator) : null,
    author: author.displayName || "알 수 없음",
    authorChannelId: author.channelId || null,
    text: properties.content?.content || "",
    likeCount: Number(String(toolbar.likeCountNotliked || "0").replace(/[^0-9]/g, "")) || 0,
    publishedAt: null,
    publishedText: typeof properties.publishedTime === "string" ? properties.publishedTime : null,
    updatedAt: null
  };
}

function sleep(milliseconds) {
  return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

export async function fetchYouTubeWithRetry(fetchImpl, url, options) {
  const { timeoutMs, ...requestOptions } = options;
  let firstError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...requestOptions,
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : requestOptions.signal
      });
      if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 1) return response;
    } catch (error) {
      firstError = error;
      if (attempt === 1) throw error;
    }
    await sleep(250);
  }
  throw firstError;
}

async function requestInnertube(apiPath, payload, config, fetchImpl) {
  if (!["/youtubei/v1/next", "/youtubei/v1/browse"].includes(apiPath)) throw new Error("지원하지 않는 댓글 요청 경로입니다.");
  const url = new URL(apiPath, config.apiOrigin || "https://www.youtube.com");
  url.searchParams.set("prettyPrint", "false");
  const client = config.INNERTUBE_CONTEXT.client;
  const headers = {
    "content-type": "application/json",
    "user-agent": USER_AGENT,
    origin: "https://www.youtube.com",
    "x-youtube-client-name": String(config.INNERTUBE_CONTEXT_CLIENT_NAME || 1),
    "x-youtube-client-version": client.clientVersion
  };
  if (client.visitorData) headers["x-goog-visitor-id"] = client.visitorData;
  const response = await fetchYouTubeWithRetry(fetchImpl, url, {
    method: "POST",
    headers,
    timeoutMs: 10000,
    body: JSON.stringify({ context: config.INNERTUBE_CONTEXT, ...payload })
  });
  if (!response.ok) throw new Error(`YouTube 댓글 요청 실패 (${response.status})`);
  const data = await response.json();
  if (data.responseContext?.visitorData) client.visitorData = data.responseContext.visitorData;
  return data;
}

async function requestContinuation(endpoint, config, fetchImpl) {
  const token = continuationToken(endpoint);
  if (!token) return null;
  const apiPath = endpoint?.commandMetadata?.webCommandMetadata?.apiUrl || "/youtubei/v1/next";
  return requestInnertube(apiPath, { continuation: token }, config, fetchImpl);
}

async function loadVideoSession(videoId, fetchImpl) {
  let watchError;
  try {
    const response = await fetchYouTubeWithRetry(fetchImpl, `${VIDEO_URL}${videoId}`, {
      headers: { "user-agent": USER_AGENT, cookie: "CONSENT=YES+cb" },
      timeoutMs: 10000
    });
    if (!response.ok) throw new Error(`YouTube 영상 페이지 요청 실패 (${response.status})`);
    const html = await response.text();
    const config = extractBalancedJson(html, ["ytcfg.set({"]);
    const initialData = extractBalancedJson(html, ["var ytInitialData =", "window[\"ytInitialData\"] =", "ytInitialData ="]);
    const player = extractBalancedJson(html, ["var ytInitialPlayerResponse =", "ytInitialPlayerResponse ="]);
    if (!config?.INNERTUBE_CONTEXT?.client || !initialData) throw new Error("YouTube 내부 댓글 설정을 찾지 못했습니다.");
    return { config, initialData, player };
  } catch (error) {
    watchError = error;
  }

  // The public web client can request watch-next data without downloading HTML
  // or supplying a YouTube Data API key. Keep its visitor context for all pages.
  const config = {
    apiOrigin: "https://www.youtube.com",
    INNERTUBE_CONTEXT: { client: { clientName: "WEB", clientVersion: WEB_CLIENT_VERSION, hl: "ko", gl: "KR" } }
  };
  try {
    const initialData = await requestInnertube("/youtubei/v1/next", { videoId }, config, fetchImpl);
    return { config, initialData, player: null };
  } catch (error) {
    throw new Error(`${watchError.message}; ${error.message}`, { cause: error });
  }
}

function findInitialContinuation(initialData) {
  const sections = walk(initialData, "itemSectionRenderer");
  const itemSection = sections.find((section) => section.targetId === "comments-section" || section.sectionIdentifier === "comment-item-section");
  return itemSection ? walk(itemSection, "continuationItemRenderer")[0]?.continuationEndpoint : null;
}

function sortEndpoint(data, sortBy) {
  const items = walk(data, "sortFilterSubMenuRenderer")[0]?.subMenuItems || [];
  const index = sortBy === "top" ? 0 : 1;
  return items[index]?.serviceEndpoint || null;
}

export async function fetchCollectorSession(videoId, fetchImpl = fetch) {
  const { config, initialData, player } = await loadVideoSession(videoId, fetchImpl);
  const firstEndpoint = findInitialContinuation(initialData);
  if (!firstEndpoint) throw new Error("댓글이 비활성화됐거나 공개 댓글이 없습니다.");
  const client = config.INNERTUBE_CONTEXT.client;
  return {
    video: await resolveVideoMetadata(player, initialData, videoId, 0, fetchImpl),
    client: { clientName: "WEB", clientVersion: client.clientVersion, visitorData: client.visitorData },
    firstToken: continuationToken(firstEndpoint),
    newestToken: continuationToken(sortEndpoint(initialData, "new")),
    topToken: continuationToken(sortEndpoint(initialData, "top"))
  };
}

export async function fetchCollectorPage({ token, clientVersion, visitorData }, fetchImpl = fetch) {
  const config = { INNERTUBE_CONTEXT: { client: { clientName: "WEB", clientVersion, visitorData, hl: "ko", gl: "KR" } } };
  return requestContinuation({ continuationCommand: { token } }, config, fetchImpl);
}

export async function fetchCollectorPages({ tokens, clientVersion, visitorData }, fetchImpl = fetch) {
  return Promise.all(tokens.map((token) => fetchCollectorPage({ token, clientVersion, visitorData }, fetchImpl)));
}

async function requestCollector(collectorUrl, body, fetchImpl) {
  const response = await fetchImpl(collectorUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `댓글 수집 서버 연결 실패 (${response.status})`);
  }
  return response.json();
}

function rendererText(value) {
  return value?.simpleText || value?.runs?.map((run) => run.text).join("") || null;
}

export function metadataFromSources(player, initialData, videoId, commentsLength) {
  const details = player?.videoDetails || {};
  const microformat = player?.microformat?.playerMicroformatRenderer || {};
  const primary = walk(initialData, "videoPrimaryInfoRenderer")[0] || {};
  const owner = walk(initialData, "videoOwnerRenderer")[0] || {};
  const thumbnails = details.thumbnail?.thumbnails || [];
  return {
    id: videoId,
    channelId: details.channelId || microformat.externalChannelId || owner.navigationEndpoint?.browseEndpoint?.browseId || null,
    title: details.title || rendererText(microformat.title) || rendererText(primary.title) || null,
    channel: details.author || microformat.ownerChannelName || rendererText(owner.title) || null,
    thumbnail: thumbnails.at(-1)?.url || microformat.thumbnail?.thumbnails?.at(-1)?.url || null,
    publishedAt: null,
    commentCount: commentsLength,
    viewCount: Number(details.viewCount || 0)
  };
}

export async function resolveVideoMetadata(player, initialData, videoId, commentsLength, fetchImpl = fetch) {
  const video = metadataFromSources(player, initialData, videoId, commentsLength);
  if (!video.title || !video.channel) {
    try {
      const url = new URL("https://www.youtube.com/oembed");
      url.searchParams.set("url", `${VIDEO_URL}${videoId}`);
      url.searchParams.set("format", "json");
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const embed = await response.json();
        video.title ||= embed.title || null;
        video.channel ||= embed.author_name || null;
        video.thumbnail ||= embed.thumbnail_url || null;
      }
    } catch {}
  }
  video.title ||= "영상 제목 확인 불가";
  video.channel ||= "채널 정보 확인 불가";
  return video;
}

function collectVideoIds(data, output, seen) {
  for (const videoId of walk(data, "videoId")) {
    if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId) && !seen.has(videoId)) {
      seen.add(videoId);
      output.push(videoId);
    }
  }
}

export async function fetchChannelVideoIds({ channelId, maxVideos = 10, fetchImpl = fetch }) {
  if (!channelId) throw new Error("영상에서 채널 ID를 찾지 못했습니다.");
  const response = await fetchImpl(`https://www.youtube.com/channel/${channelId}/videos`, { headers: { "user-agent": USER_AGENT, cookie: "CONSENT=YES+cb" } });
  if (!response.ok) throw new Error(`YouTube 채널 페이지 요청 실패 (${response.status})`);
  const html = await response.text();
  const config = extractBalancedJson(html, ["ytcfg.set({"]);
  const initialData = extractBalancedJson(html, ["var ytInitialData =", "window[\"ytInitialData\"] =", "ytInitialData ="]);
  if (!config?.INNERTUBE_API_KEY || !config?.INNERTUBE_CONTEXT || !initialData) throw new Error("YouTube 채널 영상 목록을 찾지 못했습니다.");
  const ids = [];
  const seen = new Set();
  collectVideoIds(initialData, ids, seen);
  let endpoints = walk(initialData, "continuationEndpoint");
  const tokens = new Set();
  while (ids.length < maxVideos && endpoints.length) {
    const endpoint = endpoints.shift();
    const token = continuationToken(endpoint);
    if (!token || tokens.has(token)) continue;
    tokens.add(token);
    const page = await requestContinuation(endpoint, config, fetchImpl);
    collectVideoIds(page, ids, seen);
    endpoints.push(...walk(page, "continuationEndpoint"));
  }
  return ids.slice(0, maxVideos);
}

export async function fetchChannelAndComments({ seedVideoId, maxComments = 3000, maxVideos = 10, fetchImpl = fetch }) {
  const seed = await fetchFastVideoAndComments({ videoId: seedVideoId, maxComments: 1, fetchImpl });
  const videoIds = await fetchChannelVideoIds({ channelId: seed.video.channelId, maxVideos, fetchImpl });
  if (!videoIds.includes(seedVideoId)) videoIds.unshift(seedVideoId);
  const selectedIds = videoIds.slice(0, maxVideos);
  const perVideo = Math.max(100, Math.ceil(maxComments / Math.max(1, selectedIds.length)));
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < selectedIds.length) {
      const index = cursor++;
      try { results[index] = await fetchFastVideoAndComments({ videoId: selectedIds[index], maxComments: perVideo, fetchImpl }); }
      catch (error) { results[index] = { video: null, comments: [], error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, selectedIds.length) }, worker));
  const comments = [];
  for (const result of results) {
    if (!result?.video) continue;
    for (const comment of result.comments) comments.push({ ...comment, videoId: result.video.id, videoTitle: result.video.title });
  }
  const successful = results.filter((result) => result?.video);
  return {
    video: {
      ...seed.video,
      id: `channel-${seed.video.channelId}`,
      title: `${seed.video.channel} 최근 영상 댓글`,
      commentCount: comments.length,
      viewCount: successful.reduce((sum, result) => sum + result.video.viewCount, 0)
    },
    comments: comments.slice(0, maxComments),
    truncated: comments.length >= maxComments,
    collectionMethod: "youtube-fast-channel",
    channelScan: { requested: selectedIds.length, successful: successful.length, videoIds: successful.map((result) => result.video.id) }
  };
}

export async function fetchFastVideoAndComments({ videoId, maxComments = 3000, sortBy = "new", fetchImpl = fetch, collectorUrl = "", requestDelayMs = Number(process.env.YOUTUBE_REQUEST_DELAY_MS ?? 0), concurrency = Number(process.env.YOUTUBE_FETCH_CONCURRENCY ?? 32), onProgress = () => {} }) {
  const remote = collectorUrl ? await requestCollector(collectorUrl, { action: "session", videoId }, fetchImpl) : null;
  const { config, initialData, player } = remote
    ? { config: { INNERTUBE_CONTEXT: { client: remote.client } }, initialData: {}, player: null }
    : await loadVideoSession(videoId, fetchImpl);
  const endpointFor = (token) => token ? { continuationCommand: { token } } : null;
  const loadPage = async (endpoint) => {
    if (!remote) return requestContinuation(endpoint, config, fetchImpl);
    const client = config.INNERTUBE_CONTEXT.client;
    const page = await requestCollector(collectorUrl, {
      action: "page", token: continuationToken(endpoint),
      clientVersion: client.clientVersion, visitorData: client.visitorData
    }, fetchImpl);
    if (page.responseContext?.visitorData) client.visitorData = page.responseContext.visitorData;
    return page;
  };
  const loadPages = async (endpoints) => {
    if (!remote) {
      const settled = await Promise.allSettled(endpoints.map(loadPage));
      const pages = [];
      for (const result of settled) {
        if (result.status === "fulfilled" && result.value) pages.push(result.value);
        else console.warn(`Skipping failed YouTube continuation: ${result.reason?.message || result.reason}`);
      }
      return pages;
    }
    const client = config.INNERTUBE_CONTEXT.client;
    let pages;
    try {
      pages = await requestCollector(collectorUrl, {
        action: "pages", tokens: endpoints.map(continuationToken),
        clientVersion: client.clientVersion, visitorData: client.visitorData
      }, fetchImpl);
    } catch (error) {
      console.warn(`Batched collector request failed, retrying pages separately: ${error.message}`);
      const settled = await Promise.allSettled(endpoints.map(loadPage));
      return settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
    }
    for (const page of pages) {
      if (page.responseContext?.visitorData) client.visitorData = page.responseContext.visitorData;
    }
    return pages;
  };

  const firstEndpoint = remote ? endpointFor(remote.firstToken) : findInitialContinuation(initialData);
  if (!firstEndpoint) throw new Error("댓글이 비활성화됐거나 공개 댓글이 없습니다.");

  let firstPage = await loadPage(firstEndpoint);
  const selectedSort = (remote ? endpointFor(sortBy === "top" ? remote.topToken : remote.newestToken) : sortEndpoint(initialData, sortBy)) || sortEndpoint(firstPage, sortBy);
  if (selectedSort) firstPage = await loadPage(selectedSort);

  const queue = [];
  const seenTokens = new Set();
  const seenComments = new Set();
  const comments = [];
  let pages = [firstPage];
  const enqueue = (endpoint) => {
    const token = continuationToken(endpoint);
    if (!token || seenTokens.has(token)) return;
    seenTokens.add(token);
    queue.push(endpoint);
  };

  while (pages.length && comments.length < maxComments) {
    const beforeCount = comments.length;
    for (const page of pages) {
      const externalError = walk(page, "externalErrorMessage")[0];
      if (externalError) throw new Error(externalError);

      for (const payload of walk(page, "commentEntityPayload")) {
        const comment = normalizePayload(payload);
        if (comment && !seenComments.has(comment.id)) {
          seenComments.add(comment.id);
          comments.push(comment);
        }
      }

      const actions = [...walk(page, "reloadContinuationItemsCommand"), ...walk(page, "appendContinuationItemsAction")];
      for (const action of actions) {
        for (const item of action.continuationItems || []) {
          if (action.targetId === "comments-section" || action.targetId === "engagement-panel-comments-section" || action.targetId === "shorts-engagement-panel-comments-section" || String(action.targetId).startsWith("comment-replies-item")) {
            for (const endpoint of walk(item, "continuationEndpoint")) enqueue(endpoint);
            for (const command of walk(item, "buttonRenderer").map((button) => button.command).filter(Boolean)) enqueue(command);
          }
        }
      }
    }
    onProgress(comments.length, comments.slice(beforeCount));
    if (!queue.length || comments.length >= maxComments) break;
    await sleep(requestDelayMs);
    const batch = queue.splice(0, Math.max(1, concurrency));
    pages = await loadPages(batch);
  }

  return {
    video: remote ? { ...remote.video, commentCount: comments.length } : await resolveVideoMetadata(player, initialData, videoId, comments.length, fetchImpl),
    comments: comments.slice(0, maxComments),
    truncated: comments.length >= maxComments,
    collectionMethod: remote ? "youtube-remote-continuation" : "youtube-fast-continuation"
  };
}
