import type { LogoAnchor } from "@/lib/logoPlacement";
import type { TextStyleName } from "@/lib/textStyles";
import type { Side } from "@/lib/formats";

export type AreaKind = "text" | "image";

// Anker einer Area: entweder eine feste Position (wie beim Logo) oder
// "background" – dann füllt das Bild den kompletten Rahmen als Hintergrund.
export type AreaAnchor = LogoAnchor | "background";

export type AreaDef = {
  id: string;
  kind: AreaKind;
  anchor: AreaAnchor;
  widthRatio: number; // relativ zur Rahmenbreite (0..1)
  heightRatio: number; // relativ zur Rahmenhöhe (0..1)
  text?: string; // bei kind === "text"
  shapeId?: string; // Maskenform bei kind === "image"
  imageDataUrl?: string; // hochgeladenes Bild bei kind === "image"
  grayscale?: boolean; // Bild schwarz/weiß darstellen
  /** Text-Rolle (Größe + Weight) bei kind === "text", siehe lib/textStyles.ts. Default "p1". */
  style?: TextStyleName;
  /**
   * Position oben-links, als Anteil (0..1) der Rahmenbreite/-höhe – wird beim
   * Drag&Drop auf der Canvas gesetzt und überschreibt dann den "anchor".
   */
  x?: number;
  y?: number;
  /**
   * Seite, auf der die Area platziert wird (nur bei zweiseitigen Formaten
   * relevant, siehe lib/formats.ts hasSides()). Wird beim Anlegen auf die
   * gerade in der Sidebar gewählte Seite gesetzt, damit eine auf der
   * Rückseite hinzugefügte Area nicht auch auf der Vorderseite erscheint.
   */
  side?: Side;
};

// Box möglichst knapp um eine Zeile Text gehalten (statt großzügig
// überdimensioniert): so bleibt der Leerraum links/rechts bzw. oben/unten
// klein, und das explizite Drag&Drop-Padding (siehe AREA_DRAG_MARGIN_RATIO in
// Canvas.tsx) bestimmt das tatsächliche, auf allen 4 Seiten gleiche Padding –
// statt dass es vom Zufall abhängt, wie sehr der Text die Box ausfüllt.
export const DEFAULT_TEXT_AREA_SIZE = { widthRatio: 0.35, heightRatio: 0.1 };
export const DEFAULT_IMAGE_AREA_SIZE = { widthRatio: 0.55, heightRatio: 0.55 };
