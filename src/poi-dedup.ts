import type { DurationSource, Place, PlaceType } from "./types";

const durationRank: Record<DurationSource, number> = { unknown: 0, model_estimate: 1, user_content: 2 };

function mergedTips(places: Place[]): string[] {
  const seen = new Set<string>();
  return places.flatMap((place) => place.tips ?? []).map((tip) => tip.trim()).filter((tip) => {
    if (!tip || seen.has(tip)) return false;
    seen.add(tip); return true;
  });
}

/** Merges only resolved records that AMap has given the same concrete POI identity. */
export function dedupeResolvedPlaces(input: Place[]): { places: Place[]; warnings: string[] } {
  const byPoi = new Map<string, Place[]>();
  for (const place of input) {
    if (place.poiStatus === "resolved" && place.poiId) byPoi.set(place.poiId, [...(byPoi.get(place.poiId) ?? []), place]);
  }
  const handled = new Set<string>();
  const warnings: string[] = [];
  const places: Place[] = [];
  for (const place of input) {
    if (place.poiStatus !== "resolved" || !place.poiId) { places.push(place); continue; }
    if (handled.has(place.poiId)) continue;
    handled.add(place.poiId);
    const duplicates = byPoi.get(place.poiId)!;
    if (duplicates.length === 1) { places.push(place); continue; }
    const canonical = duplicates[0];
    const top = duplicates.reduce((best, item) => item.recommendationScore > best.recommendationScore ? item : best, canonical);
    const durationCandidates = duplicates.filter((item) => item.estimatedDurationMinutes != null);
    const bestDurationRank = Math.max(...durationCandidates.map((item) => durationRank[item.durationSource ?? "unknown"]), -1);
    const durationChoices = durationCandidates.filter((item) => durationRank[item.durationSource ?? "unknown"] === bestDurationRank);
    const durationOwner = durationChoices.reduce<Place | undefined>((best, item) => !best || (item.estimatedDurationMinutes ?? 0) > (best.estimatedDurationMinutes ?? 0) ? item : best, undefined);
    const nonOther = duplicates.filter((item) => item.type && item.type !== "other");
    const selectedType: PlaceType | undefined = canonical.type !== "other" ? canonical.type : nonOther[0]?.type ?? canonical.type;
    const distinctTypes = new Set(nonOther.map((item) => item.type));
    if (distinctTypes.size > 1) warnings.push(`${canonical.rawName} 的地点类型存在冲突，暂保留最早记录的类型。`);
    places.push({
      ...canonical,
      tips: mergedTips(duplicates),
      mustVisit: duplicates.some((item) => item.mustVisit),
      recommendationScore: top.recommendationScore,
      recommendationReason: top.recommendationReason || canonical.recommendationReason,
      estimatedDurationMinutes: durationOwner?.estimatedDurationMinutes ?? canonical.estimatedDurationMinutes ?? null,
      durationSource: durationOwner?.durationSource ?? canonical.durationSource,
      durationEdited: Boolean(durationOwner?.durationEdited || canonical.durationEdited),
      type: selectedType,
    });
  }
  return { places, warnings };
}
