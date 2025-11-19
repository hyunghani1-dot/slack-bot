// api/slack.js

const OpenAI = require("openai");
const { WebClient } = require("@slack/web-api");
const { searchNotion } = require("./notion");

// OpenAI 클라이언트
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Slack 클라이언트
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    // 1) Slack에서 오는 건 POST만 처리
    if (req.method !== "POST") {
      return res.status(200).send("OK");
    }

    const body = req.body || {};

    // 2) URL 검증 단계 (슬랙이 challenge 보내는 부분)
    if (body.type === "url_verification") {
      // Slack이 준 challenge 값을 그대로 돌려줘야 함
      return res.status(200).send(body.challenge);
    }

    const event = body.event || {};

    // 3) 봇이 자기 자신한테 보내는 메시지는 무시
    if (event.bot_id) {
      return res.status(200).send("ignored");
    }

    // 4) 멘션 텍스트에서 @봇이름 부분 제거
    const rawText = event.text || "";
    const text = rawText.replace(/<@[^>]+>/, "").trim();

    if (!text) {
      return res.status(200).send("no text");
    }

    // 5) OpenAI gpt-4.1 호출
   // 4-1) 노션에서 관련 내용 검색
const notionContext = await searchNotion(text);

// 5) OpenAI gpt-4.1-mini 호출 (노션 콘텍스트 포함)
let messages = [
  {
    role: "system",
    content:
      "너는 형주한의원 전용상담 gpt야. 직원 물음에는 상세하게 설명해주고, 환자응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘."
  }
];

// 노션에서 뭔가라도 찾았으면, 그 내용을 추가로 제공
if (notionContext) {
  messages.push({
    role: "system",
    content:
      "아래는 형주한의원 노션 문서에서 이 질문과 관련해 검색된 내용이야. 가능한 한 이 정보를 우선 참고해서 답변해.\n\n" +
      notionContext
  });
}

// 마지막에 유저 질문 추가
messages.push({
  role: "user",
  content: text
});

const completion = await openai.chat.completions.create({
  model: "gpt-4.1-mini",
  messages
});

    const answer = completion.choices[0].message.content;

    // 6) Slack 채널에 스레드로 답변 달기
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    return res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    return res.status(500).send("error");
  }
};
