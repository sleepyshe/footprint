import { loadAmap, type AMapPoi } from "./amap-loader";
import { resolveAmapRoute } from "./amap-route-service";
import type { DayRoute, Place, RoutePoint, StayAreaCandidate, StayHotelCandidate } from "./types";

type Anchor = { poiId: string; name: string; address: string; longitude: number; latitude: number; category?: string; rating?: number; cost?: string };

const METRO_RADIUS_METERS = 2600;
const HOTEL_RADIUS_METERS = 850;
const PREFILTER_LIMIT = 7;
const DIVERSITY_METERS = 900;

function point(place: Pick<Place, "longitude" | "latitude">): RoutePoint | undefined {
  const lng = Number(place.longitude), lat = Number(place.latitude);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : undefined;
}

/** Geographic distance is used only for cheap candidate filtering, never as a commute time. */
export function geoDistanceMeters(a: RoutePoint, b: RoutePoint): number {
  const lat = Math.PI / 180;
  const dLat = (b.lat - a.lat) * lat, dLng = (b.lng - a.lng) * lat;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * lat) * Math.cos(b.lat * lat) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function centroid(items: Place[]): RoutePoint | undefined {
  const points = items.map(point).filter((value): value is RoutePoint => Boolean(value));
  if (!points.length) return undefined;
  return { lng: points.reduce((sum, item) => sum + item.lng, 0) / points.length, lat: points.reduce((sum, item) => sum + item.lat, 0) / points.length };
}

function asAnchor(poi: AMapPoi): Anchor | undefined {
  const longitude = Number(poi.location?.lng), latitude = Number(poi.location?.lat);
  if (!poi.id || !poi.name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined;
  const rating = Number(poi.biz_ext?.rating ?? poi.rating);
  return { poiId: poi.id, name: poi.name, address: poi.address || "", longitude, latitude, category: poi.type, rating: Number.isFinite(rating) ? rating : undefined, cost: poi.biz_ext?.cost };
}

function stationName(value: string): string {
  return value.replace(/[（(].*?[）)]/g, "").replace(/[A-Z]\d?口$/i, "").trim();
}

function isMetro(anchor: Anchor): boolean {
  return /地铁|轨道|轻轨|地铁站|轨道交通/.test(`${anchor.name} ${anchor.category ?? ""}`);
}

async function nearby(keyword: string, center: RoutePoint, radius: number, city: string): Promise<Anchor[]> {
  const AMap = await loadAmap();
  return new Promise((resolve) => {
    new AMap.PlaceSearch({ city, citylimit: Boolean(city.trim()), pageSize: 12, extensions: "all" }).searchNearBy(keyword, [center.lng, center.lat], radius, (status, result) => {
      resolve(status === "complete" ? (result.poiList?.pois ?? []).map(asAnchor).filter((item): item is Anchor => Boolean(item)) : []);
    });
  });
}

function routePlace(anchor: Anchor): Place {
  return { id: `stay-anchor-${anchor.poiId}`, rawName: anchor.name, name: anchor.name, poiStatus: "resolved", poiId: anchor.poiId, address: anchor.address || "轨道交通站", longitude: anchor.longitude, latitude: anchor.latitude, category: anchor.category, type: "transport", recommendationScore: 3, mustVisit: false };
}

function routeDays(days: DayRoute[], places: Place[]): Array<{ day: number; first: Place; last: Place }> {
  return days.flatMap((day) => {
    const first = places.find((place) => place.id === day.orderedPlaceIds[0]);
    const last = places.find((place) => place.id === day.orderedPlaceIds.at(-1));
    return first && last && point(first) && point(last) ? [{ day: day.day, first, last }] : [];
  });
}

function explanation(perDay: Array<{ day: number; minutes: number }>, total: number, max: number): string {
  const best = perDay.reduce((current, item) => item.minutes < current.minutes ? item : current, perDay[0]);
  return max - best.minutes <= 18 ? "多天首尾通勤相对均衡" : `更方便 Day ${best.day} 的首尾出行`;
}

/** User-triggered only. It finds real metro anchors, cheaply prunes them, then validates final commute with AMap transit. */
export async function recommendStayAreas(days: DayRoute[], places: Place[], city: string): Promise<StayAreaCandidate[]> {
  const dayEndpoints = routeDays(days, places);
  const scheduled = dayEndpoints.flatMap((item) => item.first === item.last ? [item.first] : [item.first, item.last]);
  const overall = centroid(scheduled);
  if (!overall || !dayEndpoints.length) return [];
  const dayCenters = days.map((day) => {
    const dayPlaces = day.orderedPlaceIds.map((id) => places.find((place) => place.id === id)).filter((place): place is Place => Boolean(place));
    return centroid(dayPlaces);
  }).filter((item): item is RoutePoint => Boolean(item));
  const centers = [overall, ...dayCenters];
  const found = (await Promise.all(centers.map(async (center) => {
    const primary = await nearby("地铁站", center, METRO_RADIUS_METERS, city);
    return primary.length >= 2 ? primary : [...primary, ...await nearby("轨道交通站", center, METRO_RADIUS_METERS * 1.5, city)];
  }))).flat().filter(isMetro);
  const deduped = [...new Map(found.map((item) => [item.poiId, item])).values()];
  const stations = [...new Map(deduped.map((item) => [stationName(item.name), item])).values()];
  const coarse = stations.map((anchor) => ({ anchor, distance: dayEndpoints.reduce((sum, day) => sum + geoDistanceMeters({ lng: anchor.longitude, lat: anchor.latitude }, point(day.first)!) + geoDistanceMeters(point(day.last)!, { lng: anchor.longitude, lat: anchor.latitude }), 0) })).sort((a, b) => a.distance - b.distance).slice(0, PREFILTER_LIMIT);

  const verified = await Promise.all(coarse.map(async ({ anchor }) => {
    const anchorPlace = routePlace(anchor);
    const perDay = await Promise.all(dayEndpoints.map(async (day) => {
      const [outbound, inbound] = await Promise.all([resolveAmapRoute(anchorPlace, day.first, "transit", city), resolveAmapRoute(day.last, anchorPlace, "transit", city)]);
      if (outbound.durationMinutes === null || inbound.durationMinutes === null) return undefined;
      return { day: day.day, minutes: outbound.durationMinutes + inbound.durationMinutes };
    }));
    if (perDay.some((item) => !item)) return undefined;
    const daily = perDay as Array<{ day: number; minutes: number }>;
    const total = daily.reduce((sum, item) => sum + item.minutes, 0), max = Math.max(...daily.map((item) => item.minutes));
    return { anchor, total, max, score: total + .5 * max, perDay: daily };
  }));
  const selected: StayAreaCandidate[] = [];
  for (const item of verified.filter((value): value is NonNullable<typeof value> => Boolean(value)).sort((a, b) => a.score - b.score)) {
    if (selected.some((area) => geoDistanceMeters({ lng: area.longitude, lat: area.latitude }, { lng: item.anchor.longitude, lat: item.anchor.latitude }) < DIVERSITY_METERS)) continue;
    selected.push({ anchorPoiId: item.anchor.poiId, anchorName: `${stationName(item.anchor.name)}周边`, longitude: item.anchor.longitude, latitude: item.anchor.latitude, totalCommuteMinutes: item.total, maxDayCommuteMinutes: item.max, perDayCommuteMinutes: item.perDay, explanation: explanation(item.perDay, item.total, item.max), hotelStatus: "idle" });
    if (selected.length === 3) break;
  }
  return selected;
}

/** Called only when the user expands one specific stay area. */
export async function findHotelsNearStayArea(area: StayAreaCandidate, city: string): Promise<StayHotelCandidate[]> {
  const center = { lng: area.longitude, lat: area.latitude };
  const anchors = await nearby("酒店", center, HOTEL_RADIUS_METERS, city);
  return anchors.map((item) => ({ ...item, distanceToAnchorMeters: Math.round(geoDistanceMeters(center, { lng: item.longitude, lat: item.latitude })) })).filter((item) => /酒店|宾馆|民宿|住宿/.test(`${item.name} ${item.category ?? ""}`)).sort((a, b) => a.distanceToAnchorMeters - b.distanceToAnchorMeters || (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3);
}
