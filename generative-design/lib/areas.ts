import type { LogoAnchor } from "@/lib/logoPlacement";

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
};

export const DEFAULT_TEXT_AREA_SIZE = { widthRatio: 0.4, heightRatio: 0.2 };
export const DEFAULT_IMAGE_AREA_SIZE = { widthRatio: 0.55, heightRatio: 0.55 };
