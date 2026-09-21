import type { DurationSource, ExtractionResult, ExtractedPlace, PlaceType } from "./types";
export class ExtractionError extends Error {}
export interface ImageInput { mimeType: string; data: string; }
const types: PlaceType[] = ["attraction", "food", "hotel", "transport", "other"];
const sources: DurationSource[] = ["user_content", "model_estimate", "unknown"];
const durations = [30, 60, 90, 120, 180, 240, 480];
function parseExtraction(value: unknown): ExtractionResult {
  if (!value || typeof value !== "object") throw new ExtractionError("模型没有返回有效的地点数据。");
  const data = value as { city?: unknown; places?: unknown };
  if (data.city !== null && data.city !== undefined && typeof data.city !== "string") throw new ExtractionError("模型返回的城市格式不正确。");
  if (!Array.isArray(data.places)) throw new ExtractionError("模型返回的地点列表格式不正确。");
  const places = data.places.map((item): ExtractedPlace => {
    const p = item as Record<string, unknown>;
    if (!p || typeof p.name !== "string" || !types.includes(p.type as PlaceType) || !Array.isArray(p.tips) || !p.tips.every((tip) => typeof tip === "string") || !sources.includes(p.durationSource as DurationSource)) throw new ExtractionError("模型返回的地点格式不正确。");
    const duration = p.estimatedDurationMinutes === null ? null : Number(p.estimatedDurationMinutes);
    if (duration !== null && !durations.includes(duration)) throw new ExtractionError("模型返回了不允许的停留时长。");
    if (![1, 2, 3, 4, 5].includes(Number(p.recommendationScore))) throw new ExtractionError("模型返回的种草指数不正确。");
    return { name: p.name.trim(), type: p.type as PlaceType, category: typeof p.category === "string" ? p.category.trim() : undefined, source: typeof p.source === "string" ? p.source : "攻略输入", tips: p.tips.map((tip) => tip.trim()).filter(Boolean).slice(0, 2), estimatedDurationMinutes: duration, durationSource: p.durationSource as DurationSource, recommendationScore: Number(p.recommendationScore) as 1 | 2 | 3 | 4 | 5, recommendationReason: typeof p.recommendationReason === "string" ? p.recommendationReason.trim() : undefined };
  });
  return { city: typeof data.city === "string" && data.city.trim() ? data.city.trim() : null, places };
}
export async function extractPlaces(text: string, images: ImageInput[]): Promise<ExtractionResult> {
  const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, images }) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ExtractionError(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "攻略解析失败，请稍后重试。");
  return parseExtraction(body);
}
