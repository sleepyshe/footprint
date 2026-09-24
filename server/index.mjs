import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer as createViteServer, loadEnv } from "vite";
import { extractTravelNotesPrompt } from "./ai/prompts/extract-travel-notes.mjs";
import { summarizePlaceGuidesPrompt } from "./ai/prompts/summarize-place-guides.mjs";

const env = loadEnv("", process.cwd(), "");
const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const durations = [30, 60, 90, 120, 180, 240, 480];
const placeTypes = ["attraction", "food", "hotel", "transport", "other"];
const durationSources = ["user_content", "model_estimate", "unknown"];
const evidenceAspects = ["timing", "duration", "route", "photo", "queue", "cost", "reservation", "experience", "other"];
const evidenceSentiments = ["positive", "neutral", "negative"];

function parseModelJson(content) {
  const raw = (Array.isArray(content) ? content.map((item) => typeof item === "string" ? item : item?.text ?? "").join("") : String(content ?? "")).trim();
  const trimmed = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{"), end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型未返回 JSON 对象");
  return JSON.parse(trimmed.slice(start, end + 1));
}
function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    if (!text || seen.has(text)) return [];
    seen.add(text);
    return [{ text, aspect: evidenceAspects.includes(item.aspect) ? item.aspect : "other", sentiment: evidenceSentiments.includes(item.sentiment) ? item.sentiment : "neutral" }];
  });
}
function normalizeExtraction(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.places)) return null;
  return {
    city: typeof value.city === "string" && value.city.trim() ? value.city.trim() : null,
    places: value.places.filter((item) => item && typeof item === "object" && typeof item.name === "string" && item.name.trim()).map((item) => {
      const rawDuration = item.estimatedDurationMinutes === null || item.estimatedDurationMinutes === undefined || item.estimatedDurationMinutes === "" ? null : Number(item.estimatedDurationMinutes);
      const estimatedDurationMinutes = durations.includes(rawDuration) ? rawDuration : null;
      const rawScore = Number(item.recommendationScore);
      return { name: item.name.trim(), type: placeTypes.includes(item.type) ? item.type : "other", category: typeof item.category === "string" ? item.category.trim() : "", source: typeof item.source === "string" ? item.source : "", tips: Array.isArray(item.tips) ? item.tips.filter((tip) => typeof tip === "string") : typeof item.tips === "string" ? [item.tips] : [], evidence: normalizeEvidence(item.evidence), estimatedDurationMinutes, durationSource: durationSources.includes(item.durationSource) ? item.durationSource : estimatedDurationMinutes === null ? "unknown" : "model_estimate", recommendationScore: [1, 2, 3, 4, 5].includes(rawScore) ? rawScore : 3, recommendationReason: typeof item.recommendationReason === "string" && item.recommendationReason.trim() ? item.recommendationReason.trim() : "攻略未表达明显倾向" };
    }),
  };
}
function validExtraction(x) {
  return x && typeof x === "object" && (x.city === null || typeof x.city === "string") && Array.isArray(x.places) && x.places.every((p) => p && typeof p.name === "string" && placeTypes.includes(p.type) && Array.isArray(p.tips) && p.tips.every((t) => typeof t === "string") && Array.isArray(p.evidence) && p.evidence.every((e) => typeof e.text === "string" && evidenceAspects.includes(e.aspect) && evidenceSentiments.includes(e.sentiment)) && (p.estimatedDurationMinutes === null || durations.includes(p.estimatedDurationMinutes)) && durationSources.includes(p.durationSource) && [1, 2, 3, 4, 5].includes(p.recommendationScore) && typeof p.recommendationReason === "string");
}
function endpoint() { return `${(env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "")}/chat/completions`; }
async function askModel({ model, system, content }) {
  const response = await fetch(endpoint(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LLM_API_KEY}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content }] }) });
  if (!response.ok) throw new Error(`模型服务请求失败（${response.status}）。`);
  return parseModelJson((await response.json()).choices?.[0]?.message?.content);
}
async function extract({ text, images }) {
  if (!env.LLM_API_KEY) throw new Error("缺少 LLM_API_KEY，无法解析攻略。");
  if ((!text || !text.trim()) && !images.length) throw new Error("请粘贴攻略文本或上传截图。");
  if (images.length > 6 || images.some((i) => !imageTypes.includes(i.mimeType) || typeof i.data !== "string" || i.data.length > 7_000_000)) throw new Error("最多上传 6 张 PNG、JPG 或 WEBP，单张不超过 5MB。");
  const content = [{ type: "text", text: extractTravelNotesPrompt.buildUserPrompt({ text: text?.trim() ?? "", imageCount: images.length }) }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))];
  const model = images.length ? (env.LLM_VISION_MODEL || "qwen-vl-plus") : (env.LLM_MODEL || "qwen-plus");
  let lastError;
  for (let retry = 0; retry < 3; retry += 1) {
    try {
      const system = retry ? `${extractTravelNotesPrompt.system}\n上一次输出无法解析。请只返回一个合法 JSON 对象，不要 Markdown，不要解释；每个 place 必须包含 schema 中全部字段。` : extractTravelNotesPrompt.system;
      const result = normalizeExtraction(await askModel({ model, system, content }));
      if (validExtraction(result)) return { city: result.city, places: result.places.map((p) => ({ ...p, source: images.length ? (text?.trim() ? "攻略文本 + 截图" : "攻略截图") : "攻略文本", tips: p.tips.map((t) => t.trim()).filter(Boolean).slice(0, 2) })) };
    } catch (error) { lastError = error; }
  }
  const detail = lastError instanceof Error ? lastError.message : "未知错误";
  throw new Error(detail.includes("JSON") || detail.includes("格式") ? "模型返回格式异常，请重新尝试。" : `模型解析失败：${detail}`);
}
function normalizeSummaries(value, allowedIds) {
  if (!value || typeof value !== "object" || !Array.isArray(value.summaries)) throw new Error("攻略摘要返回格式异常。");
  const seen = new Set();
  return value.summaries.flatMap((item) => {
    if (!item || typeof item.placeId !== "string" || !allowedIds.has(item.placeId) || seen.has(item.placeId)) return [];
    seen.add(item.placeId);
    return [{ placeId: item.placeId, oneLineSummary: typeof item.oneLineSummary === "string" ? item.oneLineSummary.trim().slice(0, 80) : null, repeatedPoints: Array.isArray(item.repeatedPoints) ? item.repeatedPoints.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8) : [], practicalTips: Array.isArray(item.practicalTips) ? item.practicalTips.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8) : [], conflicts: Array.isArray(item.conflicts) ? item.conflicts.flatMap((c) => typeof c?.topic === "string" && Array.isArray(c.viewpoints) ? [{ topic: c.topic.trim(), viewpoints: c.viewpoints.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 4) }] : []).slice(0, 5) : [] }];
  });
}
async function summarizePlaceGuides(places) {
  if (!env.LLM_API_KEY) throw new Error("缺少 LLM_API_KEY，无法整理攻略。");
  const clean = Array.isArray(places) ? places.flatMap((place) => typeof place?.placeId === "string" && typeof place?.name === "string" && Array.isArray(place.evidence) && place.evidence.length ? [{ placeId: place.placeId, name: place.name, evidence: normalizeEvidence(place.evidence) }] : []).filter((place) => place.evidence.length) : [];
  if (!clean.length) return { summaries: [] };
  const result = await askModel({ model: env.LLM_MODEL || "qwen-plus", system: summarizePlaceGuidesPrompt.system, content: summarizePlaceGuidesPrompt.buildUserPrompt(clean) });
  return { summaries: normalizeSummaries(result, new Set(clean.map((place) => place.placeId))) };
}
function readJson(req) { return new Promise((resolve, reject) => { let raw = ""; req.on("data", (chunk) => { raw += chunk; if (raw.length > 40_000_000) req.destroy(); }); req.on("end", () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error("请求格式不正确。")); } }); }); }
function send(res, status, body) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
/** Capture-only local export. Existing product endpoints do not call this. */
async function exportCapture(body) {
  if (!body || typeof body !== "object" || !body.demo || typeof body.raw !== "string") throw new Error("Capture 导出格式不正确。");
  const target = path.join(process.cwd(), "capture", "demo-session-001");
  await mkdir(target, { recursive: true });
  await Promise.all([
    writeFile(path.join(target, "demo-session.json"), `${JSON.stringify(body.demo, null, 2)}\n`, "utf8"),
    writeFile(path.join(target, "raw-session.jsonl"), body.raw, "utf8"),
  ]);
}
async function exportHotelDelta(body) {
  if (!body || typeof body !== "object" || body.schemaVersion !== 1 || !body.beforeHotel || !body.afterHotel) throw new Error("住宿增量导出格式不正确。");
  const target = path.join(process.cwd(), "capture", "demo-session-001");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "hotel-delta.json"), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}
const vite = await createViteServer({ server: { middlewareMode: true } });
http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/capture/export" && req.method === "POST") { await exportCapture(await readJson(req)); return send(res, 200, { ok: true }); }
    if (req.url === "/api/capture/export-hotel-delta" && req.method === "POST") { await exportHotelDelta(await readJson(req)); return send(res, 200, { ok: true }); }
    if (req.url === "/api/extract" && req.method === "POST") { const body = await readJson(req); return send(res, 200, await extract({ text: typeof body.text === "string" ? body.text : "", images: Array.isArray(body.images) ? body.images : [] })); }
    if (req.url === "/api/summarize-place-guides" && req.method === "POST") { const body = await readJson(req); return send(res, 200, await summarizePlaceGuides(body.places)); }
  } catch (error) { return send(res, 400, { message: error instanceof Error ? error.message : "请求失败。" }); }
  vite.middlewares(req, res);
}).listen(5173, "127.0.0.1", () => console.log("攻略上图开发服务器：http://127.0.0.1:5173"));
