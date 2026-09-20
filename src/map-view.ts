import { loadAmap } from "./amap-loader";
import type { AMapMap, AMapMarker } from "./amap-loader";
import type { ResolvedPlace } from "./types";

export class MapView {
  private map: AMapMap | undefined;

  async mount(container: HTMLElement): Promise<void> {
    const AMap = await loadAmap();
    this.map?.destroy();
    this.map = new AMap.Map(container, { zoom: 11, viewMode: "2D" });
  }

  showPlaces(places: ResolvedPlace[]): void {
    if (!this.map) throw new Error("地图尚未初始化");
    const AMap = window.AMap!;
    this.map.clearMap();
    const markers: AMapMarker[] = places.map((place) => {
      const marker = new AMap.Marker({ position: [place.longitude, place.latitude], title: place.name });
      marker.setMap(this.map!);
      marker.on("click", () => {
        const info = new AMap.InfoWindow({ content: `<div class="info-window"><strong>${escapeHtml(place.name)}</strong><p>${escapeHtml(place.address)}</p></div>`, offset: [0, -30] });
        info.open(this.map!, marker.getPosition());
      });
      return marker;
    });
    if (markers.length > 0) this.map.setFitView(markers, false, [64, 64, 64, 64]);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}
