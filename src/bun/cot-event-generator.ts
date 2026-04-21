// CoT Event Generator
// Generates Cursor-on-Target XML events for mesh state changes
// Compatible with ATAK and other C2 systems

export interface CoTEvent {
  uid: string;
  type: string;
  how: string;
  time: Date;
  start: Date;
  stale: Date;
  lat: number;
  lon: number;
  hae: number;
  ce: number;
  le: number;
  detail: string;
}

export class CotEventGenerator {
  private eventCounter = 0;

  generateMeshStateEvent(
    kitId: string,
    kitName: string,
    state: string,
    lat: number,
    lon: number,
  ): CoTEvent {
    this.eventCounter++;
    const now = new Date();
    const stale = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute stale

    const typeMap: Record<string, string> = {
      FULL: "a-f-G-I",
      PARTIAL_WAN: "a-f-G-I-T",
      HQ_CONTROLLER_LOSS: "a-f-G-I-U",
      KIT_TO_KIT_LOSS: "a-f-G-I-W",
      FULL_ISOLATION: "a-f-G-I-X",
    };

    const detail = `
      <contact callsign="${kitName}" endpoint="${kitId}" />
      <status readiness="${state}" />
      <remarks>Mission Data Grid AutoNet Mesh State: ${state}</remarks>
    `;

    return {
      uid: `mdg-autonet-${kitId}-${this.eventCounter}`,
      type: typeMap[state] || "a-f-G-I",
      how: "m-g",
      time: now,
      start: now,
      stale,
      lat,
      lon,
      hae: 0,
      ce: 10,
      le: 10,
      detail,
    };
  }

  generateDeviceAlertEvent(
    deviceName: string,
    deviceIp: string,
    severity: "CRITICAL" | "WARNING" | "INFO",
    lat: number,
    lon: number,
  ): CoTEvent {
    this.eventCounter++;
    const now = new Date();
    const stale = new Date(now.getTime() + 15 * 60 * 1000);

    const typeMap: Record<string, string> = {
      CRITICAL: "b-m-p-s-m",
      WARNING: "b-m-p-s-c",
      INFO: "b-m-p-s-p",
    };

    return {
      uid: `mdg-alert-${deviceIp}-${this.eventCounter}`,
      type: typeMap[severity] || "b-m-p-s-p",
      how: "h-e",
      time: now,
      start: now,
      stale,
      lat,
      lon,
      hae: 0,
      ce: 50,
      le: 50,
      detail: `<contact callsign="${deviceName}" /><remarks>${severity}: ${deviceName} (${deviceIp})</remarks>`,
    };
  }

  toXml(event: CoTEvent): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<event version="2.0"
  uid="${event.uid}"
  type="${event.type}"
  how="${event.how}"
  time="${this.toCoTTime(event.time)}"
  start="${this.toCoTTime(event.start)}"
  stale="${this.toCoTTime(event.stale)}"
  lat="${event.lat.toFixed(6)}"
  lon="${event.lon.toFixed(6)}"
  hae="${event.hae}"
  ce="${event.ce}"
  le="${event.le}">
  <detail>${event.detail}</detail>
</event>`;
  }

  private toCoTTime(date: Date): string {
    return date.toISOString().replace(/\..+/, "Z");
  }
}
