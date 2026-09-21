const API_BASE = "https://www.googleapis.com/youtube/v3";

export function extractVideoId(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "live", "embed"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function youtubeRequest(path, params, apiKey, fetchImpl = fetch) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const response = await fetchImpl(url);
  const body = await response.json();
  if (!response.ok) {
    const reason = body?.error?.errors?.[0]?.reason;
    const message = body?.error?.message || "YouTube API 요청에 실패했습니다.";
    if (reason === "commentsDisabled") throw new Error("이 영상은 댓글을 사용할 수 없습니다.");
    if (response.status === 403) throw new Error(`YouTube API 접근이 거부되었습니다: ${message}`);
    throw new Error(message);
  }
  return body;
}

function normalizeComment(item, parentId = null) {
  const snippet = item.snippet;
  return {
    id: item.id,
    parentId,
    author: snippet.authorDisplayName || "알 수 없음",
    authorChannelId: snippet.authorChannelId?.value || null,
    text: snippet.textOriginal || snippet.textDisplay || "",
    likeCount: snippet.likeCount || 0,
    publishedAt: snippet.publishedAt,
    updatedAt: snippet.updatedAt
  };
}

export async function fetchVideoAndComments({ videoId, apiKey, maxComments = 10000, onProgress, fetchImpl = fetch }) {
  const videoData = await youtubeRequest("videos", {
    part: "snippet,statistics",
    id: videoId
  }, apiKey, fetchImpl);
  const video = videoData.items?.[0];
  if (!video) throw new Error("영상을 찾을 수 없거나 공개 영상이 아닙니다.");

  const comments = [];
  let pageToken;
  let page = 0;

  do {
    const data = await youtubeRequest("commentThreads", {
      part: "snippet,replies",
      videoId,
      maxResults: Math.min(100, maxComments - comments.length),
      order: "time",
      textFormat: "plainText",
      pageToken
    }, apiKey, fetchImpl);

    for (const thread of data.items || []) {
      if (comments.length >= maxComments) break;
      const top = thread.snippet.topLevelComment;
      comments.push(normalizeComment(top));

      const totalReplyCount = thread.snippet.totalReplyCount || 0;
      const includedReplies = thread.replies?.comments || [];
      for (const reply of includedReplies) {
        if (comments.length >= maxComments) break;
        comments.push(normalizeComment(reply, top.id));
      }

      if (totalReplyCount > includedReplies.length && comments.length < maxComments) {
        let replyPageToken;
        do {
          const replies = await youtubeRequest("comments", {
            part: "snippet",
            parentId: top.id,
            maxResults: Math.min(100, maxComments - comments.length),
            textFormat: "plainText",
            pageToken: replyPageToken
          }, apiKey, fetchImpl);
          for (const reply of replies.items || []) {
            if (comments.length >= maxComments) break;
            if (!comments.some((comment) => comment.id === reply.id)) {
              comments.push(normalizeComment(reply, top.id));
            }
          }
          replyPageToken = replies.nextPageToken;
        } while (replyPageToken && comments.length < maxComments);
      }
    }

    page += 1;
    onProgress?.({ page, comments: comments.length });
    pageToken = data.nextPageToken;
  } while (pageToken && comments.length < maxComments);

  return {
    video: {
      id: videoId,
      title: video.snippet.title,
      channel: video.snippet.channelTitle,
      thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.medium?.url,
      publishedAt: video.snippet.publishedAt,
      commentCount: Number(video.statistics.commentCount || comments.length),
      viewCount: Number(video.statistics.viewCount || 0)
    },
    comments,
    truncated: comments.length >= maxComments
  };
}
