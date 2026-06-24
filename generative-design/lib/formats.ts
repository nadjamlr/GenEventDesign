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
};

export const FORMAT_SIZES: Record<string, FormatSize> = {
  "Social Post": { width: 1080, height: 1080, defaultExportType: "png" },
  Poster: { width: 1191, height: 1684, defaultExportType: "pdf" },
  // DIN lang: 105 x 210 mm
  Flyer: { width: 500, height: 1000, defaultExportType: "pdf", hasSides: true, sideLayout: "row" },
  Video: { width: 1920, height: 1080 },
  "Business Card": { width: 1000, height: 648, defaultExportType: "pdf", hasSides: true },
  Ticket: { width: 1000, height: 400, defaultExportType: "pdf", hasSides: true },
  Voucher: { width: 1000, height: 500, defaultExportType: "pdf", hasSides: true },
  Sticker: { width: 800, height: 800, defaultExportType: "png" },
  Skateboard: { width: 250, height: 1000, cornerRadius: 110, defaultExportType: "pdf" },
};

export const DEFAULT_FORMAT = "Flyer";

export function hasSides(format: string): boolean {
  return !!FORMAT_SIZES[format]?.hasSides;
}

export function getSideLayout(format: string): "row" | "column" {
  return FORMAT_SIZES[format]?.sideLayout ?? "column";
}
