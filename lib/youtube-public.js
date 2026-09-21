import { spawn } from "node:child_process";

function toIso(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null;
}

export function normalizePublicComment(comment) {
  return {
    id: comment.id,
    parentId: comment.parent && comment.parent !== "root" ? comment.parent : null,
    author: comment.author || "알 수 없음",
    authorChannelId: comment.author_id || null,
    text: comment.text || "",
    likeCount: Number(comment.like_count || 0),
    publishedAt: toIso(comment.timestamp),
    updatedAt: toIso(comment.timestamp)
  };
}

export function fetchPublicVideoAndComments({ videoId, maxComments = 3000 }) {
  const binary = process.env.YT_DLP_PATH || "yt-dlp";
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const fields = "%(.{id,title,channel,thumbnail,view_count,comment_count,comments})#j";
  const args = [
    "--skip-download",
    "--write-comments",
    "--no-warnings",
    "--extractor-args", `youtube:max_comments=${maxComments},all,all,all`,
    "--print", fields,
    url
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("댓글 수집 시간이 초과되었습니다. 분석 범위를 줄여 다시 시도해주세요."));
    }, 10 * 60 * 1000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") {
        const missingBinary = new Error("yt-dlp 실행 파일을 찾지 못했습니다.");
        missingBinary.code = "YT_DLP_NOT_INSTALLED";
        reject(missingBinary);
      }
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const message = stderr.trim().split("\n").at(-1) || "공개 댓글을 가져오지 못했습니다.";
        reject(new Error(message.replace(/^ERROR:\s*/, "")));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const comments = (data.comments || []).slice(0, maxComments).map(normalizePublicComment);
        resolve({
          video: {
            id: data.id || videoId,
            title: data.title || "제목 없음",
            channel: data.channel || "채널 정보 없음",
            thumbnail: data.thumbnail || null,
            publishedAt: null,
            commentCount: Number(data.comment_count || comments.length),
            viewCount: Number(data.view_count || 0)
          },
          comments,
          truncated: comments.length >= maxComments,
          collectionMethod: "youtube-public-page"
        });
      } catch {
        reject(new Error("수집된 댓글 데이터를 읽지 못했습니다."));
      }
    });
  });
}
