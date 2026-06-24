export type LogoAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const ALL_ANCHORS: LogoAnchor[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

// Trag hier ein, an welchen Positionen das Logo pro Format landen darf.
// Der Algorithmus wählt bei jeder Generierung eine davon zufällig aus.
export const FORMAT_LOGO_ZONES: Record<string, LogoAnchor[]> = {
  "Social Post": ALL_ANCHORS,
  Poster: ["top-left", "top-right", "bottom-left", "bottom-right"],
  Flyer: ["top-left", "top-right", "bottom-left", "bottom-right"],
  Video: ALL_ANCHORS,
  "Business Card": ["bottom-right"],
  Ticket: ["top-left", "top-right"],
  Voucher: ["bottom-center"],
  Sticker: ["center"],
  Skateboard: ["top-center", "center", "bottom-center"],
};

export function getLogoZones(format: string): LogoAnchor[] {
  return FORMAT_LOGO_ZONES[format] ?? ALL_ANCHORS;
}

export const ANCHOR_LABELS: Record<LogoAnchor, string> = {
  "top-left": "Oben links",
  "top-center": "Oben mittig",
  "top-right": "Oben rechts",
  "middle-left": "Mitte links",
  center: "Mitte",
  "middle-right": "Mitte rechts",
  "bottom-left": "Unten links",
  "bottom-center": "Unten mittig",
  "bottom-right": "Unten rechts",
};

// Position (oben links + Größe) für einen Anker innerhalb eines Rahmens.
// Wird für die Logo-Platzierung und für freie Text-/Bild-Areas verwendet.
export function getAnchorBox(
  anchor: LogoAnchor,
  innerX: number,
  innerY: number,
  innerW: number,
  innerH: number,
  boxW: number,
  boxH: number,
  padding: number
) {
  let x: number;
  if (anchor.includes("left")) x = innerX + padding;
  else if (anchor.includes("right")) x = innerX + innerW - padding - boxW;
  else x = innerX + (innerW - boxW) / 2;

  let y: number;
  if (anchor.includes("top")) y = innerY + padding;
  else if (anchor.includes("bottom")) y = innerY + innerH - padding - boxH;
  else y = innerY + (innerH - boxH) / 2;

  return { x, y };
}
