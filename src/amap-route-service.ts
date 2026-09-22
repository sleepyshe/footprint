import { loadAmap } from "./amap-loader";
import type { Place, RouteDiagnostic, RouteFailureReason, RoutePoint, RouteSegment, TransportMode } from "./types";

type UnknownRecord = Record<string, unknown>;
// AMap routes can be requested quickly enough in a multi-stop itinerary to
// trigger CUQPS_HAS_EXCEEDED_THE_LIMIT. This paces distinct route requests;
// it does not retry a failed request or change route inputs/transport mode.
const ROUTE_REQUEST_INTERVAL_MS = 650;
let nextRouteRequestAt = 0;
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
function coordinate(place: Place): RoutePoint | null {
  const lng = numeric(place.longitude), lat = numeric(place.latitude);
  return lng === null || lat === null ? null : { lng, lat };
}
function failed(reason: RouteFailureReason, diagnostic: RouteDiagnostic): Omit<RouteSegment, "fromPlaceId" | "toPlaceId" | "transportMode"> {
  // Keep the unmodified callback result available for diagnosis. The UI only
  // uses `status`, so this does not expose API details to end users.
  const detail = { routeFailureReason: reason, ...diagnostic };
  try { console.warn("[AMap route failed]", JSON.stringify(detail)); }
  catch { console.warn("[AMap route failed]", detail); }
  return { status: "failed", distanceMeters: null, durationMinutes: null, path: [], routeFailureReason: reason, diagnostic };
}
function routeInput(point: RoutePoint): [number, number] { return [point.lng, point.lat]; }
function secondsToMinutes(value: unknown): number | null { const seconds = numeric(value); return seconds === null ? null : Math.round(seconds / 60); }

function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function responseDetails(response: unknown): Pick<RouteDiagnostic, "amapMessage" | "amapInfo"> {
  if (typeof response === "string" && response.trim()) return { amapInfo: response };
  const record = asRecord(response);
  return { amapMessage: text(record?.message), amapInfo: text(record?.info) };
}
function failureReasonForStatus(status: string, response: unknown): RouteFailureReason {
  const description = `${status} ${responseDetails(response).amapMessage ?? ""} ${responseDetails(response).amapInfo ?? ""}`.toLowerCase();
  if (status === "no_data" || /no[_ -]?route|no[_ -]?data|没有路线|无可用路线/.test(description)) return "no_route";
  if (/key|permission|quota|limit|service|busy|权限|配额|限额|服务/.test(description)) return "service_unavailable";
  return "api_error";
}
async function waitForRouteRequestWindow(): Promise<void> {
  const now = Date.now();
  const requestAt = Math.max(now, nextRouteRequestAt);
  nextRouteRequestAt = requestAt + ROUTE_REQUEST_INTERVAL_MS;
  if (requestAt > now) await new Promise<void>((resolve) => window.setTimeout(resolve, requestAt - now));
}

export async function resolveAmapRoute(from: Place, to: Place, transportMode: TransportMode, city: string): Promise<Omit<RouteSegment, "fromPlaceId" | "toPlaceId" | "transportMode">> {
  const fromPoint = coordinate(from), toPoint = coordinate(to);
  const base = (): Omit<RouteDiagnostic, "decision"> => ({ fromName: from.name ?? from.rawName, toName: to.name ?? to.rawName, origin: fromPoint, destination: toPoint, transportMode });
  if (!city.trim() || !fromPoint || !toPoint) return failed("invalid_input", { ...base(), decision: "城市为空，或起终点经纬度不是有效数字。" });

  let AMap: Awaited<ReturnType<typeof loadAmap>>;
  try { AMap = await loadAmap(); }
  catch (error) { return failed("service_unavailable", { ...base(), amapMessage: error instanceof Error ? error.message : String(error), decision: "高德 JS API 未能加载，因此没有发起路线请求。" }); }

  let callback: { status: string; response: unknown };
  try {
    await waitForRouteRequestWindow();
    callback = await new Promise((resolve) => {
      const service = transportMode === "walking" ? new AMap.Walking() : new AMap.Transfer({ city: city.trim(), cityd: city.trim() });
      service.search(routeInput(fromPoint), routeInput(toPoint), (status, response) => resolve({ status, response }));
    });
  } catch (error) {
    return failed("api_error", { ...base(), amapMessage: error instanceof Error ? error.message : String(error), decision: "路线服务在调用回调前抛出了异常。" });
  }

  const callbackDetails = responseDetails(callback.response);
  if (callback.status !== "complete") return failed(failureReasonForStatus(callback.status, callback.response), { ...base(), amapStatus: callback.status, ...callbackDetails, rawResult: callback.response, decision: "高德回调 status 不是 complete，当前代码因此判定为 failed。" });
  const record = asRecord(callback.response);
  if (!record) return failed("parse_error", { ...base(), amapStatus: callback.status, ...callbackDetails, rawResult: callback.response, decision: "高德返回 complete，但 result 不是可解析对象。" });
  const route = transportMode === "walking" ? (Array.isArray(record.routes) ? asRecord(record.routes[0]) : undefined) : (Array.isArray(record.plans) ? asRecord(record.plans[0]) : undefined);
  if (!route) return failed("no_route", { ...base(), amapStatus: callback.status, ...callbackDetails, rawResult: callback.response, decision: `高德返回 complete，但未找到 ${transportMode === "walking" ? "routes[0]" : "plans[0]"}，当前代码因此判定为 failed。` });
  const path = collectAmapPaths(route);
  return { status: "resolved", distanceMeters: numeric(route.distance), durationMinutes: secondsToMinutes(route.time), path, diagnostic: { ...base(), amapStatus: callback.status, ...callbackDetails, rawResult: callback.response, decision: "高德回调 complete，且已解析出首条路线。" } };
}
