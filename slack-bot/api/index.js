// api/index.js
const { Client } = require('@notionhq/client');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 환경변수 가져오기
const notion = new Client({ auth: process.env.NOTION_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const databaseId = process.env.NOTION_DB_ID;

export default async function handler(req, res) {
  // 슬랙이 보내는 요청인지 확인 (POST만 허용)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 슬랙에서 보낸 질문 내용 (text)
    const query = req.body.text; 

    if (!query) {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: '검색어를 입력해주세요. 예: /질문 [내용]'
      });
    }

    // 1. 노션 검색
    const notionResponse = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Name", // *주의: 데이터베이스의 제목 컬럼명이 '이름'이나 'Name'이어야 함. 다르면 수정 필요*
        title: {
          contains: query,
        },
      },
      page_size: 3, // 상위 3개만 참고
    });

    if (notionResponse.results.length === 0) {
      return res.status(200).json({
        response_type: 'in_channel',
        text: `🤔 노션에서 '${query}' 관련 문서를 찾지 못했습니다.`
      });
    }

    // 2. 검색된 노션 페이지들의 정보 요약
    let context = "";
    for (const page of notionResponse.results) {
      // 제목 가져오기 (구조가 복잡함)
      const titleProp = page.properties["Name"] || page.properties["이름"] || page.properties["Title"];
      const title = titleProp?.title[0]?.plain_text || "제목 없음";
      const url = page.url;
      context += `- 문서 제목: ${title}\n- 링크: ${url}\n\n`;
    }

    // 3. 제미나이에게 질문하기
    const model = genAI.getGenerativeModel({ model: "gemini-pro"});
    const prompt = `
      당신은 친절한 업무 도우미입니다. 사용자가 질문을 했습니다.
      아래 제공된 [노션 검색 결과]를 바탕으로 답변을 해주세요.
      문서의 링크도 함께 알려주세요.

      [사용자 질문]: ${query}

      [노션 검색 결과]:
      ${context}
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 4. 슬랙으로 답변 전송
    return res.status(200).json({
      response_type: 'in_channel', // 모두에게 보이게 하려면 in_channel, 혼자 보려면 ephemeral
      text: text
    });

  } catch (error) {
    console.error(error);
    return res.status(200).json({
        response_type: 'ephemeral',
        text: `오류가 발생했습니다: ${error.message}`
    });
  }
}