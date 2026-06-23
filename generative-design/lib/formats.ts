export type ExportType = "png" | "pdf";

export type FormatSize = {
  width: number;
  height: number;
  cornerRadius?: number;
  defaultExportType?: ExportType;
};

export const FORMAT_SIZES: Record<string, FormatSize> = {
  "Social Post": { width: 1080, height: 1080, defaultExportType: "png" },
  Poster: { width: 1191, height: 1684, defaultExportType: "pdf" },
  Flyer: { width: 1000, height: 1414, defaultExportType: "pdf" },
  Video: { width: 1920, height: 1080 },
  "Business Card": { width: 1000, height: 648, defaultExportType: "pdf" },
  Ticket: { width: 1000, height: 400, defaultExportType: "pdf" },
  Voucher: { width: 1000, height: 500, defaultExportType: "pdf" },
  Sticker: { width: 800, height: 800, defaultExportType: "png" },
  Skateboard: { width: 250, height: 1000, cornerRadius: 110, defaultExportType: "pdf" },
};

export const DEFAULT_FORMAT = "Flyer";
