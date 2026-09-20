import "./style.css";
import { DEFAULT_CITY, DEFAULT_PLACES } from "./data/places";
import { MapView } from "./map-view";
import { resolvePlace } from "./poi-resolver";
import type { ResolvePlaceResult } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到应用根节点");

app.innerHTML = `
  <main class="app-shell">
    <aside class="panel">
      <p class="eyebrow">TRAVEL NOTES TO MAP</p>
      <h1>攻略上图</h1>
      <p class="intro">先把想去的地方，放到真实地图上。</p>
      <div class="field"><span>城市</span><strong>${DEFAULT_CITY}</strong></div>
      <section aria-label="地点列表">
        <p class="label">地点</p>
        <ul id="place-list" class="place-list"></ul>
      </section>
      <button id="resolve-button" type="button">在地图上看看</button>
      <p id="status" class="status" role="status">正在加载高德地图……</p>
    </aside>
    <section class="map-panel" aria-label="高德地图">
      <div id="map" class="map"></div>
      <div id="map-message" class="map-message" hidden></div>
    </section>
  </main>
`;

const mapContainer = document.querySelector<HTMLElement>("#map")!;
const button = document.querySelector<HTMLButtonElement>("#resolve-button")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const list = document.querySelector<HTMLUListElement>("#place-list")!;
const mapMessage = document.querySelector<HTMLDivElement>("#map-message")!;
const mapView = new MapView();
let mapReady = false;

function renderPlaces(results: Map<string, ResolvePlaceResult>): void {
  list.innerHTML = DEFAULT_PLACES.map((place) => {
    const result = results.get(place.id);
    const state = !result ? "待确认" : result.status === "resolved" ? "已确认" : result.status === "ambiguous" ? "需要确认" : result.status === "not_found" ? "未找到" : "搜索失败";
    return `<li><span>${place.rawName}</span><small class="state state-${result?.status ?? "unresolved"}">${state}</small></li>`;
  }).join("");
}

function setStatus(message: string, kind: "normal" | "error" = "normal"): void {
  status.textContent = message;
  status.className = `status ${kind === "error" ? "is-error" : ""}`;
}

function showMapError(message: string): void {
  mapMessage.textContent = message;
  mapMessage.hidden = false;
}

async function resolveAndShow(): Promise<void> {
  if (!mapReady) return;
  button.disabled = true;
  setStatus("正在确认地点……");
  const resultEntries = await Promise.all(DEFAULT_PLACES.map(async (place) => [place.id, await resolvePlace({ city: DEFAULT_CITY, name: place.rawName })] as const));
  const results = new Map(resultEntries);
  renderPlaces(results);

  const resolved = resultEntries.flatMap(([, result]) => result.status === "resolved" ? [result] : []);
  const notFound = resultEntries.filter(([, result]) => result.status === "not_found").length;
  const ambiguous = resultEntries.filter(([, result]) => result.status === "ambiguous").length;
  const failed = resultEntries.filter(([, result]) => result.status === "failed").length;

  if (resolved.length > 0) {
    try {
      mapView.showPlaces(resolved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "地图 Marker 展示失败";
      showMapError(message);
      setStatus(message, "error");
      button.disabled = false;
      return;
    }
  }

  if (resolved.length === DEFAULT_PLACES.length) {
    setStatus("3 个地点已找到，点击地图 Marker 可查看地址。");
  } else if (resolved.length > 0) {
    const unresolved = notFound + ambiguous + failed;
    setStatus(`${resolved.length} 个地点已找到，${unresolved} 个地点暂未能确认。`);
  } else if (failed > 0) {
    setStatus("POI 搜索失败，请检查高德 Key、网络和域名白名单后重试。", "error");
  } else {
    setStatus("暂未找到可确认的地点。", "error");
  }
  button.disabled = false;
}

button.addEventListener("click", () => void resolveAndShow());
renderPlaces(new Map());

void mapView.mount(mapContainer)
  .then(() => {
    mapReady = true;
    setStatus("地图已加载，正在确认地点……");
    return resolveAndShow();
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "高德地图 SDK 加载失败";
    showMapError(message);
    setStatus(message, "error");
    button.disabled = true;
  });
