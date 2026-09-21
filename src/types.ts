export type PoiStatus = "unresolved" | "resolved" | "ambiguous" | "not_found" | "failed";

export type PlaceCategory = "景点" | "街区" | "餐饮" | "咖啡" | "商场" | "酒店" | "交通" | "其他";
export type PlaceType = "attraction" | "food" | "hotel" | "transport" | "other";
export type DurationSource = "user_content" | "model_estimate" | "unknown";

export interface Place {
  id: string;
  rawName: string;
  poiStatus: PoiStatus;
  name?: string;
  category?: string;
  source?: string;
  tips?: string[];
  type?: PlaceType;
  estimatedDurationMinutes?: number | null;
  durationSource?: DurationSource;
  durationEdited?: boolean;
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
  poiType?: string;
}

export interface ResolvedPlace extends PoiCandidate {
  status: "resolved";
  category?: string;
  tips?: string[];
  type?: PlaceType;
  estimatedDurationMinutes?: number | null;
}

export type ResolvePlaceResult =
  | ResolvedPlace
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: PoiCandidate[] }
  | { status: "failed"; message: string };

export interface ExtractedPlace {
  name: string;
  type: PlaceType;
  category?: string;
  source: string;
  tips: string[];
  estimatedDurationMinutes: number | null;
  durationSource: DurationSource;
}

export interface ExtractionResult {
  city: string | null;
  places: ExtractedPlace[];
}
