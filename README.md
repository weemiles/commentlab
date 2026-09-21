# Comment Lens

유튜브 링크 하나로 공개 댓글과 답글을 수집하고, 감정 분포·자주 등장한 단어·매크로 의심 패턴을 보여주는 오픈소스 MVP입니다.

## 지금 되는 것

- API 키 없이 YouTube continuation을 직접 병렬 수집
- 고속 수집 실패 시 `yt-dlp` 자동 전환
- API 키가 있으면 YouTube Data API v3 수집 경로 사용
- 댓글 스레드에 생략된 답글까지 추가 수집
- 긍정 / 중립 / 부정 / 혼합 감정 분류
- 동일·유사 문구, 외부 링크, 과도한 반복, 작성 빈도 기반 의심 점수
- 결과 필터링 및 CSV 내보내기
- API 키 없이 실제 영상 분석 및 128개 댓글 데모
- 서버 측 API 키 보관과 분석 댓글 수 상한

> 감정 및 매크로 결과는 자동 추정치입니다. 특히 ‘매크로 의심’은 봇 여부를 단정하지 않으며 검토할 댓글을 찾는 보조 지표입니다.

## 실행

Node.js 20 이상과 `yt-dlp`가 필요합니다.

```bash
brew install yt-dlp
cp .env.example .env
npm start
```

브라우저에서 <http://127.0.0.1:4173>을 엽니다. YouTube API 키 없이도 공개 영상 링크를 바로 분석할 수 있습니다.

테스트:

```bash
npm test
```

## 선택: YouTube API 설정

1. Google Cloud 프로젝트를 만듭니다.
2. **YouTube Data API v3**를 활성화합니다.
3. API 키를 생성하고 가능하면 API 및 서버 IP 제한을 설정합니다.
4. `.env`의 `YOUTUBE_API_KEY`에 넣습니다.

키가 없으면 경량 continuation 수집기가 댓글·답글 요청만 최대 8개씩 병렬 처리합니다. 실패할 경우 `yt-dlp`로 자동 전환합니다. 키가 있으면 공식 API 경로가 우선 사용됩니다. 키는 브라우저로 전달되지 않으며 `.env`는 Git에서 제외됩니다.

동일 영상의 댓글 274개를 이 컴퓨터에서 비교한 결과, 경량 수집기는 3.62초(초당 75.7개), `yt-dlp`는 13.88초(초당 19.7개)였습니다. 영상과 네트워크 상태에 따라 결과는 달라질 수 있습니다.

## Jev와의 역할 분리

Jev/TypeSafe AI는 수집기가 아니라 대량 텍스트를 여러 선택 문제로 묶어 분류합니다. 현재 앱은 공개 continuation 수집기 또는 공식 API로 댓글을 모은 뒤, Jev가 댓글별 긍정·부정·혼합·중립 확률을 문맥적으로 판정합니다. Jev 호출이 실패할 때만 로컬 규칙으로 자동 전환합니다. [Jev Ultrafast](https://github.com/browser-use/jev-ultrafast)는 선택 기능으로 다음 UI 상태도 확인할 수 있습니다.

- 사용자가 로그인한 브라우저에서 영상과 댓글 공개 상태 확인
- API로 판단할 수 없는 UI 상태 확인
- 자연어로 분석 시작 및 결과 페이지 열기

Jev의 브라우저 에이전트 루프, 공개 페이지 수집, 댓글 분석은 서로 독립적으로 유지합니다.

선택적으로 현재 컴퓨터의 Jev 환경을 사용해 댓글 영역의 화면 상태를 점검할 수 있습니다. Jev의 TypeSafe 및 텍스트 모델 API 호출 비용이 발생할 수 있으므로 자동 실행하지 않습니다.

```bash
cd /path/to/jev-ultrafast
uv run --env-file .env python \
  /path/to/jev-youtube-comment-analyzer/scripts/inspect_with_jev.py \
  'https://www.youtube.com/watch?v=VIDEO_ID'
```

## 공개 배포 전 체크리스트

- 일일·IP별 작업 제한과 요청 큐
- 영상 ID + 댓글 갱신 시각 기반 캐시
- 개인정보 처리방침과 데이터 삭제 경로
- YouTube API 정책에 맞춘 원문 데이터 갱신·삭제
- 더 정확한 한국어 감정 모델 또는 선택적 LLM 재판정
- 악용 방지를 위한 API 키/IP 제한

## GitHub에서 배포

이 앱은 Node 서버와 비공개 Jev 키가 필요하므로 GitHub Pages가 아니라 GitHub 저장소와 Node 호스팅을 연결합니다. 저장소를 Render에 연결하면 루트의 `render.yaml`을 사용해 빌드·실행됩니다. Render 환경변수 `TYPESAFE_API_KEY`에는 TypeSafe 콘솔에서 발급한 키를 입력하고, 키는 GitHub에 커밋하지 않습니다.

## 구조

```text
public/                 의존성 없는 반응형 웹 UI
lib/youtube.js          YouTube Data API 수집
lib/youtube-fast.js     API 키 없는 병렬 continuation 수집
lib/youtube-public.js   yt-dlp 폴백 수집
lib/jev-sentiment.js  Jev 병렬 묶음 감정 판정
lib/analyzer.js  감정 집계·유사도·반복 패턴 분석
server.js        정적 파일 및 분석 API 서버
test/            오프라인 단위 테스트
```

## 라이선스

MIT
