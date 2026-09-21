export type PoiStatus = "unresolved" | "resolved" | "ambiguous" | "not_found" | "failed";

export type PlaceCategory = "景点" | "街区" | "餐饮" | "咖啡" | "商场" | "酒店" | "交通" | "其他";

export interface Place {
  id: string;
  rawName: string;
  poiStatus: PoiStatus;
  name?: string;
  category?: PlaceCategory;
  source?: string;
  tips?: string[];
  poiCandidates?: PoiCandidate[];
  poiId?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
}

export interface PoiCandidate {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  poiId: string;
  type?: string;
}

export interface ResolvedPlace extends PoiCandidate {
  status: "resolved";
  category?: PlaceCategory;
  tips?: string[];
}

export type ResolvePlaceResult =
  | ResolvedPlace
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: PoiCandidate[] }
  | { status: "failed"; message: string };

export interface ExtractedPlace {
  name: string;
  category: PlaceCategory;
  source: "攻略文本";
  tips: string[];
}

export interface ExtractionResult {
  city: string | null;
  places: ExtractedPlace[];
}
