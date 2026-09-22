import { loadAmap } from "./amap-loader";
import type { AMapMap, AMapMarker } from "./amap-loader";
import type { DayRoute, ResolvedPlace } from "./types";
import { getPlaceVisual, placeVisualIcon } from "./place-visual";

const DAY_COLORS = ["#4176b9", "#5c9562", "#d18440", "#8064a8", "#3d8990"];
const DEFAULT_LABEL_LIMIT = 8;

export class MapView {
  private map: AMapMap | undefined;

  async mount(container: HTMLElement): Promise<void> {
    const AMap = await loadAmap();
    this.map?.destroy();
    this.map = new AMap.Map(container, { zoom: 11, viewMode: "2D" });
  }

  showPlaces(places: ResolvedPlace[], routes: DayRoute[] = [], options: { selectedDay?: number; selectedPlaceId?: string; focusDay?: number; onPlaceClick?: (placeId: string) => void } = {}): void {
    if (!this.map) throw new Error("地图尚未初始化");
    const AMap = window.AMap!;
    this.map.clearMap();
    const dayByPlace = new Map(routes.flatMap((day) => day.orderedPlaceIds.map((id) => [id, day.day] as const)));
    const labels = new Set([...places].sort((a, b) => Number(b.placeId === options.selectedPlaceId) - Number(a.placeId === options.selectedPlaceId) || Number(b.mustVisit) - Number(a.mustVisit) || (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0)).slice(0, places.length <= DEFAULT_LABEL_LIMIT ? places.length : DEFAULT_LABEL_LIMIT).map((place) => place.placeId));
    const routeLines = routes.flatMap((dayRoute) => dayRoute.segments.filter((segment) => segment.status === "resolved" && segment.path.length > 1).map((segment) => {
      const isSelected = !options.selectedDay || options.selectedDay === dayRoute.day;
      const line = new AMap.Polyline({ path: segment.path.map((point) => [point.lng, point.lat]), strokeColor: DAY_COLORS[(dayRoute.day - 1) % DAY_COLORS.length], strokeWeight: isSelected ? 6 : 4, strokeOpacity: isSelected ? .86 : .2, lineJoin: "round" });
      line.setMap(this.map!); return { day: dayRoute.day, line };
    }));
    const polylines = routeLines.map(({ line }) => line);
    const markers: AMapMarker[] = places.map((place) => {
      const isActive = place.placeId === options.selectedPlaceId || (Boolean(options.selectedDay) && dayByPlace.get(place.placeId ?? "") === options.selectedDay);
      const showLabel = labels.has(place.placeId) || isActive;
      const marker = new AMap.Marker({ position: [place.longitude, place.latitude], title: place.name, content: createPlaceMarkerContent({ type: place.type, category: place.category, isActive, label: showLabel ? place.name : undefined }), offset: [-17, -34] });
      marker.setMap(this.map!);
      marker.on("click", () => {
        this.openInfo(place, marker);
        if (place.placeId) options.onPlaceClick?.(place.placeId);
      });
      if (place.placeId === options.selectedPlaceId) this.openInfo(place, marker);
      return marker;
    });
    const focused = options.focusDay ? routes.find((day) => day.day === options.focusDay) : undefined;
    if (focused) {
      const selectedLines = routeLines.filter((item) => item.day === focused.day).map((item) => item.line);
      const focusedMarkers = markers.filter((_, index) => focused.orderedPlaceIds.includes(places[index]?.placeId ?? ""));
      this.map.setFitView(selectedLines.length || focusedMarkers.length ? [...selectedLines, ...focusedMarkers] : markers, false, [64, 64, 64, 64]);
    } else if (markers.length > 0) this.map.setFitView([...markers, ...polylines], false, [64, 64, 64, 64]);
  }

  focusPlace(place: ResolvedPlace): void { if (!this.map) return; this.map.setCenter([place.longitude, place.latitude]); this.map.setZoom(15); }
  private openInfo(place: ResolvedPlace, marker: AMapMarker): void { if (!this.map) return; const detail = [place.category, ...(place.tips ?? [])].filter(Boolean).map((item) => `<p>${escapeHtml(item!)}</p>`).join(""); new window.AMap!.InfoWindow({ content: `<div class="info-window"><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)}</p>${detail}</div>`, offset: [0, -30] }).open(this.map, marker.getPosition()); }
}

interface MarkerOptions { type?: ResolvedPlace["type"]; category?: string; dayColor?: string; isActive?: boolean; label?: string; }

function createPlaceMarkerContent({ type = "other", category, dayColor, isActive = false, label }: MarkerOptions): string {
  const visual = getPlaceVisual({ type, category });
  const icon = placeVisualIcon[visual];
  const dayStyle = dayColor ? ` style="--day-color:${dayColor}"` : "";
  const labelText = label && label.length > 10 ? `${label.slice(0, 10)}…` : label;
  return `<span class="map-marker-wrap${isActive ? " is-active" : ""}"><span class="map-type-marker marker-${visual}"${dayStyle}><span>${icon}</span></span>${labelText ? `<span class="map-place-label" title="${escapeHtml(label!)}">${escapeHtml(labelText)}</span>` : ""}</span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}
