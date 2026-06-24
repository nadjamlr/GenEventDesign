import type { LogoAnchor } from "@/lib/logoPlacement";
import type { Side } from "@/lib/formats";

export type InputFieldDef = {
  key: string;
  label: string;
  /** true = fester Wert, wird nur angezeigt und ist nicht editierbar */
  locked?: boolean;
  /** Bei locked: der feste Wert. Bei editierbaren Feldern: Vorbelegung. */
  defaultValue?: string;
  /** rein informativ, erzwingt aktuell keine Validierung */
  optional?: boolean;
  /** Bei Formaten mit Vorder-/Rückseite: auf welcher Seite das Feld erscheint. Default "back". */
  side?: Side;
  /** Größer dargestellt als die übrigen Zeilen (z.B. "VOUCHER"/"TICKET"-Schriftzug). */
  emphasis?: boolean;
};

export type InputLayout = {
  anchor: LogoAnchor;
  widthRatio: number;
  heightRatio: number;
  align: "left" | "center" | "right";
};

// Trag hier die festen Default-Werte ein (z.B. Website, Voucher-/Ticket-Begriff).
export const FORMAT_INPUT_FIELDS: Record<string, InputFieldDef[]> = {
  "Business Card": [
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front" },
    { key: "firstName", label: "First", side: "back" },
    { key: "lastName", label: "Last", side: "back" },
    { key: "position", label: "Position", side: "back" },
    { key: "address", label: "Adresse", side: "back" },
    { key: "phone", label: "Phone", side: "back" },
    { key: "email", label: "Email", side: "back" },
  ],
  Voucher: [
    { key: "voucherLabel", label: "Voucher", locked: true, defaultValue: "", side: "front", emphasis: true },
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front" },
    { key: "value", label: "Value", side: "back" },
    { key: "validUntil", label: "Valid until", side: "back" },
  ],
  Ticket: [
    { key: "ticketLabel", label: "Ticket", locked: true, defaultValue: "", side: "front", emphasis: true },
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front" },
    { key: "eventName", label: "Event", side: "front" },
    { key: "text", label: "Text", optional: true, side: "back" },
  ],
  Flyer: [{ key: "text", label: "Text", side: "front" }],
  Skateboard: [{ key: "text", label: "Text", optional: true }],
};

export const DEFAULT_INPUT_FIELDS: InputFieldDef[] = [{ key: "text", label: "Text" }];

export function getInputFields(format: string, side?: Side): InputFieldDef[] {
  const all = FORMAT_INPUT_FIELDS[format] ?? DEFAULT_INPUT_FIELDS;
  if (!side) return all;
  return all.filter((field) => (field.side ?? "back") === side);
}

// Wo und wie der Eingabe-Textblock auf dem Frame platziert wird, pro Format
// (und bei Formaten mit Vorder-/Rückseite optional getrennt nach Seite).
// Anker wurden bewusst so gewählt, dass sie nicht mit den Logo-Zonen (siehe
// lib/logoPlacement.ts) zusammenfallen.
type InputLayoutConfig = { default?: InputLayout; front?: InputLayout; back?: InputLayout };

export const FORMAT_INPUT_LAYOUT: Record<string, InputLayoutConfig> = {
  "Social Post": { default: { anchor: "bottom-left", widthRatio: 0.55, heightRatio: 0.2, align: "left" } },
  Poster: { default: { anchor: "bottom-center", widthRatio: 0.6, heightRatio: 0.15, align: "center" } },
  Flyer: {
    front: { anchor: "bottom-center", widthRatio: 0.6, heightRatio: 0.15, align: "center" },
  },
  Video: { default: { anchor: "bottom-center", widthRatio: 0.6, heightRatio: 0.15, align: "center" } },
  "Business Card": {
    front: { anchor: "bottom-left", widthRatio: 0.4, heightRatio: 0.2, align: "left" },
    back: { anchor: "top-left", widthRatio: 0.7, heightRatio: 0.85, align: "left" },
  },
  Ticket: {
    front: { anchor: "bottom-left", widthRatio: 0.6, heightRatio: 0.35, align: "left" },
    back: { anchor: "center", widthRatio: 0.7, heightRatio: 0.3, align: "center" },
  },
  Voucher: {
    front: { anchor: "top-center", widthRatio: 0.8, heightRatio: 0.35, align: "center" },
    back: { anchor: "center", widthRatio: 0.7, heightRatio: 0.3, align: "center" },
  },
  Sticker: { default: { anchor: "bottom-center", widthRatio: 0.7, heightRatio: 0.15, align: "center" } },
  Skateboard: { default: { anchor: "top-center", widthRatio: 0.8, heightRatio: 0.25, align: "center" } },
};

export const DEFAULT_INPUT_LAYOUT: InputLayout = {
  anchor: "bottom-center",
  widthRatio: 0.6,
  heightRatio: 0.15,
  align: "center",
};

export function getInputLayout(format: string, side?: Side): InputLayout {
  const cfg = FORMAT_INPUT_LAYOUT[format];
  if (!cfg) return DEFAULT_INPUT_LAYOUT;
  if (side && cfg[side]) return cfg[side]!;
  return cfg.default ?? DEFAULT_INPUT_LAYOUT;
}
