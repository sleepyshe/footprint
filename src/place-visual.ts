import type { Place, PlaceType } from "./types";
export type PlaceVisual = "eat" | "stay" | "transport" | "play" | "other";
export function getPlaceVisual(place: Pick<Place, "type" | "category"> & { poiType?: string }): PlaceVisual {
  const text=`${place.poiType??""} ${place.category??""}`;
  if(/餐饮|咖啡|甜品|小吃|美食/.test(text)||place.type==="food")return "eat";
  if(/酒店|宾馆|民宿|住宿/.test(text)||place.type==="hotel")return "stay";
  if(/地铁|火车|机场|车站|公交|交通/.test(text)||place.type==="transport")return "transport";
  if(/景点|博物馆|公园|街区|商场|寺|展|地标|娱乐/.test(text)||place.type==="attraction")return "play";
  return "other";
}
export const placeVisualIcon:Record<PlaceVisual,string>={eat:"◒",stay:"▣",transport:"➜",play:"⌂",other:"●"};
export const placeTypeFromVisual:Record<PlaceVisual,PlaceType>={eat:"food",stay:"hotel",transport:"transport",play:"attraction",other:"other"};
