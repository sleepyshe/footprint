import type { ExtractionResult, ExtractedPlace } from "./types";

export class ExtractionError extends Error {}

function isCategory(value: unknown): value is ExtractedPlace["category"] {
  return typeof value === "string" && ["景点", "街区", "餐饮", "咖啡", "商场", "酒店", "交通", "其他"].includes(value);
}

function parseExtraction(value: unknown): ExtractionResult {
  if (!value || typeof value !== "object") throw new ExtractionError("模型没有返回有效的地点数据。");
  const data = value as { city?: unknown; places?: unknown };
  if (data.city !== null && data.city !== undefined && typeof data.city !== "string") throw new ExtractionError("模型返回的城市格式不正确。");
  if (!Array.isArray(data.places)) throw new ExtractionError("模型返回的地点列表格式不正确。");
  const places = data.places.map((item): ExtractedPlace => {
    if (!item || typeof item !== "object") throw new ExtractionError("模型返回了无效地点。");
    const place = item as Record<string, unknown>;
    if (typeof place.name !== "string" || !place.name.trim() || !isCategory(place.category)) throw new ExtractionError("模型返回的地点名称或类别不正确。");
    if (!Array.isArray(place.tips) || !place.tips.every((tip) => typeof tip === "string")) throw new ExtractionError("模型返回的攻略提示格式不正确。");
    return { name: place.name.trim(), category: place.category, source: "攻略文本", tips: place.tips.map((tip) => tip.trim()).filter(Boolean).slice(0, 2) };
  });
  return { city: typeof data.city === "string" && data.city.trim() ? data.city.trim() : null, places };
}

export async function extractPlaces(text: string): Promise<ExtractionResult> {
  const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "攻略解析失败，请稍后重试。";
    throw new ExtractionError(message);
  }
  return parseExtraction(body);
}
