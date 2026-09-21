import "./style.css";
import { extractPlaces } from "./ai-extraction";
import { MapView } from "./map-view";
import { resolvePlace } from "./poi-resolver";
import type { Place, PoiCandidate, ResolvedPlace } from "./types";

const SAMPLE = "周末准备去上海玩两天。第一天上午先去武康大楼，然后沿武康路走到安福路，中午随便找地方吃饭。如果不累的话下午去上生新所。第二天上午想去豫园，下午慢慢逛到外滩，晚上就在外滩看夜景。";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到应用根节点");
app.innerHTML = `<main class="app-shell"><aside class="panel"><p class="eyebrow">TRAVEL NOTES TO MAP</p><h1>攻略上图</h1><p class="intro">把收藏的攻略，摊到真实地图上。</p><label class="field city-field" for="city"><span>城市</span><input id="city" value="上海" aria-label="城市" /></label><label class="label" for="notes">攻略文本</label><textarea id="notes" rows="8" aria-label="攻略文本">${SAMPLE}</textarea><button id="extract-button" type="button">帮我上图</button><p id="status" class="status" role="status">正在加载高德地图……</p><section id="places-section" aria-label="地点列表" hidden><p id="places-title" class="label">地点</p><ul id="place-list" class="place-list"></ul></section></aside><section class="map-panel" aria-label="高德地图"><div id="map" class="map"></div><div id="map-message" class="map-message" hidden></div></section></main>`;
const mapView = new MapView();
const mapContainer = document.querySelector<HTMLElement>("#map")!;
const cityInput = document.querySelector<HTMLInputElement>("#city")!;
const notesInput = document.querySelector<HTMLTextAreaElement>("#notes")!;
const button = document.querySelector<HTMLButtonElement>("#extract-button")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const section = document.querySelector<HTMLElement>("#places-section")!;
const title = document.querySelector<HTMLParagraphElement>("#places-title")!;
const list = document.querySelector<HTMLUListElement>("#place-list")!;
const mapMessage = document.querySelector<HTMLDivElement>("#map-message")!;
let mapReady = false;
let places: Place[] = [];

const setStatus = (message: string, error = false): void => { status.textContent = message; status.className = `status ${error ? "is-error" : ""}`; };
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
function toResolved(place: Place): ResolvedPlace | undefined {
  if (place.poiStatus !== "resolved" || !place.poiId || !place.name || !place.address || place.longitude === undefined || place.latitude === undefined) return undefined;
  return { status: "resolved", poiId: place.poiId, name: place.name, address: place.address, longitude: place.longitude, latitude: place.latitude, category: place.category, tips: place.tips };
}
function refreshMap(): void { const resolved = places.map(toResolved).filter((item): item is ResolvedPlace => Boolean(item)); if (mapReady) mapView.showPlaces(resolved); }
function candidateMeta(candidate: PoiCandidate): string { return [candidate.address, candidate.type].filter(Boolean).join(" · ") || "暂无详细信息"; }
function renderPlaces(): void {
  section.hidden = places.length === 0;
  title.textContent = `找到了 ${places.length} 个地点`;
  const labels: Record<Place["poiStatus"], string> = { resolved: "已确认", ambiguous: "需要确认", not_found: "暂未找到", failed: "搜索失败", unresolved: "待确认" };
  list.innerHTML = places.map((place) => `<li class="place-card"><div><span>${escapeHtml(place.rawName)}</span><small>${escapeHtml(place.category ?? "其他")}</small></div><small class="state state-${place.poiStatus}">${labels[place.poiStatus]}</small>${place.tips?.length ? `<p class="tips">${place.tips.map(escapeHtml).join("；")}</p>` : ""}${place.poiStatus === "ambiguous" ? `<div class="candidates"><p>你想去的是：</p>${(place.poiCandidates ?? []).map((candidate, index) => `<button type="button" class="candidate" data-place="${place.id}" data-candidate="${index}"><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidateMeta(candidate))}</span></button>`).join("")}</div>` : ""}</li>`).join("");
  list.querySelectorAll<HTMLButtonElement>(".candidate").forEach((item) => item.addEventListener("click", () => chooseCandidate(item.dataset.place!, Number(item.dataset.candidate))));
}
function chooseCandidate(id: string, index: number): void {
  const place = places.find((item) => item.id === id); const candidate = place?.poiCandidates?.[index];
  if (!place || !candidate) return;
  Object.assign(place, candidate, { poiStatus: "resolved" }); renderPlaces(); refreshMap(); setStatus(`${place.rawName} 已确认并添加到地图。`);
}
async function groundPlaces(city: string): Promise<void> {
  setStatus("正在确认地点……");
  const results = await Promise.all(places.map(async (place) => ({ place, result: await resolvePlace({ city, name: place.rawName }) })));
  places = results.map(({ place, result }) => result.status === "resolved" ? { ...place, ...result, poiStatus: "resolved" } : result.status === "ambiguous" ? { ...place, poiStatus: "ambiguous", poiCandidates: result.candidates } : { ...place, poiStatus: result.status });
  renderPlaces(); refreshMap();
  const confirmed = places.filter((place) => place.poiStatus === "resolved").length;
  setStatus(confirmed ? `${confirmed} 个地点已确认；其余地点可在列表中继续确认。` : "暂无可自动确认的地点，请查看候选结果。", confirmed === 0);
}
async function extractAndShow(): Promise<void> {
  if (!mapReady) return;
  const text = notesInput.value.trim(); const manualCity = cityInput.value.trim();
  if (!text) { setStatus("请先粘贴攻略文本。", true); return; }
  button.disabled = true;
  try {
    setStatus("正在从攻略里找你种草的地方……");
    const extraction = await extractPlaces(text); const city = manualCity || extraction.city;
    if (!city) { setStatus("未能判断城市，请先填写城市后再试。", true); return; }
    if (!manualCity && extraction.city) cityInput.value = extraction.city;
    places = extraction.places.map((place, index) => ({ id: `${place.name}-${index}`, rawName: place.name, poiStatus: "unresolved", ...place }));
    if (!places.length) { renderPlaces(); refreshMap(); setStatus("没有找到明确的可前往地点。", true); return; }
    await groundPlaces(city);
  } catch (error) { setStatus(error instanceof Error ? error.message : "攻略解析失败，请稍后重试。", true); } finally { button.disabled = false; }
}
button.addEventListener("click", () => void extractAndShow());
void mapView.mount(mapContainer).then(() => { mapReady = true; setStatus("地图已加载，粘贴攻略后即可上图。"); }).catch((error: unknown) => { const message = error instanceof Error ? error.message : "高德地图 SDK 加载失败"; mapMessage.textContent = message; mapMessage.hidden = false; setStatus(message, true); button.disabled = true; });
