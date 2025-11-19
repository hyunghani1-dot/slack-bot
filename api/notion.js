// api/notion.js

const { Client } = require("@notionhq/client");

// NOTION_API_KEY 로 클라이언트 생성
const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

// 노션에서 질문(query)로 전체 검색 후, 상위 페이지들의 텍스트를 합쳐서 반환
async function searchNotion(query) {
  // 노션 키 없으면 그냥 빈 문자열 리턴
  if (!process.env.NOTION_API_KEY) {
    console.warn("NOTION_API_KEY is missing");
    return "";
  }

  if (!query || !query.trim()) {
    return "";
  }

  // 1) 워크스페이스 전체 검색 (통합이 접근 가능한 범위 내)
  const searchResponse = await notion.search({
    query,
    sort: {
      direction: "descending",
      timestamp: "last_edited_time"
    },
    page_size: 5 // 상위 5개 결과만 사용
  });

  const pages = searchResponse.results.filter(r => r.object === "page");

  if (!pages.length) {
    return "";
  }

  let parts = [];

  // 2) 각 페이지에서 제목 + 주요 블록 텍스트 뽑기
  for (const page of pages) {
    let title = "Untitled";

    // 데이터베이스 페이지일 때 title 프로퍼티 추출
    try {
      const props = page.properties || {};
      const nameProp = props.Name || props.이름 || props.제목;

      if (nameProp && Array.isArray(nameProp.title)) {
        title = nameProp.title.map(t => t.plain_text).join("") || title;
      }
    } catch (e) {
      // 제목 못 가져와도 그냥 넘어감
    }

    // 블록(본문) 가져오기 – 너무 길어질 수 있으니 앞부분만
    const blocks = await notion.blocks.children.list({
      block_id: page.id,
      page_size: 50
    });

    const bodyText = blocks.results
      .map(block => {
        const rich = block[block.type]?.rich_text;
        if (!rich) return "";
        return rich.map(r => r.plain_text).join("");
      })
      .join("\n")
      .trim();

    if (!bodyText) continue;

    parts.push(`# ${title}\n${bodyText}`);
  }

  // 여러 페이지 내용을 하나의 큰 텍스트로 합치고, 너무 길면 자르기
  const context = parts.join("\n\n---\n\n");
  return context.slice(0, 6000); // 프롬프트 과도하게 길어지는 것 방지
}

module.exports = {
  searchNotion
};
