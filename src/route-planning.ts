import type { DayGroup, DayRoute, Place, RoutePlanningResult, RoutePoint, RouteSegment, TransportMode } from "./types";

export const WALKING_THRESHOLD_METERS = 1500;
const earthRadiusMeters = 6371000;
const radians = (value: number) => value * Math.PI / 180;
export function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const dLat = radians(b.lat - a.lat), dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function point(place: Place): RoutePoint { return { lng: place.longitude!, lat: place.latitude! }; }
function pathLength(ids: string[], index: Map<string, Place>): number { return ids.slice(1).reduce((sum, id, i) => sum + haversineMeters(point(index.get(ids[i])!), point(index.get(id)!)), 0); }
function orderKey(ids: string[], inputOrder: Map<string, number>): string { return ids.map((id) => String(inputOrder.get(id)!).padStart(6, "0")).join(","); }
function nearestNeighbor(start: string, ids: string[], index: Map<string, Place>, inputOrder: Map<string, number>): string[] {
  const left = new Set(ids); left.delete(start); const ordered = [start];
  while (left.size) {
    const current = index.get(ordered[ordered.length - 1])!;
    const next = [...left].sort((a, b) => haversineMeters(point(current), point(index.get(a)!)) - haversineMeters(point(current), point(index.get(b)!)) || inputOrder.get(a)! - inputOrder.get(b)!)[0];
    ordered.push(next); left.delete(next);
  }
  return ordered;
}
function twoOptOpenPath(ids: string[], index: Map<string, Place>): string[] {
  let best = [...ids], improved = true;
  while (improved) {
    improved = false;
    const currentDistance = pathLength(best, index);
    for (let i = 0; i < best.length - 2 && !improved; i++) for (let k = i + 1; k < best.length - 1; k++) {
      const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
      if (pathLength(candidate, index) + 0.0001 < currentDistance) { best = candidate; improved = true; break; }
    }
  }
  return best;
}
/** Deterministic open-path ordering; Haversine is never presented as road distance. */
export function orderDayPlaces(placeIds: string[], places: Place[]): string[] {
  const index = new Map(places.map((place) => [place.id, place]));
  const ids = placeIds.filter((id) => index.has(id));
  if (ids.length <= 2) return ids;
  const inputOrder = new Map(ids.map((id, i) => [id, i]));
  return ids.map((start) => twoOptOpenPath(nearestNeighbor(start, ids, index, inputOrder), index)).sort((a, b) => pathLength(a, index) - pathLength(b, index) || orderKey(a, inputOrder).localeCompare(orderKey(b, inputOrder)))[0];
}
export function transportModeFor(a: Place, b: Place): TransportMode { return haversineMeters(point(a), point(b)) <= WALKING_THRESHOLD_METERS ? "walking" : "transit"; }
export type ResolveRoute = (from: Place, to: Place, mode: TransportMode, city: string) => Promise<Omit<RouteSegment, "fromPlaceId" | "toPlaceId" | "transportMode">>;
export async function planRoutes(groups: DayGroup[], places: Place[], city: string, resolveRoute: ResolveRoute): Promise<RoutePlanningResult> {
  const lookup = new Map(places.filter((place) => place.poiStatus === "resolved" && place.latitude !== undefined && place.longitude !== undefined).map((place) => [place.id, place]));
  const days: DayRoute[] = [];
  for (const group of groups) {
    const routePlaces = group.placeIds.map((id) => lookup.get(id)).filter((place): place is Place => Boolean(place));
    if (!routePlaces.length) continue;
    const orderedPlaceIds = orderDayPlaces(routePlaces.map((place) => place.id), routePlaces);
    const warnings: string[] = []; const segments: RouteSegment[] = [];
    for (let i = 1; i < orderedPlaceIds.length; i++) {
      const from = lookup.get(orderedPlaceIds[i - 1])!, to = lookup.get(orderedPlaceIds[i])!, transportMode = transportModeFor(from, to);
      try {
        const resolved = await resolveRoute(from, to, transportMode, city);
        if (resolved.status === "failed") warnings.push(`${from.rawName} → ${to.rawName} 路线暂时无法获取。`);
        if (resolved.status === "resolved" && !resolved.path.length) warnings.push(`${from.rawName} → ${to.rawName} 未返回可绘制的路线几何。`);
        segments.push({ fromPlaceId: from.id, toPlaceId: to.id, transportMode, ...resolved });
      } catch (error) {
        const diagnostic = { fromName: from.name ?? from.rawName, toName: to.name ?? to.rawName, origin: point(from), destination: point(to), transportMode, amapMessage: error instanceof Error ? error.message : String(error), decision: "resolveRoute 抛出了未处理异常，计划层将其判定为 failed。" };
        console.warn("[AMap route failed]", JSON.stringify({ routeFailureReason: "unknown", ...diagnostic }));
        segments.push({ fromPlaceId: from.id, toPlaceId: to.id, transportMode, status: "failed", distanceMeters: null, durationMinutes: null, path: [], routeFailureReason: "unknown", diagnostic });
        warnings.push(`${from.rawName} → ${to.rawName} 路线暂时无法获取。`);
      }
    }
    const totals = segments.map((segment) => segment.durationMinutes);
    const totalTransitMinutes = totals.every((value) => value !== null) ? totals.reduce((sum, value) => sum + (value ?? 0), 0) : null;
    days.push({ day: group.day, placeIds: [...group.placeIds], orderedPlaceIds, segments, totalActivityMinutes: routePlaces.reduce((sum, place) => sum + (place.estimatedDurationMinutes ?? 60), 0), totalTransitMinutes, warnings });
  }
  return { days, warnings: days.flatMap((day) => day.warnings) };
}
