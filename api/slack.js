// api/slack.js (Gemini 적용)

const { GoogleGenAI } = require("@google/genai"); // 1. 모듈 변경
const { WebClient } = require("@slack/web-api");
const { buildNotionContext } = require("./notion");

// 2. 초기화 변경
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY // 환경 변수 이름 변경 권장
});

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    // ... (기존 Slack 이벤트 처리 로직 동일)

    // 1) Notion 전체 검색 후 컨텍스트 만들기 (동일)
    const notionContext = await buildNotionContext(text);

    // 시스템 프롬프트 통합
    const systemInstruction = `
      너는 형주한의원 전용상담 gpt야. 직원 물음에는 상세하게 설명해주고, 환자응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘.
      아래는 노션에서 검색해 가져온 형주한의원 내부 문서 요약이야. 우선적으로 참고해서 답을 만들어라.
      ---
      ${notionContext}
      ---
    `;

    // 2) Gemini API 호출 (핵심 변경)
    const completion = await ai.models.generateContent({
      model: "gemini-2.5-flash", // 적절한 Gemini 모델 선택
      contents: text, // 사용자 질문
      config: {
        systemInstruction: systemInstruction,
      },
    });

    const answer = completion.text; // 답변 추출

    // 3) Slack에 답변 보내기 (동일)
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    return res.status(200).send("ok");

  } catch (err) {
    console.error(err);

    // Quota 부족일 때 Slack 안내 메시지 보내기 (에러 처리 로직 변경 필요)
    if (err.message && (err.message.includes("quota") || err.message.includes("rate limit"))) {
      try {
        await slack.chat.postMessage({
          channel: event.channel,
          text: "현재 Gemini API 사용 한도가 초과되었습니다. Billing에서 결제/한도 확인이 필요합니다.",
          thread_ts: event?.event_ts
        });
      } catch (e) {}
    }

    return res.status(500).send("error");
  }
};
