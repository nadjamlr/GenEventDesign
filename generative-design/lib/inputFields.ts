import type { LogoAnchor } from "@/lib/logoPlacement";
import type { Side } from "@/lib/formats";
import type { TextStyleName } from "@/lib/textStyles";

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
  /**
   * Text-Rolle (Größe + Weight), siehe lib/textStyles.ts. Dieselbe Rolle
   * sieht über alle Formate hinweg gleich aus. Default "text".
   */
  style?: TextStyleName;
  /**
   * Feste, eigene Position auf dem Frame – v.a. für locked-Felder wie
   * Website/Voucher-Label gedacht. Wenn gesetzt, wird das Feld NICHT in den
   * gemeinsamen Input-Textblock (siehe FORMAT_INPUT_LAYOUT) gestapelt,
   * sondern einzeln an diesem Anker gezeichnet.
   */
  position?: { anchor: LogoAnchor; align?: "left" | "center" | "right" };
};

export type InputLayout = {
  anchor: LogoAnchor;
  widthRatio: number;
  heightRatio: number;
  align: "left" | "center" | "right";
};

// Trag hier die festen Default-Werte ein (z.B. Website, Voucher-/Ticket-Begriff).
// "style" ordnet jedem Feld eine wiederverwendbare Text-Rolle zu (siehe
// lib/textStyles.ts) – h1/h2/h3/p1/p2 sehen über alle Formate hinweg gleich aus.
export const FORMAT_INPUT_FIELDS: Record<string, InputFieldDef[]> = {
  "Business Card": [
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front", style: "p2" },
    { key: "firstName", label: "First", side: "back", style: "h1" },
    { key: "lastName", label: "Last", side: "back", style: "h1" },
    { key: "position", label: "Position", side: "back", style: "h3" },
    { key: "address", label: "Address", side: "back", style: "p2" },
    { key: "phone", label: "Phone", side: "back", style: "p2" },
    { key: "email", label: "Mail", side: "back", style: "p2" },
  ],
  Voucher: [
    { key: "voucherLabel", label: "Voucher", locked: true, defaultValue: "", side: "front", style: "h1" },
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front", style: "p2" },
    { key: "value", label: "Value", side: "back", style: "h1" },
    { key: "validUntil", label: "Valid until", side: "back", style: "p2" },
    { key: "address", label: "Address Line1", locked: true, defaultValue: "Baderstraße 2", side: "back", style: "p2" },
    { key: "address", label: "Address Line2", locked: true, defaultValue: "81466 Munich", side: "back", style: "p2" },
  ],
  Ticket: [
    { key: "ticketLabel", label: "Ticket", locked: true, defaultValue: "", side: "front", style: "h1" },
    { key: "website", label: "Website", locked: true, defaultValue: "nrly.com", side: "front", style: "p2" },
    { key: "eventName", label: "Event", side: "front", style: "h3" },
    { key: "text", label: "Text", optional: true, side: "back", style: "p1" },
    { key: "date", label: "Date", optional: true, side: "back", style: "p2" },
    { key: "location", label: "Location", optional: true, side: "back", style: "p2" },
  ],
  Flyer: [
    { key: "Heading", label: "Heading", side: "front", style: "h1" },
    { key: "Subtitle", label: "Subtitle", side: "front", optional: true, style: "h3" },
    { key: "Text", label: "Text", side: "front", optional: true, style: "p1" },
    { key: "Heading 1", label: "Heading 1", side: "back", style: "h1" },
    { key: "Text 1", label: "Text 1", side: "back", style: "p1" },
    { key: "Heading 2", label: "Heading 2", side: "back", optional: true, style: "h2" },
    { key: "Text 2", label: "Text 2", side: "back", optional: true, style: "p1" },
  ],
};

export function getInputFields(format: string, side?: Side): InputFieldDef[] {
  const all = FORMAT_INPUT_FIELDS[format] ?? [];
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
