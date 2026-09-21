import "./style.css";
import { extractPlaces, type ImageInput } from "./ai-extraction";
import { MapView } from "./map-view";
import { resolvePlace } from "./poi-resolver";
import type { Place, PoiCandidate, ResolvedPlace } from "./types";
import { groupPlaces, PACE_PRESETS } from "./day-grouping";
import type { TripPreferences, PlanningResult } from "./types";

const SAMPLE = "周末准备去上海玩两天。第一天上午先去武康大楼，然后沿武康路走到安福路，中午随便找地方吃饭。如果不累的话下午去上生新所。第二天上午想去豫园，下午慢慢逛到外滩，晚上就在外滩看夜景。";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到应用根节点");
app.innerHTML = `<main class="app-shell"><aside class="panel"><p class="eyebrow">TRAVEL NOTES TO MAP</p><h1>攻略上图</h1><p class="intro">把收藏的攻略，摊到真实地图上。</p><section class="input-panel"><div id="input-summary" class="input-summary" hidden><span id="input-summary-text"></span><button id="edit-input" class="secondary-button" type="button">展开</button></div><div id="input-area"><label class="field city-field" for="city"><span>城市</span><input id="city" value="上海" aria-label="城市" /></label><label class="label" for="notes">攻略文本</label><textarea id="notes" rows="8" aria-label="攻略文本">${SAMPLE}</textarea><label class="upload" for="images"><span>上传攻略截图（最多 6 张）</span><strong>选择图片</strong><input id="images" type="file" accept="image/png,image/jpeg,image/webp" multiple /></label><div id="previews" class="previews"></div></div></section><button id="extract-button" class="primary-button" type="button">帮我上图</button><p id="status" class="status" role="status">正在加载高德地图……</p><section id="places-section" aria-label="地点列表" hidden><div class="trip-controls"><strong>你想怎么玩？</strong><select id="trip-days"><option value="auto">随便</option><option value="1">1天</option><option value="2">2天1晚</option><option value="3">3天2晚</option><option value="4">4天3晚</option><option value="5">5天4晚</option></select><select id="pace"><option value="vacation">度假</option><option value="relaxed">轻松</option><option value="flexible" selected>随便</option><option value="compact">紧凑</option><option value="intense">特种兵</option></select><button id="plan-days">生成多日安排</button></div><div id="day-groups"></div><p id="places-title" class="label">地点</p><div class="decision-toolbar"><div id="filters"><button data-filter="0">全部</button><button data-filter="5">5星</button><button data-filter="4">4星+</button><button data-filter="3">3星+</button></div><button id="remove-low">去掉三星以下</button></div><ul id="place-list" class="place-list"></ul></section></aside><section class="map-panel" aria-label="高德地图"><div id="map" class="map"></div><div id="map-message" class="map-message" hidden></div></section></main>`;
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
const inputArea = document.querySelector<HTMLElement>("#input-area")!; const imageInput = document.querySelector<HTMLInputElement>("#images")!; const previews = document.querySelector<HTMLElement>("#previews")!; const editInput = document.querySelector<HTMLButtonElement>("#edit-input")!; const inputSummary = document.querySelector<HTMLElement>("#input-summary")!; const inputSummaryText = document.querySelector<HTMLElement>("#input-summary-text")!;
let mapReady = false;
let places: Place[] = [];
let images: ImageInput[] = [];
let scoreFilter = 0; let removedPlaces: Place[] = [];

const setStatus = (message: string, error = false): void => { status.textContent = message; status.className = `status ${error ? "is-error" : ""}`; };
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
function toResolved(place: Place): ResolvedPlace | undefined {
  if (place.poiStatus !== "resolved" || !place.poiId || !place.name || !place.address || place.longitude === undefined || place.latitude === undefined) return undefined;
  return { status: "resolved", poiId: place.poiId, name: place.name, address: place.address, longitude: place.longitude, latitude: place.latitude, category: place.category, tips: place.tips, type: place.type };
}
function refreshMap(): void { const resolved = places.map(toResolved).filter((item): item is ResolvedPlace => Boolean(item)); if (mapReady) mapView.showPlaces(resolved); }
function candidateMeta(candidate: PoiCandidate): string { return [candidate.address, candidate.poiType].filter(Boolean).join(" · ") || "暂无详细信息"; }
function renderPlaces(): void {
  section.hidden = places.length === 0;
  title.textContent = `找到了 ${places.length} 个地点`;
  const labels: Record<Place["poiStatus"], string> = { resolved: "✓ 已定位", ambiguous: "? 需要确认", not_found: "! 未找到", failed: "× 搜索失败", unresolved: "待确认" };
  const visible = places.map((p,i)=>({p,i})).filter(({p})=>p.recommendationScore>=scoreFilter).sort((a,b)=>b.p.recommendationScore-a.p.recommendationScore||a.i-b.i);
  list.innerHTML = visible.map(({p:place}) => `<li class="place-card"><div class="place-card-header"><div class="place-title"><span class="place-name">${typeIcon(place.type)} ${escapeHtml(place.rawName)}</span><span class="type-badge">${escapeHtml(displayType(place.type, place.category))}</span></div><div class="place-actions"><span class="state state-${place.poiStatus}">${labels[place.poiStatus]}</span><button class="delete" data-delete="${place.id}" type="button">删除</button></div></div><div class="score-row"><strong>${"★".repeat(place.recommendationScore)}${"☆".repeat(5-place.recommendationScore)}</strong><span>种草指数 · 来自导入攻略</span></div><p class="reason">${escapeHtml(place.recommendationReason ?? "攻略未表达明显倾向")}</p><div class="place-meta"><label>预计停留 <select data-duration="${place.id}">${durationOptions(place.estimatedDurationMinutes)}</select></label><button class="must-visit ${place.mustVisit?"active":""}" data-must="${place.id}">${place.mustVisit?"♥ 必去":"♡ 设为必去"}</button></div>${place.tips?.length ? `<p class="tips">攻略提示：${place.tips.map(escapeHtml).join("；")}</p>` : ""}${place.poiStatus === "ambiguous" && (place.poiCandidates?.length ?? 0) > 0 ? `<div class="candidates"><p>你想去的是：</p>${(place.poiCandidates ?? []).map((candidate, index) => `<button type="button" class="candidate" data-place="${place.id}" data-candidate="${index}"><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidateMeta(candidate))}</span></button>`).join("")}<button type="button" class="skip-candidate" data-skip="${place.id}">暂时跳过</button></div>` : ""}</li>`).join("");
  list.querySelectorAll<HTMLButtonElement>(".candidate").forEach((item) => item.addEventListener("click", () => chooseCandidate(item.dataset.place!, Number(item.dataset.candidate))));
  list.querySelectorAll<HTMLButtonElement>(".delete").forEach((item) => item.addEventListener("click", () => { places = places.filter((p) => p.id !== item.dataset.delete); renderPlaces(); refreshMap(); }));
  list.querySelectorAll<HTMLSelectElement>("select[data-duration]").forEach((item) => item.addEventListener("change", () => { const p = places.find((x) => x.id === item.dataset.duration); if (p) { p.estimatedDurationMinutes = item.value ? Number(item.value) : null; p.durationEdited = true; } }));
  list.querySelectorAll<HTMLButtonElement>(".skip-candidate").forEach((item) => item.addEventListener("click", () => { const p = places.find((x) => x.id === item.dataset.skip); if (p) { p.poiCandidates = []; renderPlaces(); } }));
  list.querySelectorAll<HTMLButtonElement>(".must-visit").forEach((item) => item.addEventListener("click", () => { const p=places.find(x=>x.id===item.dataset.must); if(p){p.mustVisit=!p.mustVisit;renderPlaces();} }));
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
    const extraction = await extractPlaces(text, images); const city = manualCity || extraction.city;
    if (!city) { setStatus("未能判断城市，请先填写城市后再试。", true); return; }
    if (!manualCity && extraction.city) cityInput.value = extraction.city;
    places = extraction.places.map((place, index) => ({ id: `${place.name}-${index}`, rawName: place.name, poiStatus: "unresolved", mustVisit:false, ...place })); setInputCollapsed(true);
    if (!places.length) { renderPlaces(); refreshMap(); setStatus("没有找到明确的可前往地点。", true); return; }
    await groundPlaces(city);
  } catch (error) { setStatus(error instanceof Error ? error.message : "攻略解析失败，请稍后重试。", true); } finally { button.disabled = false; }
}
button.addEventListener("click", () => void extractAndShow());
document.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b)=>b.addEventListener("click",()=>{scoreFilter=Number(b.dataset.filter);renderPlaces();}));
document.querySelector<HTMLButtonElement>("#remove-low")!.addEventListener("click",()=>{const removed=places.filter(p=>p.recommendationScore<3&&!p.mustVisit);removedPlaces.push(...removed);places=places.filter(p=>p.recommendationScore>=3||p.mustVisit);renderPlaces();refreshMap();setStatus(`已移除 ${removed.length} 个低优先级地点。`);});
document.querySelector<HTMLButtonElement>("#plan-days")!.addEventListener("click",()=>{const raw=(document.querySelector<HTMLSelectElement>("#trip-days")!).value;const pace=(document.querySelector<HTMLSelectElement>("#pace")!).value as TripPreferences["pace"];const prefs:TripPreferences={tripDays:raw==="auto"?null:Number(raw),tripNights:raw==="auto"?null:Math.max(0,Number(raw)-1),durationMode:raw==="auto"?"auto":"user_selected",pace};const result=groupPlaces(places,prefs);const box=document.querySelector<HTMLElement>("#day-groups")!;box.innerHTML=`${result.inferredDays?`<p>建议 ${result.inferredDays} 天 · ${PACE_PRESETS[pace].label}</p>`:""}${result.groups.map(g=>`<div class="day-card"><strong>Day ${g.day} · ${g.placeIds.length} 个地点</strong><small>预计游玩 ${(g.estimatedActivityMinutes/60).toFixed(1)}h</small>${g.placeIds.map(id=>`<span>${escapeHtml(places.find(p=>p.id===id)?.rawName??"")}</span>`).join("")}</div>`).join("")}${result.warnings.map(w=>`<p class="warning">⚠️ ${w}</p>`).join("")}`;});
editInput.addEventListener("click", () => setInputCollapsed(!inputArea.hidden));
imageInput.addEventListener("change", async () => { const files = [...(imageInput.files ?? [])]; if (files.length > 6 || files.some((f) => f.size > 5 * 1024 * 1024)) { setStatus("最多 6 张图片，单张不超过 5MB。", true); imageInput.value = ""; return; } images = await Promise.all(files.map(async (file) => ({ mimeType: file.type, data: (await file.arrayBuffer() && await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.readAsDataURL(file); })) }))); previews.textContent = `已选择 ${images.length} 张攻略截图`;
});
function typeIcon(type?: Place["type"]): string { return ({ attraction: "🎡", food: "🍜", hotel: "🏨", transport: "🚄", other: "📍" })[type ?? "other"]; }
function displayType(type?: Place["type"], category?: string): string { return ({ attraction: "景点", food: "餐饮", hotel: "住宿", transport: "交通", other: "其他" })[type ?? "other"] ?? category ?? "其他"; }
function durationOptions(value?: number | null): string { return [[30,"30m"],[60,"1h"],[90,"1.5h"],[120,"2h"],[180,"3h"],[240,"4h"],[480,"全天"]].map(([n,label]) => `<option value="${n}" ${value === n ? "selected" : ""}>${label}</option>`).join(""); }
function setInputCollapsed(collapsed: boolean): void { inputArea.hidden = collapsed; inputSummary.hidden = !collapsed; if (collapsed) { const parts = []; if (notesInput.value.trim()) parts.push(`📄 已解析攻略 · ${notesInput.value.trim().length} 字`); if (images.length) parts.push(`📷 ${images.length} 张攻略截图`); inputSummaryText.textContent = parts.join(" + "); editInput.textContent = "展开"; } else editInput.textContent = "收起"; }
void mapView.mount(mapContainer).then(() => { mapReady = true; setStatus("地图已加载，粘贴攻略后即可上图。"); }).catch((error: unknown) => { const message = error instanceof Error ? error.message : "高德地图 SDK 加载失败"; mapMessage.textContent = message; mapMessage.hidden = false; setStatus(message, true); button.disabled = true; });
