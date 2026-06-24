import type p5Types from "p5";
import { getLogoZones, getAnchorBox } from "@/lib/logoPlacement";
import type { AreaDef } from "@/lib/areas";
import { getInputFields, getInputLayout } from "@/lib/inputFields";
import { hasSides, type Side } from "@/lib/formats";

export type ShapeImageProvider = {
  isReady: (id: string) => boolean;
  getImage: (id: string, colorHex: string) => p5Types.Image | undefined;
};

export type LogoImages = {
  black?: p5Types.Image;
  white?: p5Types.Image;
};

export type AreaImageProvider = {
  getImage: (area: AreaDef, w: number, h: number) => p5Types.Image | undefined;
};

type Params = {
  columns: number;
  rows: number;
  cornerRadius?: number;
  selectedShapes?: string[];
  selectedColors?: string[];
  shapeImages?: ShapeImageProvider;
  seed?: number;
  format?: string;
  logoImages?: LogoImages;
  areas?: AreaDef[];
  areaImages?: AreaImageProvider;
  inputValues?: Record<string, string>;
  side?: Side;
};

const MARGIN_RATIO = 0.05; // Rand relativ zur kürzeren Kantenlänge
const BLEED_RATIO = 0.18; // wie weit Elemente über den Rand hinausragen dürfen
const FALLBACK_COLOR = "#2F00FF"; // primary-color, falls keine Farbe ausgewählt ist
const LOGO_WIDTH_RATIO = 0.28; // Logo-Breite relativ zur Rahmenbreite
const PADDING_RATIO = 0.06; // Abstand zum Rahmenrand relativ zur Rahmenbreite

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Einfacher seeded PRNG (LCG), damit das Muster bei gleichen Parametern
// stabil bleibt, sich aber ändert, sobald Shapes/Colors/Grid/Seed sich ändern.
function createRng(seed: number) {
  let state = seed || 1;
  return function rng() {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

type Instance = {
  cx: number;
  cy: number;
  size: number;
  shapeId?: string;
  colorHex: string;
};

// Mittelt die Helligkeit einiger Stichproben-Pixel in einem Bereich, damit
// Logo/Text passend zum bisher gezeichneten Untergrund schwarz oder weiß wird.
function sampleBrightness(p5: p5Types, x: number, y: number, w: number, h: number): number {
  const samples = 5;
  let total = 0;
  let count = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const sx = Math.round(x + (w * (i + 0.5)) / samples);
      const sy = Math.round(y + (h * (j + 0.5)) / samples);
      if (sx < 0 || sy < 0 || sx >= p5.width || sy >= p5.height) continue;
      const c = p5.get(sx, sy) as number[];
      total += 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      count++;
    }
  }
  return count > 0 ? total / count : 255;
}

// Hier schreibst du deinen Algorithmus.
// p5 ist die p5.js Instanz, params kommen aus dem Store.
export function drawGrid(p5: p5Types, params: Params) {
  const {
    columns,
    rows,
    cornerRadius = 0,
    selectedShapes = [],
    selectedColors = [],
    shapeImages,
    seed: seedParam = 0,
    format = "",
    logoImages,
    areas = [],
    areaImages,
    inputValues = {},
    side,
  } = params;

  const isTwoSided = hasSides(format);
  const activeSide: Side | undefined = isTwoSided ? side ?? "front" : undefined;

  const availableShapes = shapeImages
    ? selectedShapes.filter((id) => shapeImages.isReady(id))
    : [];

  const seed = hashString(
    `${seedParam}|${activeSide ?? ""}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(
      ","
    )}|${areas.map((a) => a.id).join(",")}`
  );
  const rng = createRng(seed);

  // Hintergrund: bei jeder Generierung zufällig eine der ausgewählten Farben.
  const bgColorHex = selectedColors.length > 0
    ? selectedColors[Math.floor(rng() * selectedColors.length)]
    : "#ffffff";
  p5.background(bgColorHex);

  const margin = Math.min(p5.width, p5.height) * MARGIN_RATIO;
  const innerX = margin;
  const innerY = margin;
  const innerW = p5.width - margin * 2;
  const innerH = p5.height - margin * 2;
  const innerRadius = Math.max(0, cornerRadius - margin);
  const padding = innerW * PADDING_RATIO;

  p5.noFill();
  p5.stroke(0);
  p5.strokeWeight(1);
  p5.rect(innerX, innerY, innerW, innerH, innerRadius);

  // Feste Areas (Text/Bild) bleiben von den generativen Shapes frei.
  const resolvedAreas = areas.map((area) => {
    const w = innerW * area.widthRatio;
    const h = innerH * area.heightRatio;
    const { x, y } = getAnchorBox(area.anchor, innerX, innerY, innerW, innerH, w, h, padding);
    return { area, x, y, w, h };
  });

  // Eingabefelder aus der Sidebar (z.B. Name/Position/Adresse bei der Business
  // Card) als fester Textblock – nur ausgefüllte bzw. feste Werte werden
  // gezeichnet, leere Felder fallen weg. Bei Formaten mit Vorder-/Rückseite
  // werden nur die Felder der aktuell aktiven Seite berücksichtigt.
  const inputFieldDefs = getInputFields(format, activeSide);
  const inputLines = inputFieldDefs
    .map((field) => ({
      text: field.locked ? field.defaultValue : inputValues[field.key],
      emphasis: !!field.emphasis,
    }))
    .filter((line): line is { text: string; emphasis: boolean } => !!line.text && line.text.trim() !== "");
  const inputLayout = getInputLayout(format, activeSide);
  const inputBox =
    inputLines.length > 0
      ? (() => {
          const w = innerW * inputLayout.widthRatio;
          const h = innerH * inputLayout.heightRatio;
          const { x, y } = getAnchorBox(inputLayout.anchor, innerX, innerY, innerW, innerH, w, h, padding);
          return { x, y, w, h };
        })()
      : undefined;

  // Gemeinsame Ausschlusszone für freie Shapes und Logo-Platzierung.
  const exclusionRects = [
    ...resolvedAreas.map(({ x, y, w, h }) => ({ x, y, w, h })),
    ...(inputBox ? [inputBox] : []),
  ];

  // Eine gemeinsame Rotation für die ganze Komposition, in 45°-Schritten –
  // alle Elemente zeigen einheitlich in dieselbe Richtung.
  const angleStep = Math.floor(rng() * 8) * (Math.PI / 4);

  // Spalten/Zeilen-Regler steuern jetzt die Dichte der frei gestreuten
  // Elemente statt fixer Zellen.
  const count = Math.max(1, columns * rows);
  const baseUnit = Math.sqrt((innerW * innerH) / count);
  const bleedX = innerW * BLEED_RATIO;
  const bleedY = innerH * BLEED_RATIO;

  const instances: Instance[] = [];
  for (let i = 0; i < count; i++) {
    // rng()**2 bevorzugt kleinere Elemente, mit gelegentlichen großen
    // Ausreißern – organischer als eine Gleichverteilung.
    const scale = 0.5 + rng() ** 2 * 2.5;
    const cx = innerX - bleedX + rng() * (innerW + bleedX * 2);
    const cy = innerY - bleedY + rng() * (innerH + bleedY * 2);
    const size = baseUnit * scale;

    const intersectsArea = exclusionRects.some(({ x, y, w, h }) =>
      rectsOverlap(cx - size / 2, cy - size / 2, size, size, x, y, w, h)
    );
    if (intersectsArea) continue;

    instances.push({
      cx,
      cy,
      size,
      shapeId:
        availableShapes.length > 0
          ? availableShapes[Math.floor(rng() * availableShapes.length)]
          : undefined,
      colorHex:
        selectedColors.length > 0
          ? selectedColors[Math.floor(rng() * selectedColors.length)]
          : FALLBACK_COLOR,
    });
  }

  // Größte Elemente zuerst (liegen unten), kleinere obenauf – sorgt für
  // Tiefe in den Überlappungen statt zufälligem Gewusel.
  instances.sort((a, b) => b.size - a.size);

  for (const inst of instances) {
    const img =
      inst.shapeId && shapeImages ? shapeImages.getImage(inst.shapeId, inst.colorHex) : undefined;

    p5.push();
    p5.translate(inst.cx, inst.cy);
    p5.rotate(angleStep);

    if (img) {
      const fit = Math.min(inst.size / img.width, inst.size / img.height);
      p5.imageMode(p5.CENTER);
      p5.image(img, 0, 0, img.width * fit, img.height * fit);
    } else {
      p5.noStroke();
      p5.fill(inst.colorHex);
      p5.ellipse(0, 0, inst.size, inst.size);
    }

    p5.pop();
  }

  // Feste Areas zeichnen: Text passend zum Untergrund einfärben, Bilder als
  // durch die gewählte Shape maskiertes Motiv (stark hochskaliert).
  for (const { area, x, y, w, h } of resolvedAreas) {
    if (area.kind === "text") {
      const brightness = sampleBrightness(p5, x, y, w, h);
      p5.noStroke();
      p5.fill(brightness > 140 ? 0 : 255);
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(Math.min(w, h) * 0.16);
      p5.text(area.text ?? "", x + w / 2, y + h / 2, w, h);
    } else if (area.kind === "image" && areaImages) {
      const img = areaImages.getImage(area, w, h);
      if (img) {
        p5.imageMode(p5.CORNER);
        p5.image(img, x, y, w, h);
      }
    }
  }

  // Eingabefelder als Textblock zeichnen, passend zum Untergrund einfärben.
  if (inputBox && inputLines.length > 0) {
    const { x, y, w, h } = inputBox;
    const brightness = sampleBrightness(p5, x, y, w, h);
    p5.noStroke();
    p5.fill(brightness > 140 ? 0 : 255);

    const lineHeight = h / inputLines.length;
    const baseSize = Math.min(lineHeight * 0.6, w * 0.09);
    const alignX =
      inputLayout.align === "left" ? p5.LEFT : inputLayout.align === "right" ? p5.RIGHT : p5.CENTER;
    p5.textAlign(alignX, p5.CENTER);
    const tx = inputLayout.align === "left" ? x : inputLayout.align === "right" ? x + w : x + w / 2;
    inputLines.forEach((line, i) => {
      p5.textSize(line.emphasis ? baseSize * 1.8 : baseSize);
      p5.text(line.text, tx, y + lineHeight * (i + 0.5));
    });
  }

  // Logo zuletzt platzieren: an einer für das Format erlaubten Position, die
  // nach Möglichkeit keine Area/Eingabefelder überdeckt, passend zum
  // Untergrund einfärben. Bei Formaten mit Vorder-/Rückseite erscheint das
  // Logo nur auf der Vorderseite.
  const showLogo = !isTwoSided || activeSide === "front";
  if (showLogo && (logoImages?.black || logoImages?.white)) {
    const refImg = logoImages.black ?? logoImages.white!;
    const logoW = innerW * LOGO_WIDTH_RATIO;
    const logoH = logoW * (refImg.height / refImg.width);

    const candidates = getLogoZones(format);
    const freeCandidates = candidates.filter((anchor) => {
      const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);
      return !exclusionRects.some((a) => rectsOverlap(x, y, logoW, logoH, a.x, a.y, a.w, a.h));
    });
    const zones = freeCandidates.length > 0 ? freeCandidates : candidates;
    const anchor = zones[Math.floor(rng() * zones.length)];
    const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);

    const brightness = sampleBrightness(p5, x, y, logoW, logoH);
    const logoImg = brightness > 140 ? logoImages.black ?? logoImages.white : logoImages.white ?? logoImages.black;

    if (logoImg) {
      p5.imageMode(p5.CORNER);
      p5.image(logoImg, x, y, logoW, logoH);
    }
  }
}
