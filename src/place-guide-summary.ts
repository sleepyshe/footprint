import type { PlaceEvidence, PlaceGuideSummary } from "./types";

export class PlaceGuideSummaryError extends Error {}
export interface SummaryInputPlace { placeId: string; name: string; evidence: PlaceEvidence[]; }

function parseSummary(value: unknown): PlaceGuideSummary[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { summaries?: unknown }).summaries)) throw new PlaceGuideSummaryError("攻略摘要返回格式异常。");
  return (value as { summaries: unknown[] }).summaries.map((item) => {
    const summary = item as Record<string, unknown>;
    if (!summary || typeof summary.placeId !== "string" || (summary.oneLineSummary !== null && typeof summary.oneLineSummary !== "string") || !Array.isArray(summary.repeatedPoints) || !Array.isArray(summary.practicalTips) || !Array.isArray(summary.conflicts)) throw new PlaceGuideSummaryError("攻略摘要返回格式异常。");
    return {
      placeId: summary.placeId,
      oneLineSummary: typeof summary.oneLineSummary === "string" ? summary.oneLineSummary.trim().slice(0, 80) : null,
      repeatedPoints: summary.repeatedPoints.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean),
      practicalTips: summary.practicalTips.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean),
      conflicts: summary.conflicts.flatMap((item) => {
        const conflict = item as Record<string, unknown>;
        return typeof conflict?.topic === "string" && Array.isArray(conflict.viewpoints) ? [{ topic: conflict.topic.trim(), viewpoints: conflict.viewpoints.filter((point): point is string => typeof point === "string").map((point) => point.trim()).filter(Boolean) }] : [];
      }),
    };
  });
}

export async function summarizePlaceGuides(places: SummaryInputPlace[]): Promise<PlaceGuideSummary[]> {
  const response = await fetch("/api/summarize-place-guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ places }) });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new PlaceGuideSummaryError(body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : "攻略整理暂时失败。");
  return parseSummary(body);
}
