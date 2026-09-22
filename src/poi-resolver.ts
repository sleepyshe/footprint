import { loadAmap } from "./amap-loader";
import type { AMapPoi } from "./amap-loader";
import type { PoiCandidate, ResolvePlaceResult } from "./types";

export interface ResolvePlaceInput {
  city: string;
  name: string;
}

function asCandidate(poi: AMapPoi): PoiCandidate | undefined {
  const longitude = Number(poi.location?.lng);
  const latitude = Number(poi.location?.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  return { poiId: poi.id, name: poi.name, address: poi.address || "暂无详细地址", longitude, latitude, poiType: poi.type };
}

function normalized(value: string): string {
  return value.replace(/[\s·・()（）-]/g, "").toLowerCase();
}

/** Resolves a user-intended place through AMap; it never invents coordinates. */
export async function resolvePlace({ city, name }: ResolvePlaceInput): Promise<ResolvePlaceResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
    const AMap = await loadAmap();
    const candidates = await new Promise<PoiCandidate[]>((resolve, reject) => {
      const search = new AMap.PlaceSearch({ city, citylimit: true, pageSize: 10 });
      search.search(name, (status, result) => {
        if (status !== "complete") {
          reject(new Error(status === "no_data" ? "未找到匹配地点" : "高德 POI 搜索请求失败"));
          return;
        }
        resolve((result.poiList?.pois ?? []).map(asCandidate).filter((item): item is PoiCandidate => Boolean(item)).slice(0, 3));
      });
    });

    const query = normalized(name);
    const exactMatches = candidates.filter((candidate) => normalized(candidate.name) === query);
    if (candidates.length === 1) return { status: "resolved", ...candidates[0] };
    if (exactMatches.length === 1) return { status: "resolved", ...exactMatches[0] };
    if (exactMatches.length > 1) return { status: "ambiguous", candidates: exactMatches };

    const closeMatches = candidates.filter((candidate) => normalized(candidate.name).includes(query));
    if (closeMatches.length === 1) return { status: "resolved", ...closeMatches[0] };
    if (closeMatches.length > 1) return { status: "ambiguous", candidates: closeMatches.slice(0, 3) };
    if (candidates.length > 0) return { status: "ambiguous", candidates };
    return { status: "not_found" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "高德 POI 搜索请求失败";
      if (message === "未找到匹配地点") return { status: "not_found" };
      if (attempt === 0) { await new Promise((resolve) => window.setTimeout(resolve, 300)); continue; }
      return { status: "failed", message };
    }
  }
  return { status: "failed", message: "高德 POI 搜索请求失败" };
}
