export type ExportType = "png" | "pdf";
export type Side = "front" | "back";

/**
 * Ein Produkt-Mockup-Panel (z.B. ein T-Shirt). Mehrere Panels werden in der
 * Reihenfolge des Arrays nebeneinander (gleich breite Spalten) auf die Canvas
 * gelegt. `region` ist die Design-Zone relativ zur GESAMTEN Canvas (0..1).
 */
export type MockupPanel = {
  /** Produkt-Foto, füllt die Spalte dieses Panels. */
  src: string;
  /** Skaliert nur das Produktfoto in seiner Spalte (1 = füllt die Spalte exakt,
   *  >1 = etwas größer, mittig). Praktisch, wenn ein Foto mehr Rand hat. */
  imageScale?: number;
  /** Design-Zone (z.B. Brust) als Anteil (0..1) der gesamten Canvas. */
  region: { x: number; y: number; w: number; h: number };
  /**
   * "full" = die komplette generierte Komposition (Shapes/Animation/Logo),
   * "logo" = nur das ausgewählte Logo/Icon. Default "full".
   */
  content?: "full" | "logo";
  /**
   * Optionale Alpha-Maske (gleiche Pixel-Proportionen wie das Design-Rechteck) –
   * das Design wird darauf zugeschnitten, damit es z.B. der Kragenrundung folgt
   * statt als hartes Rechteck draufzuliegen. Nur für "full"-Panels relevant.
   */
  maskSrc?: string;
};

export type FormatSize = {
  width: number;
  height: number;
  cornerRadius?: number;
  defaultExportType?: ExportType;
  /** true = Format hat eine Vorder- und Rückseite (z.B. Visitenkarte, Voucher). */
  hasSides?: boolean;
  /** Anordnung von Vorder-/Rückseite in der Vorschau. Default "column". */
  sideLayout?: "row" | "column";
  /** Produkt-Mockup-Panels (eines oder mehrere nebeneinander). */
  mockups?: MockupPanel[];
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
  // Zwei weiße T-Shirts nebeneinander (je 1200×1500). Links nur das Logo/Icon,
  // rechts die komplette generierte Komposition. `region` ist jeweils relativ
  // zur gesamten 2400×1500-Canvas. Die x/y/w/h-Werte sind grob auf die Brust
  // gesetzt und können bei Bedarf feinjustiert werden.
  "T-Shirt": {
    width: 2400,
    height: 1500,
    defaultExportType: "png",
    mockups: [
      {
        src: "/image/Freestyler_White_Packshot_Front_Main_0_44747_1200x1500_1280x1280.jpg",
        content: "logo",
        // Kleines Logo auf der linken Brust (statt mittig).
        region: { x: 0.17, y: 0.31, w: 0.06, h: 0.07 },
      },
      {
        src: "/image/the-organic-cotton-tee-white-402158.jpg",
        content: "full",
        imageScale: 1.08,
        region: { x: 0.677, y: 0.33, w: 0.146, h: 0.19 },
      },
    ],
  },
};

export const DEFAULT_FORMAT = "Social Post";

export function hasSides(format: string): boolean {
  return !!FORMAT_SIZES[format]?.hasSides;
}

export function getSideLayout(format: string): "row" | "column" {
  return FORMAT_SIZES[format]?.sideLayout ?? "column";
}
