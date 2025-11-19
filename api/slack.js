// api/slack.js

const OpenAI = require("openai");
const { WebClient } = require("@slack/web-api");
const { buildNotionContext } = require("./notion");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(200).send("OK");
    }

    const body = req.body || {};

    // Slack URL Verification
    if (body.type === "url_verification") {
      return res.status(200).send(body.challenge);
    }

    const event = body.event || {};

    // Ignore bot messages
    if (event.bot_id) {
      return res.status(200).send("ignored");
    }

    // Clean text
    const rawText = event.text || "";
    const text = rawText.replace(/<@[^>]+>/, "").trim();
    if (!text) {
      return res.status(200).send("no text");
    }

    // 1) Notion 전체 검색 후 컨텍스트 만들기
    const notionContext = await buildNotionContext(text);

    // 2) OpenAI GPT 호출
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "너는 형주한의원 전용상담 gpt야. 직원 물음에는 상세하게 설명해주고, 환자응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘."
        },
        {
          role: "system",
          content:
            "아래는 노션에서 검색해 가져온 형주한의원 내부 문서 요약이야. 우선적으로 참고해서 답을 만들어라.\n\n" +
            notionContext
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const answer = completion.choices[0].message.content;  // ★ 여기! answer 변수 생성 완료

    // 3) Slack에 답변 보내기
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    return res.status(200).send("ok");

  } catch (err) {
    console.error(err);

    // Quota 부족일 때 Slack 안내 메시지 보내기
    if (err.code === "insufficient_quota") {
      try {
        await slack.chat.postMessage({
          channel: event.channel,
          text: "현재 OpenAI API 사용 한도가 초과되었습니다. Billing에서 결제/한도 확인이 필요합니다.",
          thread_ts: event?.event_ts
        });
      } catch (e) {}
    }

    return res.status(500).send("error");
  }
};
