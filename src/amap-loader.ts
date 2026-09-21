declare global {
  interface Window {
    AMap?: AMapNamespace;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

export interface AMapPoi {
  id: string;
  name: string;
  address: string;
  location: { lng: number; lat: number };
  type?: string;
}

export interface AMapNamespace {
  Map: new (container: string | HTMLElement, options?: object) => AMapMap;
  Marker: new (options: { position: [number, number]; title?: string; content?: string; offset?: [number, number] }) => AMapMarker;
  Polyline: new (options: { path: [number, number][]; strokeColor: string; strokeWeight?: number; strokeOpacity?: number; strokeStyle?: "solid" | "dashed"; lineJoin?: string }) => AMapPolyline;
  InfoWindow: new (options: { content: string; offset?: [number, number] }) => AMapInfoWindow;
  PlaceSearch: new (options: { city: string; citylimit: boolean; pageSize: number }) => AMapPlaceSearch;
  Walking: new (options?: object) => AMapRouteSearch;
  Transfer: new (options: { city: string; cityd?: string; policy?: number }) => AMapRouteSearch;
}

export interface AMapMap {
  clearMap(): void;
  setFitView(overlays?: (AMapMarker | AMapPolyline)[], immediately?: boolean, avoid?: number[]): void;
  destroy(): void;
}

export interface AMapMarker {
  on(event: "click", listener: () => void): void;
  setMap(map: AMapMap): void;
  getPosition(): unknown;
}
export interface AMapPolyline { setMap(map: AMapMap): void; }

export interface AMapInfoWindow {
  open(map: AMapMap, position: unknown): void;
  close(): void;
}

export interface AMapPlaceSearch {
  search(keyword: string, callback: (status: string, result: { poiList?: { pois?: AMapPoi[] } }) => void): void;
}
export interface AMapRouteSearch {
  search(origin: [number, number], destination: [number, number], callback: (status: string, result: unknown) => void): void;
}

let loadPromise: Promise<AMapNamespace> | undefined;

export function loadAmap(): Promise<AMapNamespace> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_AMAP_KEY?.trim();
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE?.trim();
  if (!key) return Promise.reject(new Error("缺少 VITE_AMAP_KEY，无法加载高德地图。"));
  if (!securityJsCode) return Promise.reject(new Error("缺少 VITE_AMAP_SECURITY_CODE，无法加载高德地图。"));

  window._AMapSecurityConfig = { securityJsCode };
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch,AMap.Walking,AMap.Transfer`;
    script.async = true;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error("高德地图 SDK 未初始化。"));
    script.onerror = () => reject(new Error("高德地图 SDK 加载失败，请检查网络、Key 和域名白名单。"));
    document.head.append(script);
  });
  return loadPromise;
}
