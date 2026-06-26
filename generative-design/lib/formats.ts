export type ExportType = "png" | "pdf";
export type Side = "front" | "back";

export type FormatSize = {
  width: number;
  height: number;
  cornerRadius?: number;
  defaultExportType?: ExportType;
  /** true = Format hat eine Vorder- und Rückseite (z.B. Visitenkarte, Voucher). */
  hasSides?: boolean;
  /** Anordnung von Vorder-/Rückseite in der Vorschau. Default "column". */
  sideLayout?: "row" | "column";
  /** Produkt-Mockup-Foto (füllt die Canvas); das Design wird in designRegion gerechnet. */
  mockupSrc?: string;
  /** Design-Zone auf dem Mockup (z.B. Brust), als Anteil (0..1) der Canvas. */
  designRegion?: { x: number; y: number; w: number; h: number };
  /**
   * Alpha-Maske (gleiche Pixel-Proportionen wie mockupSrc) – das Design wird
   * vor dem Compositing auf diese Silhouette zugeschnitten (siehe
   * drawComposition in Canvas.tsx), damit es z.B. der Kragenrundung/den
   * Schultern eines T-Shirts folgt statt als hartes Rechteck draufzuliegen.
   */
  maskSrc?: string;
};

export const FORMAT_SIZES: Record<string, FormatSize> = {
  "Social Post": { width: 1080, height: 1080, defaultExportType: "png" },
  Poster: { width: 1191, height: 1684, defaultExportType: "pdf" },
  // DIN lang: 105 x 210 mm
  Flyer: { width: 500, height: 1000, defaultExportType: "pdf", hasSides: true, sideLayout: "row" },
  Video: { width: 1920, height: 1080 },
  "Business Card": { width: 648, height: 1000, defaultExportType: "pdf", hasSides: true, sideLayout: "row" },
  Ticket: { width: 1000, height: 400, defaultExportType: "pdf", hasSides: true },
  Voucher: { width: 1000, height: 500, defaultExportType: "pdf", hasSides: true },
  Sticker: { width: 800, height: 800, defaultExportType: "png" },
  Skateboard: { width: 250, height: 1000, cornerRadius: 110, defaultExportType: "pdf" },
  // Foto-Mockup eines weißen T-Shirts; das Design füllt die komplette Front
  // (Brust bis Saum), bleibt aber innerhalb des Rumpfbereichs (nicht über die
  // Ärmel hinaus), da es als einfaches Rechteck ohne Perspektiv-Verzug auf
  // das Foto gelegt wird (siehe drawComposition in Canvas.tsx).
  "T-Shirt": {
    width: 1200,
    height: 1500,
    defaultExportType: "png",
    mockupSrc: "/image/Freestyler_White_Packshot_Front_Main_0_44747_1200x1500_1280x1280.jpg",
    maskSrc: "/image/Freestyler_White_mask.png",
    designRegion: { x: 0.57, y: 0.3, w: 0.1, h: 0.1 },
  },
};

export const DEFAULT_FORMAT = "Social Post";

export function hasSides(format: string): boolean {
  return !!FORMAT_SIZES[format]?.hasSides;
}

export function getSideLayout(format: string): "row" | "column" {
  return FORMAT_SIZES[format]?.sideLayout ?? "column";
}
