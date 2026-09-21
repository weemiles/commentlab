import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const KO_LABELS = {
  positive: "영상·인물·주제에 호의적인 태도: 호감, 칭찬, 응원, 감사, 재미, 감동, 공감, 뭉클함 또는 좋은 결과를 바라는 반응",
  negative: "영상·인물·주제에 비호의적인 태도: 비판, 불만, 비호감, 조롱, 분노, 혐오, 실망, 의심 또는 나쁜 평가",
  mixed: "긍정과 부정이 한 댓글에 모두 뚜렷하게 존재하는 반응",
  neutral: "감정이나 평가가 전혀 없는 순수 정보, 단순 질문, 인용, 타임스탬프 또는 의미 판독 불가"
};

const KO_RULES = `감정의 밝고 어두움이 아니라 영상·인물·주제에 대한 태도를 판단한다. 감동해서 울었다, 마음 아프지만 응원한다, 웃기다는 반응은 positive다. ㅋㅋ/ㅎㅎ가 대상을 조롱하거나 비난하면 negative다. ㅠㅠ도 감동·공감이면 positive, 불만·비난이면 negative다. 반어법, 부정어, 욕설이 향하는 대상도 고려한다. 태도가 조금이라도 드러나면 positive 또는 negative를 우선하고 neutral은 완전히 객관적인 정보나 단순 질문에만 쓴다. 상반된 태도가 모두 강할 때만 mixed를 쓴다.`;

const EN_LABELS = {
  positive: "A favorable stance toward the video, people, or topic: praise, support, gratitude, amusement, empathy, being moved, or wishing for a good outcome.",
  negative: "An unfavorable stance toward the video, people, or topic: criticism, dislike, ridicule, anger, disgust, disappointment, suspicion, or a bad evaluation.",
  mixed: "Both a clearly favorable and a clearly unfavorable stance are present in the same comment.",
  neutral: "No stance or evaluation: purely factual information, a simple question, quotation, timestamp, or genuinely uninterpretable text."
};

const EN_RULES = `Judge the comment's stance toward the video, person, or topic—not whether its emotion merely sounds happy or sad. Being moved to tears, feeling sad for someone while supporting them, and finding something funny are positive. Laughter used to mock or attack the subject is negative. Resolve sarcasm, negation, slang, and the target of profanity from context. Prefer positive or negative whenever any stance is expressed. Use neutral only for truly objective information or simple questions, and mixed only when opposing stances are both substantial.`;

export function sentimentProfile(language = "ko") { return language === "en" ? { labels: EN_LABELS, rules: EN_RULES } : { labels: KO_LABELS, rules: KO_RULES }; }
let cachedConfig;

function parseEnv(value) {
  const parsed = {};
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    parsed[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return parsed;
}

async function config() {
  if (cachedConfig) return cachedConfig;
  const candidates = [process.env.JEV_ENV_PATH, join(dirname(process.cwd()), "jev-ultrafast", ".env"), join(process.cwd(), "../jev-ultrafast/.env")].filter(Boolean);
  let fileEnv = {};
  for (const path of candidates) {
    try { fileEnv = parseEnv(await readFile(path, "utf8")); break; } catch {}
  }
  const apiKey = process.env.TYPESAFE_API_KEY || fileEnv.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error("Jev TypeSafe API 키를 찾지 못했습니다.");
  cachedConfig = { apiKey, model: process.env.TYPESAFE_MODEL || fileEnv.TYPESAFE_MODEL || "jev-latest" };
  return cachedConfig;
}

function chunks(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function bestAnswer(answer) {
  if (!answer || !KO_LABELS[answer.choice]) throw new Error("Jev가 유효한 감정 판정을 반환하지 않았습니다.");
  const probabilities = answer.probabilities || {};
  const score = Number(probabilities[answer.choice] ?? answer.confidence ?? 0);
  return { label: answer.choice, score: Math.max(0, Math.min(1, score)), probabilities };
}

async function classifyBatch(batch, offset, jevConfig, language) {
  const { labels, rules } = sentimentProfile(language);
  const questions = {};
  batch.forEach((comment, index) => {
    questions[`comment_${offset + index}`] = { type: "choice", criteria: labels, instructions: {
      comment: comment.text.slice(0, 1800),
      parent_comment: comment.parentText?.slice(0, 900) || null,
      rules,
      reply_context_rule: language === "en"
        ? "If this is a reply, judge its stance toward the video's person or topic. Agreement with the parent inherits the parent's stance; rebuttal may reverse it. Do not label a reply positive merely because its tone or emoji is cheerful."
        : "답글이면 영상의 인물·주제에 대한 태도를 판정한다. 원댓글에 동의하면 원댓글의 태도를 이어받고, 반박하면 반대로 볼 수 있다. 말투나 이모지가 밝다는 이유만으로 긍정 처리하지 않는다."
    } };
  });
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { authorization: `Bearer ${jevConfig.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: jevConfig.model, state: { task: "YouTube 댓글 감정 분류" }, questions }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`Jev API가 HTTP ${response.status}를 반환했습니다.`);
  const result = await response.json();
  return batch.map((_, index) => bestAnswer(result.answers?.[`comment_${offset + index}`]));
}

export async function classifySentimentWithJev(comments, { language = "ko", batchSize = 60, concurrency = 6, onProgress = () => {} } = {}) {
  if (!comments.length) return { sentiments: [], model: "jev", requestCount: 0 };
  const jevConfig = await config();
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const prepared = comments.map((comment) => ({ ...comment, parentText: comment.parentId ? byId.get(comment.parentId)?.text || null : null }));
  const groups = chunks(prepared, batchSize);
  const outputs = new Array(groups.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < groups.length) {
      const index = cursor++;
      outputs[index] = await classifyBatch(groups[index], index * batchSize, jevConfig, language);
      completed += groups[index].length;
      onProgress(completed, comments.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, worker));
  return { sentiments: outputs.flat(), model: jevConfig.model, requestCount: groups.length };
}
