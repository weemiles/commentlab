const POSITIVE = [
  "좋아요", "좋다", "좋네요", "감사", "최고", "응원", "멋지", "재밌", "유익", "도움", "추천", "사랑", "대박", "훌륭", "행복",
  "good", "great", "amazing", "love", "helpful", "best", "awesome", "thanks", "beautiful", "excellent", "fun"
];
const NEGATIVE = [
  "싫어", "별로", "최악", "실망", "문제", "거짓", "짜증", "노잼", "불편", "화나", "혐오", "망했", "구리", "비추천",
  "bad", "worst", "hate", "boring", "disappoint", "terrible", "awful", "fake", "problem", "annoying"
];

function tokenize(text) {
  return text.toLowerCase().replace(/https?:\/\/\S+/g, " URL ").replace(/[^\p{L}\p{N}_]+/gu, " ").trim().split(/\s+/).filter(Boolean);
}

function normalizedText(text) {
  return tokenize(text).join(" ").replace(/(.)\1{2,}/g, "$1$1");
}

function ngrams(text, n = 3) {
  const value = normalizedText(text).replace(/\s/g, "");
  const result = new Set();
  for (let i = 0; i <= value.length - n; i += 1) result.add(value.slice(i, i + n));
  return result;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  if (a.size > b.size) [a, b] = [b, a];
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function similarityCounter(fingerprints, threshold) {
  const postings = new Map();
  fingerprints.forEach((fingerprint, index) => {
    for (const gram of fingerprint) {
      if (!postings.has(gram)) postings.set(gram, []);
      postings.get(gram).push(index);
    }
  });
  return (index, limit) => {
    const source = fingerprints[index];
    if (!source.size) return 0;
    // A qualifying set must share at least ceil(threshold * source.size)
    // grams. It therefore must hit this prefix; selecting rare grams keeps
    // candidates small without discarding any possible qualifying comment.
    const prefixLength = source.size - Math.ceil(threshold * source.size) + 1;
    const prefix = [...source].sort((a, b) => postings.get(a).length - postings.get(b).length).slice(0, prefixLength);
    const candidates = new Set();
    for (const gram of prefix) {
      for (const other of postings.get(gram)) {
        const size = fingerprints[other].size;
        if (other !== index && size >= threshold * source.size && size <= source.size / threshold) candidates.add(other);
      }
    }
    let count = 0;
    for (const other of candidates) {
      if (jaccard(source, fingerprints[other]) >= threshold && ++count === limit) break;
    }
    return count;
  };
}

function sentiment(text) {
  const value = text.toLowerCase();
  let positive = POSITIVE.filter((word) => value.includes(word)).length;
  let negative = NEGATIVE.filter((word) => value.includes(word)).length;
  const negations = (value.match(/(안|못|않|not|never)\s?\S+/g) || []).length;
  if (negations && positive > 0) negative += Math.min(positive, negations);
  if (/[❤♥👍🔥😍🥰😊👏]/u.test(value)) positive += 1;
  if (/[👎😡🤬😤💩]/u.test(value)) negative += 1;

  if (!positive && !negative) return { label: "neutral", score: 0.55 };
  if (positive && negative) {
    const difference = Math.abs(positive - negative);
    if (difference <= 1) return { label: "mixed", score: 0.58 };
  }
  const label = positive > negative ? "positive" : "negative";
  const score = Math.min(0.96, 0.58 + Math.abs(positive - negative) * 0.12);
  return { label, score };
}

function topTerms(comments, limit = 50) {
  const stopwords = new Set(["그리고", "그런데", "이렇게", "저렇게", "정말", "진짜", "영상", "댓글", "하는", "있는", "없는", "입니다", "너무", "그냥", "with", "this", "that", "from", "have", "your", "video", "very", "just", "the", "and", "for", "you"]);
  const counts = new Map();
  for (const comment of comments) {
    for (const term of tokenize(comment.text)) {
      if (term.length < 2 || stopwords.has(term) || /^\d+$/.test(term)) continue;
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([term, count]) => ({ term, count }));
}

function summarizeOpinion(cluster, commentsById) {
  const members = cluster.commentIds.map((id) => commentsById.get(id)).filter(Boolean);
  const commonTerms = topTerms(members, 5).filter(({ count, term }) => count >= 2 && term !== "url");
  const terms = (commonTerms.length ? commonTerms : topTerms(members, 2)).slice(0, 2).map(({ term }) => term);
  const labels = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  for (const member of members) labels[member.sentiment?.label || "neutral"] += 1;
  const dominant = Object.keys(labels).sort((a, b) => labels[b] - labels[a])[0];
  const english = members.some(({ text }) => /[a-z]{3,}/i.test(text)) && !members.some(({ text }) => /[가-힣]/.test(text));
  const subject = terms.length ? terms.map((term) => `‘${term}’`).join("·") : (english ? "This topic" : "이 주제");
  if (english) return `Similar ${dominant} reactions about ${terms.join(" and ") || "this topic"} appear repeatedly.`;
  const reaction = { positive: "긍정적인", negative: "부정적인", neutral: "중립적인", mixed: "다양한" }[dominant];
  return `${subject}에 관한 ${reaction} 의견이 반복됩니다.`;
}

function opinionGroups(comments, limit = 30) {
  const clusters = [];
  const candidates = comments
    .filter((comment) => normalizedText(comment.text).length >= 12)
    .sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  for (const comment of candidates) {
    const fingerprint = ngrams(comment.text);
    let match = null;
    let best = 0;
    for (const cluster of clusters) {
      const similarity = jaccard(fingerprint, cluster.fingerprint);
      if (similarity > best) { best = similarity; match = cluster; }
    }
    if (match && best >= 0.16) {
      match.count += 1;
      match.likes += comment.likeCount || 0;
      match.commentIds.push(comment.id);
    } else if (clusters.length < 200) {
      clusters.push({ representative: comment.text, fingerprint, count: 1, likes: comment.likeCount || 0, commentIds: [comment.id] });
    }
  }
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  return clusters
    .filter((cluster) => cluster.count >= 2)
    .sort((a, b) => b.count - a.count || b.likes - a.likes)
    .slice(0, limit)
    .map(({ fingerprint, ...cluster }) => ({ ...cluster, summary: summarizeOpinion(cluster, commentsById) }));
}

export function analyzeComments(comments, sentiments = null) {
  const exactCounts = new Map();
  const authorCounts = new Map();
  for (const comment of comments) {
    const normalized = normalizedText(comment.text);
    if (normalized.length >= 8) exactCounts.set(normalized, (exactCounts.get(normalized) || 0) + 1);
    if (comment.authorChannelId) authorCounts.set(comment.authorChannelId, (authorCounts.get(comment.authorChannelId) || 0) + 1);
  }

  const fingerprints = comments.map((comment) => ngrams(comment.text));
  const countSimilar = similarityCounter(fingerprints, 0.72);
  const analyzed = comments.map((comment, index) => {
    const normalized = normalizedText(comment.text);
    const reasons = [];
    let suspicious = 0;
    const duplicateCount = exactCounts.get(normalized) || 0;
    if (duplicateCount >= 3) {
      suspicious += Math.min(55, 25 + duplicateCount * 5);
      reasons.push(`서로 다른 댓글 ${duplicateCount}건에서 동일 문구 확인`);
    }
    if ((comment.text.match(/https?:\/\//g) || []).length) {
      suspicious += 18;
      reasons.push("외부 링크 포함");
    }
    if (/(.)\1{5,}/u.test(comment.text) || (comment.text.match(/[🔥❤👍💯]/gu) || []).length >= 6) {
      suspicious += 14;
      reasons.push("문자·이모지 과다 반복");
    }
    const authorCount = comment.authorChannelId ? authorCounts.get(comment.authorChannelId) || 0 : 0;
    if (authorCount >= 5) {
      suspicious += Math.min(20, authorCount * 2);
      reasons.push(`동일 작성자 ${authorCount}개 게시`);
    }

    let similarCount = 0;
    if (normalized.length >= 15 && duplicateCount < 3) {
      similarCount = countSimilar(index, 4);
      if (similarCount >= 2) {
        suspicious += 28;
        reasons.push(`유사 문구 ${similarCount}개 발견`);
      }
    }

    return {
      ...comment,
      sentiment: sentiments?.[index] || sentiment(comment.text),
      suspicious: {
        score: Math.min(99, suspicious),
        label: suspicious >= 45,
        reasons
      },
      authorCommentCount: authorCount
    };
  });

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  analyzed.forEach((comment) => { sentimentCounts[comment.sentiment.label] += 1; });
  const suspiciousComments = analyzed.filter((comment) => comment.suspicious.label);
  const authors = new Map();
  for (const comment of analyzed) {
    const key = comment.authorChannelId || `name:${comment.author}`;
    const current = authors.get(key) || { id: comment.authorChannelId, name: comment.author, count: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, suspicious: 0 };
    current.count += 1;
    current[comment.sentiment.label] += 1;
    if (comment.suspicious.label) current.suspicious += 1;
    authors.set(key, current);
  }

  return {
    summary: {
      total: analyzed.length,
      sentiment: sentimentCounts,
      suspicious: suspiciousComments.length,
      suspiciousRate: analyzed.length ? suspiciousComments.length / analyzed.length : 0
    },
    topics: topTerms(comments),
    opinions: opinionGroups(analyzed),
    authors: [...authors.values()].sort((a, b) => b.count - a.count),
    comments: analyzed.sort((a, b) => b.suspicious.score - a.suspicious.score)
  };
}
