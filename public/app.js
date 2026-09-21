const $ = (selector) => document.querySelector(selector);
const state = { result: null, filter: "all", authorId: null, terminalIds: new Set() };
const labels = { positive: "긍정", neutral: "중립", negative: "부정", mixed: "혼합" };
const colors = { positive: "#34c759", neutral: "#8e8e93", negative: "#ff3b30", mixed: "#5856d6" };

async function health() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    $("#apiState").textContent = data.collectionMode === "youtube-data-api" ? "YouTube API 연결됨" : "고속 공개 수집 사용 중";
    $("#apiState").classList.toggle("ready", data.youtubeConfigured);
  } catch { $("#apiState").textContent = "서버 연결 안 됨"; }
}

function setLoading(active) {
  $("#loading").classList.toggle("hidden", !active);
  $("#analyzeButton").disabled = active;
  if (active) {
    $("#results").classList.add("hidden");
    $("#formError").textContent = "";
    $("#loadingPercent").textContent = "0%";
    $("#loadingMessage").textContent = "영상과 댓글 스레드를 확인하는 중...";
    state.terminalIds.clear();
    $("#terminalLines").innerHTML = '<p class="terminal-system">$ connecting to public comment stream...</p>';
    $("#terminalCount").textContent = "0 comments";
  } else {
    $("#loadingPercent").textContent = "100%";
  }
}

function showProgress(progress) {
  $("#loadingPercent").textContent = `${progress.percent}%`;
  for (const comment of progress.recent || []) {
    if (state.terminalIds.has(comment.id)) continue;
    state.terminalIds.add(comment.id);
    const line=document.createElement("p"); line.innerHTML=`<b>${escapeHtml(comment.author)}</b><span>${escapeHtml(comment.text.slice(0,180))}</span>`; $("#terminalLines").append(line);
  }
  $("#terminalCount").textContent = `${number(state.terminalIds.size)} comments shown`;
  while ($("#terminalLines").children.length > 18) $("#terminalLines").firstElementChild.remove();
  $("#terminalLines").scrollTop=$("#terminalLines").scrollHeight;
  if (progress.stage === "classifying") $("#loadingMessage").textContent = `Jev 판정 ${number(progress.done)} / ${number(progress.total)}개 완료`;
  else if (progress.stage === "finalizing") $("#loadingMessage").textContent = "반복 문구와 작성자 활동을 집계하는 중...";
  else $("#loadingMessage").textContent = `공개 댓글과 답글 ${number(progress.done || 0)}개 수집됨`;
}

async function analyze({ demo = false } = {}) {
  const url = $("#youtubeUrl").value.trim();
  if (!demo && !url) { $("#formError").textContent = "YouTube 영상 링크를 입력해주세요."; return; }
  setLoading(true);
  const jobId = crypto.randomUUID();
  const progressTimer = setInterval(async () => { try { const response=await fetch(`/api/progress?id=${encodeURIComponent(jobId)}`); showProgress(await response.json()); } catch {} }, 500);
  try {
    const response = await fetch("/api/analyze", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ url, demo, jobId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "분석하지 못했습니다.");
    state.result = data;
    state.filter = "all";
    state.authorId = null;
    render(data);
    setLoading(false);
    $("#loading").classList.add("hidden");
    $("#results").classList.remove("hidden");
    $("#results").scrollIntoView({ behavior:"smooth", block:"start" });
  } catch (error) {
    setLoading(false); $("#loading").classList.add("hidden"); $("#formError").textContent = error.message;
  } finally { clearInterval(progressTimer); }
}

function percentage(count, total) { return total ? Math.round(count / total * 100) : 0; }
function number(value) { return new Intl.NumberFormat("ko-KR").format(value); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]); }

function render(data) {
  const { video, summary } = data;
  $("#videoChannel").textContent = video.channel;
  $("#videoTitle").textContent = video.title;
  const timing = data.timing?.collectionMs ? ` · 수집 ${(data.timing.collectionMs / 1000).toFixed(2)}초` : "";
  const sentimentEngine = data.sentimentEngine === "jev" ? "Jev" : "로컬 규칙";
  $("#videoMeta").textContent = `조회수 ${number(video.viewCount)} · 공개 댓글 ${number(video.commentCount)}${timing} · 감정 ${sentimentEngine}`;
  if (video.thumbnail) $("#videoThumb").style.backgroundImage = `linear-gradient(#0002,#0002),url('${video.thumbnail}')`;
  $("#totalCount").textContent = number(summary.total);
  $("#positiveCount").textContent = number(summary.sentiment.positive);
  $("#negativeCount").textContent = number(summary.sentiment.negative);
  $("#suspiciousCount").textContent = number(summary.suspicious);
  for (const key of ["positive","negative","suspicious"]) {
    const count = key === "suspicious" ? summary.suspicious : summary.sentiment[key];
    const rate = percentage(count, summary.total);
    $(`#${key}Rate`).textContent = `${rate}%`;
    requestAnimationFrame(() => { $(`#${key}Bar`).style.transform = `scaleX(${rate / 100})`; });
  }
  $("#donutTotal").textContent = number(summary.total);
  const parts = Object.entries(summary.sentiment).map(([key,count]) => ({ key,count,rate:summary.total ? count/summary.total*100 : 0 }));
  let angle = 0;
  const stops = parts.map((part) => { const start=angle; angle += part.rate; return `${colors[part.key]} ${start}% ${angle}%`; });
  $("#donut").style.background = `conic-gradient(${stops.join(",")})`;
  $("#legend").innerHTML = parts.map((part) => `<div class="legend-item"><i style="background:${colors[part.key]}"></i><span>${labels[part.key]}</span><b>${number(part.count)}</b></div>`).join("");
  const maxTopic = Math.max(...data.topics.map((topic) => topic.count), 1);
  $("#topics").innerHTML = data.topics.map((topic) => `<span class="topic" style="--size:${14 + topic.count/maxTopic*16}px">${escapeHtml(topic.term)} <b>${topic.count}</b></span>`).join("");
  document.querySelectorAll(".filter").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  renderAuthors();
  renderComments();
}

function authorKey(author) { return author.id || `name:${author.name}`; }

function renderAuthors() {
  const metric = state.filter === "all" ? "count" : state.filter;
  const metricLabel = { count:"전체 댓글", positive:"긍정 댓글", negative:"부정 댓글", suspicious:"의심 댓글" }[metric];
  const authors = [...(state.result.authors || [])].filter((author) => author[metric] > 0).sort((a,b) => b[metric] - a[metric] || b.count - a.count);
  $("#authorList").classList.toggle("hidden", Boolean(state.authorId));
  $("#authorList").innerHTML = authors.length ? authors.map((author, index) => `<button class="author-row" type="button" data-author="${escapeHtml(authorKey(author))}"><span class="author-rank">${index + 1}</span><span class="author-identity"><b>${escapeHtml(author.name)}</b><small>${escapeHtml(author.id || "채널 ID 없음")}</small></span><span class="author-mix">전체 댓글 ${number(author.count)}개 · 긍정 ${number(author.positive)}개 · 부정 ${number(author.negative)}개</span><strong>${metricLabel} ${number(author[metric])}개</strong><span class="author-chevron">›</span></button>`).join("") : '<p class="empty">이 기준에 해당하는 작성자가 없습니다.</p>';
}

function renderComments() {
  let comments = state.result.comments;
  if (state.authorId) {
    comments = comments.filter((comment) => (comment.authorChannelId || `name:${comment.author}`) === state.authorId);
    if (state.filter === "suspicious") comments = comments.filter((comment) => comment.suspicious.label);
    else if (state.filter !== "all") comments = comments.filter((comment) => comment.sentiment.label === state.filter);
  } else comments = [];
  comments = comments.slice(0, 50);
  const author = state.authorId ? state.result.authors.find((item) => authorKey(item) === state.authorId) : null;
  $("#selectedAuthor").classList.toggle("hidden", !author);
  $("#selectedAuthor").innerHTML = author ? `<button type="button" id="backToAuthors">← 작성자 순위</button><div><b>${escapeHtml(author.name)}</b><span>${number(author.count)}개 댓글</span></div>` : "";
  $("#commentList").innerHTML = comments.length ? comments.map((comment) => {
    const initial = [...comment.author][0] || "?";
    return `<div class="comment-row"><span>${escapeHtml(initial)}</span><div class="comment-body"><p>${escapeHtml(comment.text)}</p><small>${escapeHtml(comment.author)} · 좋아요 ${number(comment.likeCount)}</small>${comment.suspicious.reasons.length ? `<p class="reason">의심 근거: ${comment.suspicious.reasons.map(escapeHtml).join(" · ")}</p>`:""}</div><div class="badges"><span class="badge ${comment.sentiment.label}">${labels[comment.sentiment.label]}</span>${comment.suspicious.label ? `<span class="badge suspicious">의심 ${comment.suspicious.score}</span>`:""}</div></div>`;
  }).join("") : !state.authorId ? "" : '<p class="empty">이 조건에 해당하는 댓글이 없습니다.</p>';
}

function downloadCsv() {
  if (!state.result) return;
  const quote = (value) => `"${String(value ?? "").replaceAll('"','""')}"`;
  const rows = [["id","author","comment","sentiment","confidence","suspicious_score","suspicious_reasons","published_at"], ...state.result.comments.map((comment) => [comment.id,comment.author,comment.text,comment.sentiment.label,comment.sentiment.score,comment.suspicious.score,comment.suspicious.reasons.join(" | "),comment.publishedAt])];
  const blob = new Blob(["\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\n")], { type:"text/csv;charset=utf-8" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `comment-lens-${state.result.video.id}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

$("#analyzeForm").addEventListener("submit", (event) => { event.preventDefault(); analyze(); });
$("#downloadButton").addEventListener("click", downloadCsv);
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { state.filter=button.dataset.filter; state.authorId=null; document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active",item===button)); renderAuthors(); renderComments(); }));
$("#authorList").addEventListener("click", (event) => { const button=event.target.closest("[data-author]"); if (!button) return; state.authorId=button.dataset.author; renderAuthors(); renderComments(); });
$("#selectedAuthor").addEventListener("click", (event) => { if (!event.target.closest("#backToAuthors")) return; state.authorId=null; renderAuthors(); renderComments(); });
health();
