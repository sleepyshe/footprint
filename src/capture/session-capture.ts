import type { CaptureCheckpoint, CaptureCheckpointName, CaptureEvent, DemoSession } from "./types";

const checkpointOrder: CaptureCheckpointName[] = ["initial", "source_loaded", "ai_processing", "ai_extracted", "pois_ready", "map_ready", "itinerary_ready", "day_1_selected", "day_2_selected", "final"];

/**
 * A deliberately fail-open recorder. It never throws into application code,
 * and receives already-whitelisted display data from the caller.
 */
export class SessionCapture {
  private readonly startedAt = new Date().toISOString();
  private readonly events: CaptureEvent[] = [];
  private readonly checkpoints = new Map<CaptureCheckpointName, CaptureCheckpoint>();

  event(type: string, payload?: unknown): void {
    try { this.events.push({ at: new Date().toISOString(), type, payload: clone(payload) }); } catch { /* capture is optional */ }
  }

  checkpoint(id: CaptureCheckpointName, state: Record<string, unknown>): void {
    try {
      this.checkpoints.set(id, { id, at: new Date().toISOString(), state: clone(state) as Record<string, unknown> });
      this.event("checkpoint", { id });
    } catch { /* capture is optional */ }
  }

  session(): DemoSession {
    return {
      schemaVersion: 1,
      capturedAt: this.startedAt,
      checkpoints: checkpointOrder.flatMap((id) => {
        const checkpoint = this.checkpoints.get(id);
        return checkpoint ? [checkpoint] : [];
      }),
    };
  }

  async export(): Promise<void> {
    try {
      const demo = this.session();
      const raw = this.events.map((event) => JSON.stringify(event)).join("\n") + (this.events.length ? "\n" : "");
      // The local Capture endpoint is best-effort; download remains a usable fallback.
      await fetch("/api/capture/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ demo, raw }) });
      download("demo-session.json", JSON.stringify(demo, null, 2));
      download("raw-session.jsonl", raw, "application/x-ndjson");
    } catch { /* exporting must not disturb the product */ }
  }
}

function clone(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function download(name: string, body: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
