export type PoiStatus = "unresolved" | "resolved" | "ambiguous" | "not_found" | "failed";

export type PlaceCategory = "景点" | "街区" | "餐饮" | "咖啡" | "商场" | "酒店" | "交通" | "其他";
export type PlaceType = "attraction" | "food" | "hotel" | "transport" | "other";
export type DurationSource = "user_content" | "model_estimate" | "default" | "unknown";
export type RecommendationScore = 1 | 2 | 3 | 4 | 5;
export type EvidenceAspect = "timing" | "duration" | "route" | "photo" | "queue" | "cost" | "reservation" | "experience" | "other";
export type EvidenceSentiment = "positive" | "neutral" | "negative";

/** A single atomic statement grounded in the user's imported material. */
export interface PlaceEvidence {
  text: string;
  aspect: EvidenceAspect;
  sentiment: EvidenceSentiment;
}

/** Derived from evidence only; it never replaces the original evidence. */
export interface PlaceGuideSummary {
  placeId: string;
  oneLineSummary: string | null;
  repeatedPoints: string[];
  practicalTips: string[];
  conflicts: Array<{ topic: string; viewpoints: string[] }>;
}

export interface Place {
  id: string;
  rawName: string;
  poiStatus: PoiStatus;
  name?: string;
  category?: string;
  source?: string;
  tips?: string[];
  evidence?: PlaceEvidence[];
  type?: PlaceType;
  estimatedDurationMinutes?: number | null;
  durationSource?: DurationSource;
  durationEdited?: boolean;
  recommendationScore: RecommendationScore;
  recommendationReason?: string;
  mustVisit: boolean;
  manualDayOverride?: number | null;
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
  placeId?: string;
  category?: string;
  tips?: string[];
  type?: PlaceType;
  estimatedDurationMinutes?: number | null;
  recommendationScore?: RecommendationScore;
  mustVisit?: boolean;
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
  evidence: PlaceEvidence[];
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
export type RouteFailureReason = "api_error" | "no_route" | "invalid_input" | "parse_error" | "service_unavailable" | "unknown";
/**
 * Developer-facing AMap callback snapshot. It is deliberately kept on failed
 * segments so that the UI can stay simple while a real route failure remains
 * inspectable in the browser console and application state.
 */
export interface RouteDiagnostic {
  fromName: string;
  toName: string;
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  transportMode: TransportMode;
  amapStatus?: string;
  amapMessage?: string;
  amapInfo?: string;
  rawResult?: unknown;
  decision: string;
}
export interface RouteSegment {
  fromPlaceId: string;
  toPlaceId: string;
  transportMode: TransportMode;
  distanceMeters: number | null;
  durationMinutes: number | null;
  /** Only geometry returned by AMap route services is kept here. */
  path: RoutePoint[];
  status: "resolved" | "failed";
  routeFailureReason?: RouteFailureReason;
  diagnostic?: RouteDiagnostic;
}
export interface DayRoute {
  day: number;
  placeIds: string[];
  orderedPlaceIds: string[];
  segments: RouteSegment[];
  totalActivityMinutes: number;
  totalTransitMinutes: number | null;
  warnings: string[];
  orderSource?: "auto" | "manual";
  isUpdating?: boolean;
}
export interface RoutePlanningResult { days: DayRoute[]; warnings: string[]; }
