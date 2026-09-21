import { loadAmap } from "./amap-loader";
import type { Place, RoutePoint, RouteSegment, TransportMode } from "./types";

type UnknownRecord = Record<string, unknown>;
const asRecord = (value: unknown): UnknownRecord | undefined => value && typeof value === "object" ? value as UnknownRecord : undefined;
const numeric = (value: unknown): number | null => { const result = Number(value); return Number.isFinite(result) ? result : null; };
function routePoint(value: unknown): RoutePoint | undefined {
  if (Array.isArray(value) && value.length >= 2) { const lng = numeric(value[0]), lat = numeric(value[1]); return lng === null || lat === null ? undefined : { lng, lat }; }
  const record = asRecord(value); if (!record) return undefined;
  const lng = numeric(record.lng ?? record.lon), lat = numeric(record.lat);
  return lng === null || lat === null ? undefined : { lng, lat };
}
/** Extracts only `path` arrays supplied by the AMap result. It never creates connector lines. */
function collectAmapPaths(value: unknown, output: RoutePoint[] = []): RoutePoint[] {
  if (Array.isArray(value)) { value.forEach((item) => collectAmapPaths(item, output)); return output; }
  const record = asRecord(value); if (!record) return output;
  if (Array.isArray(record.path)) for (const item of record.path) { const point = routePoint(item); if (point && (output.at(-1)?.lng !== point.lng || output.at(-1)?.lat !== point.lat)) output.push(point); }
  for (const [key, child] of Object.entries(record)) if (key !== "path" && (key === "steps" || key === "segments" || key === "walking" || key === "bus" || key === "buslines" || key === "railway" || key === "vias")) collectAmapPaths(child, output);
  return output;
}
function failed(): Omit<RouteSegment, "fromPlaceId" | "toPlaceId" | "transportMode"> { return { status: "failed", distanceMeters: null, durationMinutes: null, path: [] }; }
function origin(place: Place): [number, number] { return [place.longitude!, place.latitude!]; }
function secondsToMinutes(value: unknown): number | null { const seconds = numeric(value); return seconds === null ? null : Math.round(seconds / 60); }

export async function resolveAmapRoute(from: Place, to: Place, transportMode: TransportMode, city: string): Promise<Omit<RouteSegment, "fromPlaceId" | "toPlaceId" | "transportMode">> {
  if (!city.trim()) return failed();
  const AMap = await loadAmap();
  const result = await new Promise<unknown>((resolve, reject) => {
    const service = transportMode === "walking" ? new AMap.Walking() : new AMap.Transfer({ city: city.trim(), cityd: city.trim() });
    service.search(origin(from), origin(to), (status, response) => status === "complete" ? resolve(response) : reject(new Error(status)));
  }).catch(() => undefined);
  const record = asRecord(result); if (!record) return failed();
  const route = transportMode === "walking" ? (Array.isArray(record.routes) ? asRecord(record.routes[0]) : undefined) : (Array.isArray(record.plans) ? asRecord(record.plans[0]) : undefined);
  if (!route) return failed();
  const path = collectAmapPaths(route);
  return { status: "resolved", distanceMeters: numeric(route.distance), durationMinutes: secondsToMinutes(route.time), path };
}
