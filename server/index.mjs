import http from "node:http";
import { createServer as createViteServer, loadEnv } from "vite";
import { extractTravelNotesPrompt } from "./ai/prompts/extract-travel-notes.mjs";
const env = loadEnv("", process.cwd(), ""); const imageTypes = ["image/png", "image/jpeg", "image/webp"]; const durations = [30, 60, 90, 120, 180, 240, 480]; const placeTypes = ["attraction", "food", "hotel", "transport", "other"]; const durationSources = ["user_content", "model_estimate", "unknown"];
function valid(x) { return x && typeof x === "object" && (x.city === null || typeof x.city === "string") && Array.isArray(x.places) && x.places.every((p) => p && typeof p.name === "string" && placeTypes.includes(p.type) && Array.isArray(p.tips) && p.tips.every((t) => typeof t === "string") && (p.estimatedDurationMinutes === null || durations.includes(p.estimatedDurationMinutes)) && durationSources.includes(p.durationSource) && [1,2,3,4,5].includes(p.recommendationScore) && typeof p.recommendationReason === "string"); }
function parseModelJson(content) { const trimmed = String(content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); return JSON.parse(trimmed); }
/** Accept harmless model formatting variation without inventing geography or recommendation facts. */
function normalizeModelResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.places)) return null;
  return {
    city: typeof value.city === "string" && value.city.trim() ? value.city.trim() : null,
    places: value.places.filter((item) => item && typeof item === "object" && typeof item.name === "string" && item.name.trim()).map((item) => {
      const rawDuration = item.estimatedDurationMinutes === null || item.estimatedDurationMinutes === undefined || item.estimatedDurationMinutes === "" ? null : Number(item.estimatedDurationMinutes);
      const estimatedDurationMinutes = durations.includes(rawDuration) ? rawDuration : null;
      const rawScore = Number(item.recommendationScore);
      return {
        name: item.name.trim(), type: placeTypes.includes(item.type) ? item.type : "other", category: typeof item.category === "string" ? item.category.trim() : "", source: typeof item.source === "string" ? item.source : "",
        tips: Array.isArray(item.tips) ? item.tips.filter((tip) => typeof tip === "string") : typeof item.tips === "string" ? [item.tips] : [],
        estimatedDurationMinutes, durationSource: durationSources.includes(item.durationSource) ? item.durationSource : estimatedDurationMinutes === null ? "unknown" : "model_estimate",
        recommendationScore: [1,2,3,4,5].includes(rawScore) ? rawScore : 3,
        recommendationReason: typeof item.recommendationReason === "string" && item.recommendationReason.trim() ? item.recommendationReason.trim() : "攻略未表达明显倾向",
      };
    }),
  };
}
async function extract({ text, images }) {
  if (!env.LLM_API_KEY) throw new Error("缺少 LLM_API_KEY，无法解析攻略。");
  if ((!text || !text.trim()) && !images.length) throw new Error("请粘贴攻略文本或上传截图。");
  if (images.length > 6 || images.some((i) => !imageTypes.includes(i.mimeType) || typeof i.data !== "string" || i.data.length > 7_000_000)) throw new Error("最多上传 6 张 PNG、JPG 或 WEBP，单张不超过 5MB。");
  const content = [{ type: "text", text: extractTravelNotesPrompt.buildUserPrompt({ text: text?.trim() ?? "", imageCount: images.length }) }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))];
  const endpoint = `${(env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "")}/chat/completions`; const model = images.length ? (env.LLM_VISION_MODEL || "qwen-vl-plus") : (env.LLM_MODEL || "qwen-plus");
  for (let retry = 0; retry < 2; retry += 1) {
    const system = retry ? `${extractTravelNotesPrompt.system}\n上一次输出无法解析。请只返回一个合法 JSON 对象，不要 Markdown，不要解释；每个 place 必须包含 schema 中全部字段。` : extractTravelNotesPrompt.system;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content }] }) });
    if (!response.ok) throw new Error(`模型服务请求失败（${response.status}）。`);
    try { const result = normalizeModelResult(parseModelJson((await response.json()).choices?.[0]?.message?.content)); if (valid(result)) return { city: result.city, places: result.places.map((p) => ({ ...p, source: images.length ? (text?.trim() ? "攻略文本 + 截图" : "攻略截图") : "攻略文本", tips: p.tips.map((t) => t.trim()).filter(Boolean).slice(0, 2) })) }; } catch {}
  } throw new Error("模型返回格式异常，请重新尝试。");
}
const vite = await createViteServer({ server: { middlewareMode: true } });
http.createServer((req, res) => { if (req.url === "/api/extract" && req.method === "POST") { let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 40_000_000) req.destroy(); }); req.on("end", async () => { try { const body = JSON.parse(raw); const result = await extract({ text: typeof body.text === "string" ? body.text : "", images: Array.isArray(body.images) ? body.images : [] }); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result)); } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: e instanceof Error ? e.message : "攻略解析失败。" })); } }); return; } vite.middlewares(req, res); }).listen(5173, "127.0.0.1", () => console.log("攻略上图开发服务器：http://127.0.0.1:5173"));
