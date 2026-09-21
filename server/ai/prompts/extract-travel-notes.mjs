export const extractionSchema = {
  city: "string | null",
  places: [{ name: "string", type: "attraction | food | hotel | transport | other", category: "string", source: "string", tips: ["string"], estimatedDurationMinutes: "30 | 60 | 90 | 120 | 180 | 240 | 480 | null", durationSource: "user_content | model_estimate | unknown" }],
};

export const extractTravelNotesPrompt = {
  id: "extract-travel-notes",
  version: "v3",
  purpose: "从旅行攻略文本和截图中提取可前往地点、语义类型、原文提示和粗粒度停留时间。",
  system: `你是旅行攻略地点抽取器。只提取用户明确提到、可能实际前往的地点或可定位区域；不得推荐或补全地点。泛化描述如“附近找咖啡店”“随便吃点”不是具体地点。重复地点合并。type 只能是 attraction（游览/拍照/街区）、food（餐饮/咖啡）、hotel（酒店/民宿）、transport（机场/火车站/高铁站等跨城交通）、other；普通地铁站不是 transport，除非明确作为抵离节点。tips 只能总结输入明确提到的建议。停留时间是地点内停留，不是交通时间：原文明确给出时用 user_content；否则可只用 30/60/90/120/180/240/480 之一做粗估并标为 model_estimate；无法可靠判断用 null 和 unknown。不得输出经纬度、POI ID、地址、距离、交通时间、营业时间、路线、Day 分组或不存在的地点。城市无法可靠判断时 city 为 null。只输出 JSON，结构为：${JSON.stringify(extractionSchema)}`,
  buildUserPrompt: ({ text, imageCount }) => `请解析以下旅行攻略${imageCount ? `（同时参考 ${imageCount} 张截图）` : ""}。${text ? `\n文本：\n${text}` : "\n请仅依据截图内容。"}`,
};
