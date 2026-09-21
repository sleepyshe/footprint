import type { Place } from "../types";

export const DEFAULT_CITY = "上海";

export const DEFAULT_PLACES: Place[] = [
  { id: "wukang-building", rawName: "武康大楼", poiStatus: "unresolved", recommendationScore: 3, mustVisit: false },
  { id: "anfu-road", rawName: "安福路", poiStatus: "unresolved", recommendationScore: 3, mustVisit: false },
  { id: "the-bund", rawName: "外滩", poiStatus: "unresolved", recommendationScore: 3, mustVisit: false },
];
