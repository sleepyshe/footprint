# Prompt Notes

## extract-travel-notes

作用：从攻略文本和截图提取值得纳入行程的游览、餐饮、住宿地点、类型、Tips 与停留时长。

输入：可选文本与 1–6 张攻略截图。

输出：`ExtractionResult`（城市和结构化地点）。

模型负责：抽取、去重、语义 type、原文 Tips、固定档位时长估算。

模型不负责：坐标、POI ID、真实地址、距离、交通时间、路线或 Day 分组。

主要约束：地点必须既具体可定位、又被明确推荐/安排为游览、用餐或住宿目的地；不推荐未出现地点；泛化餐饮描述不作为 Place；duration 只能使用固定档位。仅作为出发、抵达、换乘、途经或地址参照出现的机场、火车站、高铁站、地铁站、公交站和区域不进入 Place[]。交通设施本身被明确推荐为体验目的地时才例外进入。

失败处理：服务端 JSON 校验失败自动重试一次；仍失败返回可读错误。

种草指数：只根据攻略表达给 1–5 星；信息不足为 3 星，禁止使用外部旅游知识。理由最多一句，说明原文态度。

当前版本：v6。新增 `evidence[]`：每条是用户输入中关于该地点的原子化信息（`text`、`aspect`、`sentiment`），只保留明确支持的内容；不记录 sourceId 或“第几篇攻略”，因为多张截图没有可靠文章边界。

## summarize-place-guides

作用：在生成行程后，一次性将当前 active canonical Place 的 evidence 压缩为地点可执行摘要。

输入：多个 `{ placeId, name, evidence[] }`；输出每个地点的 `oneLineSummary`、`repeatedPoints`、`practicalTips`、`conflicts`。

约束：严格只根据同一地点的 evidence；不得使用外部旅游知识。`repeatedPoints` 必须由至少两条不同 evidence 语义支持；`conflicts` 只表达同 topic 的真实分歧，不制造冲突。失败时不影响路线，Stop 回退显示既有 tips。当前版本：v1，使用单次 batch 调用。
