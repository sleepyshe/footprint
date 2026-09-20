export type PoiStatus = "unresolved" | "resolved" | "ambiguous" | "not_found" | "failed";

export interface Place {
  id: string;
  rawName: string;
  poiStatus: PoiStatus;
}

export interface PoiCandidate {
  name: string;
  address: string;
  longitude: number;
  latitude: number;
  poiId: string;
}

export interface ResolvedPlace extends PoiCandidate {
  status: "resolved";
}

export type ResolvePlaceResult =
  | ResolvedPlace
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: PoiCandidate[] }
  | { status: "failed"; message: string };
