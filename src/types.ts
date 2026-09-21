export type PoiStatus = "unresolved" | "resolved" | "ambiguous" | "not_found" | "failed";

export type PlaceCategory = "景点" | "街区" | "餐饮" | "咖啡" | "商场" | "酒店" | "交通" | "其他";
export type PlaceType = "attraction" | "food" | "hotel" | "transport" | "other";
export type DurationSource = "user_content" | "model_estimate" | "unknown";
export type RecommendationScore = 1 | 2 | 3 | 4 | 5;

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
  recommendationScore: RecommendationScore;
  recommendationReason?: string;
  mustVisit: boolean;
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
  recommendationScore: RecommendationScore;
  recommendationReason?: string;
}

export interface ExtractionResult {
  city: string | null;
  places: ExtractedPlace[];
}

export type Pace = "vacation" | "relaxed" | "flexible" | "compact" | "intense";
export interface TripPreferences { tripDays: number | null; tripNights: number | null; durationMode: "user_selected" | "auto"; pace: Pace; }
export interface DayGroup { day: number; placeIds: string[]; estimatedActivityMinutes: number; }
export interface PlanningResult { inferredDays?: number; groups: DayGroup[]; hardToFitPlaceIds: string[]; warnings: string[]; }

export type TransportMode = "walking" | "transit";
export interface RoutePoint { lng: number; lat: number; }
export interface RouteSegment {
  fromPlaceId: string;
  toPlaceId: string;
  transportMode: TransportMode;
  distanceMeters: number | null;
  durationMinutes: number | null;
  /** Only geometry returned by AMap route services is kept here. */
  path: RoutePoint[];
  status: "resolved" | "failed";
}
export interface DayRoute {
  day: number;
  placeIds: string[];
  orderedPlaceIds: string[];
  segments: RouteSegment[];
  totalActivityMinutes: number;
  totalTransitMinutes: number | null;
  warnings: string[];
}
export interface RoutePlanningResult { days: DayRoute[]; warnings: string[]; }
