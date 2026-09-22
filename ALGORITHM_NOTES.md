# Algorithm Notes

## POI 自动确认与候选

输入：城市与地点名称；输出：resolved、ambiguous 或 not_found。

高德最多保留前 3 个候选。仅有一个结果、或只有一个规范化后完全同名结果时自动确认；仅有一个包含输入名称的候选也自动确认；其他情况要求用户选择。阈值为候选数 `1`，是 Demo 的保守 heuristic，不是训练结果。最坏情况是同一路段的重复 POI 需要多余一次确认；后续可按 POI ID、地址和几何范围去重。

## Duration

输入：攻略语义与地点类别；输出：`30/60/90/120/180/240/480/null`。

原文出现明确时长时使用 `user_content`；否则模型只能选上述档位并标记 `model_estimate`；无法判断为 `unknown`。档位是避免伪精确的产品约束，不来自统计数据。最坏情况是模型粗估不符合用户偏好，用户可在卡片中直接改写。

## LLM Retry

模型输出无法 JSON parse 或不满足 schema 时重试一次相同 Prompt；第二次失败返回错误。重试次数 `1` 是控制 Demo 延迟与成本的经验值，后续可加入专用 repair prompt 与观测数据。

## Recommendation Score

输入为攻略原始表达，输出 1–5 的种草指数与一句理由。模型按 Prompt 语义判断，不使用高德评分或外部知识；信息不足固定为 3。前端按分数降序、同分保持原出现顺序。批量“去掉三星以下”是严格删除 1、2 星，但 `mustVisit` 永远保留。用户必去与删除优先于模型分数；这些字段将作为 Phase 3C 的输入，不生成路线。

## Phase 3C-1.5 POI Deduplication

去重发生在高德 Grounding 之后、Day 分组和路线规划之前。只有 `resolved` 且拥有非空高德 `poiId` 的 Place 才会按 `poiId` 合并；同名、ambiguous、not_found 和 failed 都不会猜测性合并。`poiId` 是当前唯一经真实地图确认的地点 identity。

合并时保留原列表最早出现的 canonical Place 的 id 和高德真实 POI 字段。Tips 会 trim 后按完全相同文本去重并合并；`mustVisit` 使用 OR；种草指数暂取最大值，理由取该最高分记录的理由。这是为了不在去重时丢失强推荐信号的临时 heuristic，不代表多攻略共识，C4 会重新设计内容证据与聚合。时长按 `user_content > model_estimate > unknown` 选择；同级不同值取较大值，避免容量规划低估时间，是 conservative planning heuristic。类型优先 canonical 的非 other 类型；若出现多个非 other 类型会保留开发 warning。

本阶段不记录 source/article/mention count：当前一次多图输入不是可验证的多篇攻略结构，不能诚实地作来源统计。

## Phase 3C-4 Evidence Merge

Evidence 在 extraction 时以原子化 `text/aspect/sentiment` 保留。相同真实 `poiId` 合并时，将 evidence trim 后仅按完全相同 text 去重；不做语义去重、重复观点判断或冲突判断。后两者由 batch summary prompt 完成，且 evidence 不参与 Day 分组、排序或路线规划。

## Phase 3D-0 Manual Itinerary Overrides

`unassignedPlaceIds` 是仍在旅行地点池、但不属于任何 Day 的真实 POI。用户移动优先于自动 planner：手动 Day assignment 写入 `manualDayOverride`，手动排序写入 `orderSource: manual`。移动后只按当前顺序重算受影响 Day 的真实 RouteSegments，不运行 C1 分组或 C2 NN/2-opt。手动添加地点没有 evidence，默认停留 60 分钟、`durationSource: default`，仅为容量显示的占位值；超容量只提示，不自动移动地点。

## Phase 3D-1 Along-route Food Suggestions

仅对真实通勤时间不少于 15 分钟的 segment 预检查餐饮。沿官方 path 忽略首尾并按 15–25/25–45/>45 分钟取 1/2/最多 3 个 anchor；每个 anchor 以 600m 搜餐饮、按 poiId 去重，并以候选到 polyline 的最小近似距离不超过 500m 粗筛。用户展开后才用真实高德路线计算 `A→R + R→B - A→B`，按绕路时间、评分、分类排序。均为产品 heuristic；session cache 随 path key 变化失效。

## Phase 3C-2 Intra-day Routing

日内问题是 open path：用户还没有提供酒店、起点或终点，因此不假设出发地，也不要求最后回到第一站。输入是 C1 的 `DayGroup.placeIds` 与每个已定位 Place 的坐标；输出是稳定的 `orderedPlaceIds` 和相邻真实 `RouteSegment`。

排序完全确定性且不使用模型：对 Day 内每个地点都作为起点执行 Nearest Neighbor，每一步按 Haversine 距离选最近的未访问地点，同距离按 C1 的原始 `placeIds` 顺序打破平局。每条候选再做 open-path 2-opt，反转中间片段以消除明显折返；最终选 Haversine 总距离最短的路径，完全相同再按原始顺序比较。对 n 个地点，multi-start NN 约为 O(n³)，2-opt 迭代在 Demo 的小规模地点集内运行；不训练模型，因为这是可复现的几何排序问题。

Haversine 只用于排序 proxy 和交通方式 heuristic，不是道路距离、真实步行距离或真实时间。两点直线距离不超过 1.5km 选 walking，超过则选 transit；1.5km 是当前产品 heuristic，未来可按 mobility preference 与真实数据调整。

真实路线使用高德 JS API 2.0 的 `AMap.Walking` 与 `AMap.Transfer`：步行调用 Walking，公共交通调用 Transfer，并使用当前已用于 POI Grounding 的目的地城市作为 city/cityd。保存的数据包括高德返回的 distance（米）、time（秒转分钟）和官方返回 path；transfer 的步行、公交/地铁子段 path 按原返回顺序合并。不会用 Haversine、直线或贝塞尔曲线补假路径。任一 API 失败时该 segment 保存为 failed、distance/duration 为 null、path 为空，其他 segment 继续完成并写 warning。

真实通勤时间只做轻量验证：累计每个 resolved segment 的分钟数；若任一段失败，总通勤显示为未知而不是伪造总数。后续可用实际通勤对跨 Day 分组二次优化，但本阶段不自动搬移地点。
