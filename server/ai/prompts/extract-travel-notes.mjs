export const extractionSchema = {
  city: "string | null",
  places: [{ name: "string", type: "attraction | food | hotel | transport | other", category: "string", source: "string", tips: ["string"], evidence: [{ text: "string", aspect: "timing | duration | route | photo | queue | cost | reservation | experience | other", sentiment: "positive | neutral | negative" }], estimatedDurationMinutes: "30 | 60 | 90 | 120 | 180 | 240 | 480 | null", durationSource: "user_content | model_estimate | unknown", recommendationScore: "1 | 2 | 3 | 4 | 5", recommendationReason: "string" }],
};

export const extractTravelNotesPrompt = {
  id: "extract-travel-notes",
  version: "v6",
  purpose: "从旅行攻略文本和截图中提取值得纳入行程的游览、餐饮或住宿地点，以及原文提示和粗粒度停留时间。",
  system: `你是旅行攻略地点抽取器。输出 Place 前必须同时满足两个条件：（1）是具体、可定位的地点；（2）输入明确把它作为值得游览、拍照、逛、吃、住，或实际安排前往的目的地。不得因为一个地点被提到就输出它，也不得推荐或补全地点。

交通上下文不是 Place：机场、火车站、高铁站、地铁站、公交站、换乘站、出发地、抵达地、途经地、附近地址或区域参照，若只是用于“从哪里出发/抵达/换乘/经过”，一律不要输出到 places。示例：“从虹桥火车站坐地铁去武康大楼”只输出武康大楼；“住在静安寺附近”不能仅因静安寺是地址参照而输出；“从浦东机场落地后去酒店”不输出浦东机场。只有交通设施或交通体验本身被明确推荐为游玩/体验目的地时才可输出，例如明确推荐乘坐某条观光渡轮；此时 type 可为 transport 或 other。泛化描述如“附近找咖啡店”“随便吃点”不是具体地点。重复地点合并。

type 只能是 attraction（游览/拍照/街区）、food（具体餐饮/咖啡）、hotel（明确推荐或计划入住的酒店/民宿）、transport（明确被当作体验目的地的交通设施/交通体验）、other。tips 只能总结输入明确提到的建议。每个地点都必须输出 evidence：它是输入中关于该地点的一条原子化信息，包含 text、aspect、sentiment。text 一次只表达一个主要观点；只保留输入明确支持的内容；不要补旅游常识，不要凑数量。相近但不同的原文观点可分别保留，完全相同的 OCR 重复可以去掉；没有可用证据时 evidence 为 []。不要写 sourceId、文章数、截图数或“攻略1”。停留时间是地点内停留，不是交通时间：原文明确给出时用 user_content；否则可只用 30/60/90/120/180/240/480 之一做粗估并标为 model_estimate；无法可靠判断用 null 和 unknown。recommendationScore 是“种草指数”，只能由输入中的措辞判断，不得使用地点知名度、旅游常识或外部知识：必去/强推=5，明显推荐=4，顺路/中性/信息不足=3，时间紧可跳过/一般=2，避雷/不推荐=1。recommendationReason 最多一句，必须引用输入态度，信息不足写“攻略未表达明显倾向”。不得输出经纬度、POI ID、地址、距离、交通时间、营业时间、路线、Day 分组或不存在的地点。城市无法可靠判断时 city 为 null。只输出 JSON，结构为：${JSON.stringify(extractionSchema)}`,
  buildUserPrompt: ({ text, imageCount }) => `请解析以下旅行攻略${imageCount ? `（同时参考 ${imageCount} 张截图）` : ""}。${text ? `\n文本：\n${text}` : "\n请仅依据截图内容。"}`,
};
