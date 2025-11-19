// api/notion.js
const { Client } = require("@notionhq/client");

const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

/**
 * 노션 전체 검색해서 질문과 관련 있는 페이지들의 텍스트를 모아
 * 하나의 긴 context 문자열로 반환하는 함수
 */
async function buildNotionContext(query, maxPages = 3) {
  if (!process.env.NOTION_API_KEY) {
    console.warn("NOTION_API_KEY is not set");
    return "";
  }

  if (!query || !query.trim()) {
    return "";
  }

  // 1) 노션 전체 검색
  const searchResponse = await notion.search({
    query,
    sort: {
      direction: "descending",
      timestamp: "last_edited_time"
    },
    page_size: maxPages
  });

  const results = searchResponse.results || [];
  if (results.length === 0) {
    return "";
  }

  let contextChunks = [];

  // 2) 각 검색 결과 페이지에서 텍스트 블록 뽑기
  for (const result of results) {
    if (result.object !== "page") continue;

    const pageId = result.id;

    // 페이지의 child blocks 가져오기 (최대 50개)
    const blocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 50
    });

    const texts = [];

    for (const block of blocks.results) {
      // 단락(paragraph)
      if (block.type === "paragraph") {
        const richTexts = block.paragraph.rich_text || [];
        const plain = richTexts.map((t) => t.plain_text).join("");
        if (plain.trim()) texts.push(plain.trim());
      }

      // 제목(heading_1~3)
      if (
        block.type === "heading_1" ||
        block.type === "heading_2" ||
        block.type === "heading_3"
      ) {
        const richTexts = block[block.type].rich_text || [];
        const plain = richTexts.map((t) => t.plain_text).join("");
        if (plain.trim()) texts.push("# " + plain.trim());
      }

      // 불릿 리스트(bulleted_list_item)
      if (block.type === "bulleted_list_item") {
        const richTexts = block.bulleted_list_item.rich_text || [];
        const plain = richTexts.map((t) => t.plain_text).join("");
        if (plain.trim()) texts.push("- " + plain.trim());
      }
    }

    if (texts.length > 0) {
      const joined = texts.join("\n");
      contextChunks.push(joined);
    }
  }

  if (contextChunks.length === 0) {
    return "";
  }

  // 3) 여러 페이지 내용을 하나의 문자열로 합치기
  let context = contextChunks.join("\n\n---\n\n");

  // 너무 길어지면 앞부분만 사용 (토큰 제한 방지)
  const MAX_CHARS = 6000;
  if (context.length > MAX_CHARS) {
    context = context.slice(0, MAX_CHARS) + "\n\n...[이후 내용 생략]";
  }

  return context;
}

module.exports = {
  buildNotionContext
};
