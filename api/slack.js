// api/slack.js
import { OpenAI } from "openai";
import { WebClient } from "@slack/web-api";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export default async function handler(req, res) {
  try {
    const body = req.body;

    // 1) Slack URL 검증 단계 (처음 한 번)
    if (body.type === "url_verification") {
      return res.status(200).send(body.challenge);
    }

    const event = body.event;

    // 2) 봇이 자기 자신한테 보내는 메시지는 무시
    if (event.bot_id) {
      return res.status(200).send("ignored");
    }

    // 3) 채널에서 멘션 포함된 텍스트
    // 예: "<@U1234ABCD> 다이어트 한약 복용법 알려줘"
    const text = (event.text || "").replace(/<@[^>]+>/, "").trim();

    // 4) OpenAI gpt-5.1 호출 (형주한의원 전용 상담 GPT 프롬프트)
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        {
          role: "system",
          content: "너는 형주한의원 전용상담 gpt야. 직원 물음에는 상세하게 설명해주고, 환자응대는 부드럽고 전문적이되, 의학적인 부분은 단호하게 해줘."
        },
        {
          role: "user",
          content: text
        }
      ]
    });

    const answer = completion.choices[0].message.content;

    // 5) Slack 채널에 답변 달기 (질문 메시지의 스레드로)
    await slack.chat.postMessage({
      channel: event.channel,
      text: answer,
      thread_ts: event.ts
    });

    res.status(200).send("ok");

  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
}
