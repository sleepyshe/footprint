import { loadAmap } from "./amap-loader";
import type { AMapMap, AMapMarker } from "./amap-loader";
import type { DayRoute, ResolvedPlace } from "./types";

const DAY_COLORS = ["#4176b9", "#5c9562", "#d18440", "#8064a8", "#3d8990"];

export class MapView {
  private map: AMapMap | undefined;

  async mount(container: HTMLElement): Promise<void> {
    const AMap = await loadAmap();
    this.map?.destroy();
    this.map = new AMap.Map(container, { zoom: 11, viewMode: "2D" });
  }

  showPlaces(places: ResolvedPlace[], routes: DayRoute[] = []): void {
    if (!this.map) throw new Error("地图尚未初始化");
    const AMap = window.AMap!;
    this.map.clearMap();
    const polylines = routes.flatMap((dayRoute) => dayRoute.segments.filter((segment) => segment.status === "resolved" && segment.path.length > 1).map((segment) => {
      const line = new AMap.Polyline({ path: segment.path.map((point) => [point.lng, point.lat]), strokeColor: DAY_COLORS[(dayRoute.day - 1) % DAY_COLORS.length], strokeWeight: 6, strokeOpacity: .82, lineJoin: "round" });
      line.setMap(this.map!); return line;
    }));
    const markers: AMapMarker[] = places.map((place) => {
      const marker = new AMap.Marker({ position: [place.longitude, place.latitude], title: place.name, content: createPlaceMarkerContent({ type: place.type }), offset: [-17, -34] });
      marker.setMap(this.map!);
      marker.on("click", () => {
        const detail = [place.category, ...(place.tips ?? [])].filter(Boolean).map((item) => `<p>${escapeHtml(item!)}</p>`).join("");
        const info = new AMap.InfoWindow({ content: `<div class="info-window"><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)}</p>${detail}</div>`, offset: [0, -30] });
        info.open(this.map!, marker.getPosition());
      });
      return marker;
    });
    if (markers.length > 0) this.map.setFitView([...markers, ...polylines], false, [64, 64, 64, 64]);
  }
}

interface MarkerOptions { type?: ResolvedPlace["type"]; dayColor?: string; isActive?: boolean; }

function createPlaceMarkerContent({ type = "other", dayColor, isActive = false }: MarkerOptions): string {
  const icon = ({ attraction: "⌂", food: "✦", hotel: "▣", transport: "➜", other: "●" })[type];
  const dayStyle = dayColor ? ` style="--day-color:${dayColor}"` : "";
  return `<span class="map-type-marker marker-${type}${isActive ? " is-active" : ""}"${dayStyle}><span>${icon}</span></span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}
