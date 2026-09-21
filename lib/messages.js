// User-facing text is chosen by code, never by concatenating an upstream
// string. YouTube, the collector and the provider can all put arbitrary text in
// an error; that text belongs in the server log, not in a visitor's response.
const MESSAGES = {
  method_not_allowed: {
    ko: '허용되지 않은 요청입니다.',
    en: 'This request method is not allowed.'
  },
  invalid_path: {
    ko: '잘못된 경로입니다.',
    en: 'Invalid path.'
  },
  request_too_large: {
    ko: '요청이 너무 큽니다.',
    en: 'The request is too large.'
  },
  invalid_url: {
    ko: '올바른 YouTube 영상 링크를 입력해주세요.',
    en: 'Enter a valid YouTube video link.'
  },
  visitor_key_required: {
    ko: '본인의 Jev API 키를 입력해주세요.',
    en: 'Enter your own Jev API key.'
  },
  api_key_required: {
    ko: 'Jev API 키가 설정되지 않았습니다.',
    en: 'No Jev API key is configured.'
  },
  access_required: {
    ko: '접근 암호가 필요하거나 올바르지 않습니다.',
    en: 'Access password required or incorrect.'
  },
  access_unconfigured: {
    ko: '배포 접근 설정이 되어 있지 않습니다.',
    en: 'Deployment access is not configured.'
  },
  invalid_collect_request: {
    ko: '올바른 댓글 수집 요청이 아닙니다.',
    en: 'This is not a valid comment collection request.'
  },
  unsupported_collect_path: {
    ko: '지원하지 않는 댓글 요청 경로입니다.',
    en: 'This comment request path is not supported.'
  },
  collector_unavailable: {
    ko: '댓글 수집 서버에 연결하지 못했습니다.',
    en: 'The comment collector could not be reached.'
  },
  comments_unavailable: {
    ko: '댓글이 비활성화됐거나 공개 댓글이 없습니다.',
    en: 'Comments are disabled or this video has no public comments.'
  },
  youtube_request_failed: {
    ko: 'YouTube 요청에 실패했습니다 ({status}).',
    en: 'The YouTube request failed ({status}).'
  },
  youtube_rate_limited: {
    ko: 'YouTube가 이 서버의 댓글 요청을 일시적으로 제한했습니다. 잠시 후 다시 시도해주세요.',
    en: 'YouTube is temporarily limiting comment requests from this server. Try again shortly.'
  },
  youtube_unavailable: {
    ko: 'YouTube에서 댓글 데이터를 읽지 못했습니다. 잠시 후 다시 시도해주세요.',
    en: 'Comment data could not be read from YouTube. Try again shortly.'
  },
  youtube_rejected: {
    ko: 'YouTube가 이 영상의 댓글 요청을 거부했습니다.',
    en: 'YouTube rejected the comment request for this video.'
  },
  channel_not_found: {
    ko: '영상에서 채널 정보를 찾지 못했습니다.',
    en: 'The channel could not be identified from this video.'
  },
  jev_failed: {
    ko: 'Jev 분석을 완료하지 못했습니다. 잘못된 중립 결과로 대체하지 않았습니다. 잠시 후 다시 시도해주세요.',
    en: 'Jev analysis could not be completed. Nothing was replaced with incorrect neutral labels. Try again shortly.'
  },
  jev_invalid_answer: {
    ko: 'Jev가 유효한 태도 판정을 반환하지 않았습니다.',
    en: 'Jev did not return a valid attitude classification.'
  },
  jev_request_failed: {
    ko: 'Jev API가 오류를 반환했습니다 ({status}).',
    en: 'The Jev API returned an error ({status}).'
  },
  unknown: {
    ko: '분석 중 알 수 없는 오류가 발생했습니다.',
    en: 'An unknown error occurred during analysis.'
  }
};

export function messageFor(code, language = 'ko', params = {}) {
  const entry = MESSAGES[code] || MESSAGES.unknown;
  const text = language === 'en' ? entry.en : entry.ko;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Korean stays the default message so logs and direct library use read as
// before; the HTTP layer re-resolves the same code in the visitor's language.
export function localeError(code, { status, params, cause } = {}) {
  const error = new Error(messageFor(code, 'ko', params), cause ? { cause } : undefined);
  error.code = code;
  if (params) error.params = params;
  if (status) error.status = status;
  return error;
}

// Anything without a known code becomes the generic message, so an upstream
// string can never reach the client.
export function publicMessage(error, language = 'ko') {
  const code = error?.code && Object.hasOwn(MESSAGES, error.code) ? error.code : 'unknown';
  return messageFor(code, language, error?.params);
}

export function requestLanguage(request, body) {
  const requested = body?.analysisLanguage;
  if (requested === 'en' || requested === 'ko') return requested;
  const header = String(request?.headers?.['accept-language'] || '');
  if (!header) return 'ko';
  return /\bko\b/i.test(header) ? 'ko' : 'en';
}
