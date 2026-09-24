/** Capture-only schema. It intentionally contains no credentials or SDK traces. */
export type CaptureCheckpointName =
  | "initial"
  | "source_loaded"
  | "ai_processing"
  | "ai_extracted"
  | "pois_ready"
  | "map_ready"
  | "itinerary_ready"
  | "day_1_selected"
  | "day_2_selected"
  | "final";

export interface CaptureEvent {
  at: string;
  type: string;
  payload?: unknown;
}

export interface CaptureCheckpoint {
  id: CaptureCheckpointName;
  at: string;
  state: Record<string, unknown>;
}

export interface DemoSession {
  schemaVersion: 1;
  capturedAt: string;
  checkpoints: CaptureCheckpoint[];
}
