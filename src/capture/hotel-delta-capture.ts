/** Capture-only delta recorder for the optional hotel-selection follow-up. */
export interface HotelDeltaPayload {
  schemaVersion: 1;
  baseSession: string;
  baseCheckpoint: string;
  capturedAt: string;
  beforeHotel: unknown;
  hotelPlace: unknown;
  afterHotel: unknown;
  changedDays: unknown[];
  changedRoutes: unknown[];
  changedMarkers: unknown;
  uiChanges: unknown;
}

export class HotelDeltaCapture {
  private before: unknown;

  start(before: unknown): void {
    try { this.before = clone(before); } catch { /* optional debug recorder */ }
  }

  ready(): boolean { return this.before !== undefined; }

  async export(makePayload: (before: unknown) => HotelDeltaPayload | undefined): Promise<void> {
    try {
      if (this.before === undefined) return;
      const payload = makePayload(clone(this.before));
      if (!payload) return;
      await fetch("/api/capture/export-hotel-delta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      download("hotel-delta.json", JSON.stringify(payload, null, 2));
    } catch { /* exporting must never affect the product */ }
  }
}

function clone(value: unknown): unknown { return JSON.parse(JSON.stringify(value)); }

function download(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
