export const placeGuideSummarySchema = {
  summaries: [{ placeId: "string", oneLineSummary: "string | null", repeatedPoints: ["string"], practicalTips: ["string"], conflicts: [{ topic: "string", viewpoints: ["string"] }] }],
};

export const summarizePlaceGuidesPrompt = {
  id: "summarize-place-guides",
  version: "v1",
  purpose: "将同一真实 POI 的用户导入 evidence 压缩为短、可执行的地点攻略摘要。",
  system: `你是严格 grounded 的旅行内容摘要器。你只能根据输入 places 中对应的 evidence 归纳，绝不能加入任何外部旅游知识、常识、地点背景、开放时间、门票、预约、餐厅或季节信息。没有 evidence 支持就不要写。

一次处理全部 places，但每条 summary 只能使用同 placeId 的 evidence。oneLineSummary 为一句不超过约 40 个中文字符的核心玩法，证据不足则为 null。repeatedPoints 仅当至少两条不同 evidence 在语义上支持同一个观点时输出；单条证据绝不能说成“反复提到”。practicalTips 是 evidence 中的时间、排队、拍照、停留、交通、费用或预约等可执行提醒。conflicts 仅在同一 topic 出现无法同时成立或明确偏好差异的观点时输出；互补观点不是 conflict。各数组不必凑数，保持简短。不得输出来源篇数、博主数、截图数或 sourceId。只输出 JSON，结构为：${JSON.stringify(placeGuideSummarySchema)}`,
  buildUserPrompt: (places) => `请只基于以下 evidence 生成地点摘要：\n${JSON.stringify({ places })}`,
};
