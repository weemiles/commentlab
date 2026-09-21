export const demoVideo = {
  id: "demo0000000",
  title: "작지만 오래가는 브랜드를 만드는 방법",
  channel: "JEV LAB",
  thumbnail: null,
  publishedAt: "2026-09-18T09:00:00Z",
  commentCount: 1284,
  viewCount: 48792
};

const seed = [
  ["브랜드를 운영하면서 고민하던 부분인데 정말 도움이 됐어요. 다음 편도 기대할게요!", "민서"],
  ["내용이 현실적이라 좋네요. 특히 마지막 사례가 인상 깊었습니다 👍", "도윤"],
  ["광고가 너무 많아서 집중하기 어려웠어요. 핵심은 좋지만 조금 아쉽습니다.", "해나"],
  ["설명은 좋은데 실제 비용이나 실패 사례도 같이 보여주면 좋겠어요.", "준"],
  ["최고의 영상입니다 🔥🔥🔥🔥🔥🔥 지금 바로 무료 수익 확인 https://spam.example", "성공비결"],
  ["최고의 영상입니다 🔥🔥🔥🔥🔥🔥 지금 바로 무료 수익 확인 https://spam.example", "부자되기"],
  ["최고의 영상입니다 🔥🔥🔥🔥🔥🔥 지금 바로 무료 수익 확인 https://spam.example", "경제자유"],
  ["소규모 팀 이야기가 제 상황과 비슷해서 공감했습니다.", "서윤"],
  ["이 접근은 장기적으로는 문제가 있을 것 같아요. 고객 인터뷰가 먼저 아닐까요?", "현우"],
  ["응원합니다!", "태오"],
  ["정보 감사합니다. 저장해두고 다시 볼게요.", "유나"],
  ["그냥 뻔한 이야기 아닌가요? 기대했는데 실망입니다.", "익명"],
  ["제품보다 고객의 언어를 먼저 수집한다는 말이 핵심 같네요.", "소영"],
  ["영상에서 소개한 인터뷰 질문 목록도 공유해 주실 수 있나요?", "지후"],
  ["좋다는 의견도 이해하지만 업종에 따라 결과는 많이 다를 것 같습니다.", "정민"]
];

export const demoComments = Array.from({ length: 128 }, (_, index) => {
  const [text, author] = seed[index % seed.length];
  const uniqueText = index < seed.length || text.includes("spam.example") ? text : `${text} (${index + 1})`;
  return {
    id: `demo-${index + 1}`,
    parentId: index % 5 === 0 ? "demo-parent" : null,
    author,
    authorChannelId: author === "성공비결" ? "spam-author" : `author-${index % 43}`,
    text: uniqueText,
    likeCount: (index * 7) % 91,
    publishedAt: new Date(Date.now() - index * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - index * 3600000).toISOString()
  };
});
