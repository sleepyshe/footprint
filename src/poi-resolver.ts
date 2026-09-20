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
  return { poiId: poi.id, name: poi.name, address: poi.address || "暂无详细地址", longitude, latitude };
}

function normalized(value: string): string {
  return value.replace(/[\s·・()（）-]/g, "").toLowerCase();
}

/** Resolves a user-intended place through AMap; it never invents coordinates. */
export async function resolvePlace({ city, name }: ResolvePlaceInput): Promise<ResolvePlaceResult> {
  try {
    const AMap = await loadAmap();
    const candidates = await new Promise<PoiCandidate[]>((resolve, reject) => {
      const search = new AMap.PlaceSearch({ city, citylimit: true, pageSize: 10 });
      search.search(name, (status, result) => {
        if (status !== "complete") {
          reject(new Error(status === "no_data" ? "未找到匹配地点" : "高德 POI 搜索请求失败"));
          return;
        }
        resolve((result.poiList?.pois ?? []).map(asCandidate).filter((item): item is PoiCandidate => Boolean(item)));
      });
    });

    const query = normalized(name);
    const exactMatches = candidates.filter((candidate) => normalized(candidate.name) === query);
    if (exactMatches.length === 1) return { status: "resolved", ...exactMatches[0] };
    if (exactMatches.length > 1) return { status: "ambiguous", candidates: exactMatches };

    const closeMatches = candidates.filter((candidate) => normalized(candidate.name).includes(query));
    if (closeMatches.length === 1) return { status: "resolved", ...closeMatches[0] };
    if (closeMatches.length > 1) return { status: "ambiguous", candidates: closeMatches };
    return { status: "not_found" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "高德 POI 搜索请求失败";
    return message === "未找到匹配地点" ? { status: "not_found" } : { status: "failed", message };
  }
}
