import http from "node:http";
import { createServer as createViteServer, loadEnv } from "vite";

const env = loadEnv("", process.cwd(), "");
const port = 5173;
const categories = ["景点", "街区", "餐饮", "咖啡", "商场", "酒店", "交通", "其他"];
const systemPrompt = `你是旅行攻略地点抽取器。只提取用户明确提到、可能实际前往的地点或可定位区域。不得推荐原文没有的地点；不得输出经纬度、POI ID、距离、交通时间或营业时间；“附近找咖啡店”“随便吃点”等泛化描述不能提取。重复地点合并。tips 只能概括原文明确说过的建议。城市无法可靠判断时 city 为 null。只输出 JSON：{"city":string|null,"places":[{"name":string,"category":"景点|街区|餐饮|咖啡|商场|酒店|交通|其他","source":"攻略文本","tips":string[]}]}`;

function validResult(value) {
  return value && typeof value === "object" && (value.city === null || typeof value.city === "string") && Array.isArray(value.places) && value.places.every((place) => place && typeof place.name === "string" && categories.includes(place.category) && Array.isArray(place.tips) && place.tips.every((tip) => typeof tip === "string"));
}

async function callModel(text) {
  if (!env.LLM_API_KEY) throw new Error("缺少 LLM_API_KEY，无法解析攻略文本。");
  const endpoint = `${(env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "")}/chat/completions`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` },
      body: JSON.stringify({ model: env.LLM_MODEL || "qwen-plus", temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }] }),
    });
    if (!response.ok) throw new Error(`模型服务请求失败（${response.status}）。`);
    const payload = await response.json();
    try {
      const result = JSON.parse(payload.choices?.[0]?.message?.content ?? "");
      if (validResult(result)) {
        return {
          city: typeof result.city === "string" && result.city.trim() ? result.city.trim() : null,
          places: result.places.map((place) => ({ name: place.name.trim(), category: place.category, source: "攻略文本", tips: place.tips.map((tip) => tip.trim()).filter(Boolean).slice(0, 2) })),
        };
      }
    } catch {}
  }
  throw new Error("模型返回格式异常，请重新尝试。 ");
}

const vite = await createViteServer({ server: { middlewareMode: true } });
http.createServer(async (request, response) => {
  if (request.url === "/api/extract" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", async () => {
      try {
        const { text } = JSON.parse(body);
        if (typeof text !== "string" || !text.trim()) throw new Error("请先粘贴攻略文本。");
        const result = await callModel(text.trim());
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(result));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: error instanceof Error ? error.message : "攻略解析失败。" }));
      }
    });
    return;
  }
  vite.middlewares(request, response);
}).listen(port, "127.0.0.1", () => console.log(`攻略上图开发服务器：http://127.0.0.1:${port}`));
