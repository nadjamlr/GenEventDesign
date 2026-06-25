import type p5Types from "p5";
import { getLogoZones, getAnchorBox } from "@/lib/logoPlacement";
import type { AreaDef } from "@/lib/areas";
import { getInputFields, getInputLayout } from "@/lib/inputFields";
import { hasSides, type Side } from "@/lib/formats";
import { getTextStyle } from "@/lib/textStyles";

export type ShapeImageProvider = {
  isReady: (id: string) => boolean;
  /** targetSize = gewünschte Anzeigegröße in px, damit große Shapes scharf gerastert werden. */
  getImage: (id: string, colorHex: string, targetSize?: number) => p5Types.Image | undefined;
};

export type LogoVariantImages = {
  black?: p5Types.Image;
  white?: p5Types.Image;
};

export type LogoVariant = "logo" | "icon";
export type LogoMode = "random" | LogoVariant;

export type LogoImages = {
  logo?: LogoVariantImages;
  icon?: LogoVariantImages;
};

export type AreaImageProvider = {
  getImage: (area: AreaDef, w: number, h: number) => p5Types.Image | undefined;
};

type Params = {
  columns: number;
  rows: number;
  selectedShapes?: string[];
  selectedColors?: string[];
  shapeImages?: ShapeImageProvider;
  seed?: number;
  format?: string;
  logoImages?: LogoImages;
  logoEnabled?: boolean;
  logoMode?: LogoMode;
  areas?: AreaDef[];
  areaImages?: AreaImageProvider;
  inputValues?: Record<string, string>;
  side?: Side;
  /** Liefert die geladene Inter-Variante für den gewünschten Font-Weight, falls vorhanden. */
  fontProvider?: (weight: number) => p5Types.Font | undefined;
  /**
   * Animations-Phase im Bereich [0,1). Bei phase 0/1 ist das Bild identisch zum
   * statischen Stand (nahtlose Schleife). Ist `time` undefined, wird keine
   * Bewegung berechnet – die Ausgabe bleibt exakt wie bisher.
   */
  time?: number;
};

const BLEED_RATIO = 0.18; // wie weit Elemente über den Rand hinausragen dürfen
const FALLBACK_COLOR = "#2F00FF"; // primary-color, falls keine Farbe ausgewählt ist
const LOGO_WIDTH_RATIO = 0.28; // Logo-Breite relativ zur Rahmenbreite
const PADDING_RATIO = 0.06; // Abstand zum Rahmenrand relativ zur Rahmenbreite
const POSITIONED_FIELD_WIDTH_RATIO = 0.35; // Breite eines einzeln positionierten Feldes
const POSITIONED_FIELD_HEIGHT_RATIO = 0.08; // Höhe eines einzeln positionierten Feldes
const MIN_GAP_RATIO = 0.8; // Mindestabstand zwischen Mittelpunkten, relativ zur Summe der halben Größen – kleiner erlaubt mehr Überlappung (Tiefe), größer verhindert sie stärker
const MAX_PLACEMENT_ATTEMPTS = 24; // Versuche pro Element, eine Position mit genug Abstand zu Nachbarn zu finden

// Bewegungs-Amplituden für die Animation, relativ zur Elementgröße (baseUnit)
// bzw. als absolute Faktoren. Bewusst dezent, damit die Komposition ruhig wirkt.
const MOTION_DRIFT = 0.5; // Positions-Drift relativ zu baseUnit
const MOTION_PULSE = 0.45; // max. Größen-Pulsieren
const MOTION_ROT = Math.PI / 3; // max. Rotations-Wackeln um die Basis-Rotation
const TAU = Math.PI * 2;

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

// Eigenes, seed-gekoppeltes Value-Noise (glatt, deterministisch). Bewusst
// unabhängig von p5.noise, da das in dieser p5-Version (2.x) anders/instabil
// ist (z.B. fehlt noiseSeed).
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1013904223) | 0;
  h = (Math.imul(h ^ (h >>> 13), 1274126177)) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296; // [0,1)
}

function valNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const u = smoothstep(xf);
  const w = smoothstep(yf);
  const a = v00 + (v10 - v00) * u;
  const b = v01 + (v11 - v01) * u;
  return a + (b - a) * w; // [0,1)
}

// Value-Noise-Wert, der über eine volle Loop-Phase (0..1) nahtlos zum
// Startwert zurückkehrt (Sampling entlang eines Kreises) und bei phase 0/1
// exakt 0 liefert – so bleibt das statische Bild bei time=0/undefined
// unverändert und die Animation läuft endlos ohne sichtbaren Sprung.
function loopDelta(seed: number, bx: number, by: number, phase: number, radius = 0.6): number {
  const v = valNoise(bx + radius * Math.cos(TAU * phase), by + radius * Math.sin(TAU * phase), seed);
  const v0 = valNoise(bx + radius, by, seed); // phase 0: cos=1, sin=0
  return v - v0;
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

// Schlüssel für ein räumliches Hash-Grid, mit dem sich überlappende Nachbarn
// bei der Shape-Platzierung ohne O(n²)-Vergleich gegen alle bisher
// platzierten Elemente finden lassen.
function cellKey(ix: number, iy: number): string {
  return `${ix},${iy}`;
}

type Instance = {
  idx: number;
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

// Neutrale Schriftfarbe passend zum Untergrund: schwarz/weiß für klar
// helle/dunkle Bereiche, grau für mittlere Helligkeiten (z.B. bunte oder
// gemischte Untergründe, auf denen reines Schwarz/Weiß zu hart wirkt).
function pickTextColor(brightness: number): string {
  if (brightness > 170) return "#000000";
  if (brightness < 85) return "#ffffff";
  return "#808080";
}

// Hier schreibst du deinen Algorithmus.
// p5 ist die p5.js Instanz, params kommen aus dem Store.
export function drawGrid(p5: p5Types, params: Params) {
  const {
    columns,
    rows,
    selectedShapes = [],
    selectedColors = [],
    shapeImages,
    seed: seedParam = 0,
    format = "",
    logoImages,
    logoEnabled = true,
    logoMode = "random",
    areas = [],
    areaImages,
    inputValues = {},
    side,
    fontProvider,
    time,
  } = params;

  // Animation: phase in [0,1), bei time=undefined keine Bewegung.
  const animate = time !== undefined;
  const phase = animate ? (((time as number) % 1) + 1) % 1 : 0;

  const isTwoSided = hasSides(format);
  const activeSide: Side | undefined = isTwoSided ? side ?? "front" : undefined;

  // Setzt Größe + Font-Weight (Inter, siehe lib/fonts.ts) für die übergebene
  // Text-Rolle (siehe lib/textStyles.ts) und liefert die Basis-Schriftgröße
  // multipliziert mit der Rollen-Größe zurück.
  function applyTextStyle(styleName: Parameters<typeof getTextStyle>[0], baseSize: number): number {
    const style = getTextStyle(styleName);
    const font = fontProvider?.(style.weight);
    if (font) p5.textFont(font);
    return baseSize * style.sizeMultiplier;
  }

  const availableShapes = shapeImages
    ? selectedShapes.filter((id) => shapeImages.isReady(id))
    : [];

  const seed = hashString(
    `${seedParam}|${activeSide ?? ""}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(
      ","
    )}|${areas.map((a) => a.id).join(",")}`
  );
  const rng = createRng(seed);

  // Eigener, von der Seite unabhängiger Seed für die Rotation, damit Vorder-
  // und Rückseite immer gleich gedreht sind, auch wenn der Rest der
  // Komposition (Streuung, Farben, Logo) sich pro Seite unterscheidet.
  const sharedSeed = hashString(
    `${seedParam}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(",")}|${areas
      .map((a) => a.id)
      .join(",")}`
  );
  const sharedRng = createRng(sharedSeed);

  // Hintergrund: bei jeder Generierung zufällig eine der ausgewählten Farben.
  const bgColorHex = selectedColors.length > 0
    ? selectedColors[Math.floor(rng() * selectedColors.length)]
    : "#ffffff";
  p5.background(bgColorHex);

  const innerX = 0;
  const innerY = 0;
  const innerW = p5.width;
  const innerH = p5.height;
  const padding = innerW * PADDING_RATIO;

  // Feste Areas (Text/Bild) bleiben von den generativen Shapes frei.
  const resolvedAreas = areas.map((area) => {
    const w = innerW * area.widthRatio;
    const h = innerH * area.heightRatio;
    const { x, y } = getAnchorBox(area.anchor, innerX, innerY, innerW, innerH, w, h, padding);
    return { area, x, y, w, h };
  });

  // Eingabefelder aus der Sidebar (z.B. Name/Position/Adresse bei der Business
  // Card) – nur ausgefüllte bzw. feste Werte werden gezeichnet, leere Felder
  // fallen weg. Bei Formaten mit Vorder-/Rückseite werden nur die Felder der
  // aktuell aktiven Seite berücksichtigt. Felder mit eigener "position"
  // (z.B. Website/Label) werden einzeln an ihrem Anker gezeichnet, der Rest
  // gemeinsam im Input-Textblock (siehe FORMAT_INPUT_LAYOUT) gestapelt.
  const inputFieldDefs = getInputFields(format, activeSide);
  const positionedFields = inputFieldDefs.filter((field) => field.position);
  const stackedFields = inputFieldDefs.filter((field) => !field.position);

  const resolvedPositionedFields = positionedFields
    .map((field) => {
      const text = field.locked ? field.defaultValue : inputValues[field.key];
      if (!text || text.trim() === "") return undefined;
      const w = innerW * POSITIONED_FIELD_WIDTH_RATIO;
      const h = innerH * POSITIONED_FIELD_HEIGHT_RATIO;
      const { x, y } = getAnchorBox(field.position!.anchor, innerX, innerY, innerW, innerH, w, h, padding);
      return { field, text, x, y, w, h };
    })
    .filter((v): v is NonNullable<typeof v> => !!v);

  const inputLines = stackedFields
    .map((field) => ({
      text: field.locked ? field.defaultValue : inputValues[field.key],
      style: field.style,
    }))
    .filter(
      (line): line is { text: string; style: typeof line.style } => !!line.text && line.text.trim() !== ""
    );
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

  // Ausschlusszone für freie Shapes (Areas/Eingabefelder) – das Logo kommt
  // gleich dazu, damit auch hinter dem Logo selbst keine Shape landet.
  const staticExclusionRects = [
    ...resolvedAreas.map(({ x, y, w, h }) => ({ x, y, w, h })),
    ...(inputBox ? [inputBox] : []),
    ...resolvedPositionedFields.map(({ x, y, w, h }) => ({ x, y, w, h })),
  ];

  // Logo-Position wird hier schon bestimmt (statt erst beim Zeichnen ganz
  // unten), damit ihre Box als Ausschlusszone in die Shape-Streuung einfließen
  // kann. Tatsächlich gezeichnet wird das Logo trotzdem erst am Ende, nachdem
  // Untergrund/Shapes/Areas/Text fertig sind (für die Kontrastfarbe).
  const showLogo = !isTwoSided || activeSide === "front";
  const logoVariant: LogoVariant = logoMode === "random" ? (rng() < 0.5 ? "logo" : "icon") : logoMode;
  const logoVariantImages = logoImages?.[logoVariant];
  const logoHasImage = !!(logoVariantImages && (logoVariantImages.black || logoVariantImages.white));

  let logoBox: { x: number; y: number; w: number; h: number } | undefined;
  if (showLogo && logoEnabled && logoHasImage) {
    const refImg = logoVariantImages!.black ?? logoVariantImages!.white!;
    const logoW = innerW * LOGO_WIDTH_RATIO;
    const logoH = logoW * (refImg.height / refImg.width);

    const candidates = getLogoZones(format);
    const freeCandidates = candidates.filter((anchor) => {
      const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);
      return !staticExclusionRects.some((a) => rectsOverlap(x, y, logoW, logoH, a.x, a.y, a.w, a.h));
    });
    const zones = freeCandidates.length > 0 ? freeCandidates : candidates;
    const anchor = zones[Math.floor(rng() * zones.length)];
    const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);
    logoBox = { x, y, w: logoW, h: logoH };
  }

  const exclusionRects = [...staticExclusionRects, ...(logoBox ? [logoBox] : [])];

  // Eine gemeinsame Rotation für die ganze Komposition, in 45°-Schritten –
  // alle Elemente zeigen einheitlich in dieselbe Richtung (und identisch auf
  // Vorder- und Rückseite, da sharedRng seitenunabhängig ist).
  const angleStep = Math.floor(sharedRng() * 8) * (Math.PI / 4);

  // Spalten/Zeilen-Regler steuern jetzt die Dichte der frei gestreuten
  // Elemente statt fixer Zellen.
  const count = Math.max(1, columns * rows);
  const baseUnit = Math.sqrt((innerW * innerH) / count);
  const bleedX = innerW * BLEED_RATIO;
  const bleedY = innerH * BLEED_RATIO;

  // Größe jedes Elements vorab bestimmen, damit die Platzierung anschließend
  // größte Elemente zuerst versuchen kann – sie bekommen die erste Wahl an
  // freiem Platz, kleinere füllen danach die Lücken. So verteilt sich die
  // Streuung gleichmäßiger, als wenn ein großes Element zufällig erst spät
  // (und dann oft gar nicht mehr) einen Platz fände.
  const candidates = Array.from({ length: count }, (_, i) => {
    // rng()**2 bevorzugt kleinere Elemente, mit gelegentlichen großen
    // Ausreißern – organischer als eine Gleichverteilung.
    const scale = 0.5 + rng() ** 2 * 2.5;
    return { idx: i, size: baseUnit * scale };
  }).sort((a, b) => b.size - a.size);

  // Räumliches Hash-Grid für die Nachbarsuche: Zellgröße deckt die
  // größtmögliche Paarung ab, damit ein 3x3-Block um die Kandidaten-Zelle
  // garantiert alle relevanten Nachbarn enthält.
  const cellSize = Math.max(1, candidates[0]?.size ?? baseUnit);
  const grid = new Map<string, Instance[]>();

  function neighborsTooClose(cx: number, cy: number, size: number): boolean {
    const ix = Math.floor(cx / cellSize);
    const iy = Math.floor(cy / cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = grid.get(cellKey(ix + dx, iy + dy));
        if (!bucket) continue;
        for (const other of bucket) {
          const minDist = ((size + other.size) / 2) * MIN_GAP_RATIO;
          const ddx = cx - other.cx;
          const ddy = cy - other.cy;
          if (ddx * ddx + ddy * ddy < minDist * minDist) return true;
        }
      }
    }
    return false;
  }

  // Pro Element mehrere Kandidaten-Positionen ausprobieren und nur eine
  // annehmen, die zu bereits platzierten Elementen genug Abstand hält. Etwas
  // Überlappung bleibt erlaubt (siehe MIN_GAP_RATIO) für die gewollte
  // Tiefenwirkung beim Stapeln; findet sich nach den Versuchen keine Position,
  // entfällt das Element (wie zuvor bei Überlappung mit festen Areas).
  const instances: Instance[] = [];
  for (const { idx, size } of candidates) {
    for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      const cx = innerX - bleedX + rng() * (innerW + bleedX * 2);
      const cy = innerY - bleedY + rng() * (innerH + bleedY * 2);

      const intersectsArea = exclusionRects.some(({ x, y, w, h }) =>
        rectsOverlap(cx - size / 2, cy - size / 2, size, size, x, y, w, h)
      );
      if (intersectsArea) continue;
      if (neighborsTooClose(cx, cy, size)) continue;

      const inst: Instance = {
        idx,
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
      };
      instances.push(inst);
      const key = cellKey(Math.floor(cx / cellSize), Math.floor(cy / cellSize));
      const bucket = grid.get(key);
      if (bucket) bucket.push(inst);
      else grid.set(key, [inst]);
      break;
    }
  }

  // `candidates` ist bereits absteigend nach Größe sortiert, `instances`
  // erbt diese Reihenfolge: größere Elemente liegen unten, kleinere obenauf –
  // das sorgt für Tiefe in den verbliebenen Überlappungen statt zufälligem
  // Gewusel.

  for (const inst of instances) {
    let { cx, cy, size } = inst;
    let rot = angleStep;

    // Pro Element eine eigene, über die Loop-Phase nahtlose Bewegung. Die
    // stabile Generierungs-Id (inst.idx) sorgt dafür, dass jedes Element über
    // die Frames hinweg konsistent driftet/pulsiert.
    if (animate) {
      const k = inst.idx * 1.7;
      cx += loopDelta(seed, k, 11.3, phase) * baseUnit * MOTION_DRIFT;
      cy += loopDelta(seed, k + 50, 23.7, phase) * baseUnit * MOTION_DRIFT;
      size *= 1 + loopDelta(seed, k + 99, 7.1, phase) * MOTION_PULSE;
      rot += loopDelta(seed, k + 200, 3.3, phase) * MOTION_ROT;
    }

    const img =
      inst.shapeId && shapeImages
        ? shapeImages.getImage(inst.shapeId, inst.colorHex, size)
        : undefined;

    p5.push();
    p5.translate(cx, cy);
    p5.rotate(rot);

    if (img) {
      const fit = Math.min(size / img.width, size / img.height);
      p5.imageMode(p5.CENTER);
      p5.image(img, 0, 0, img.width * fit, img.height * fit);
    } else {
      p5.noStroke();
      p5.fill(inst.colorHex);
      p5.ellipse(0, 0, size, size);
    }

    p5.pop();
  }

  // Feste Areas zeichnen: Text passend zum Untergrund einfärben, Bilder als
  // durch die gewählte Shape maskiertes Motiv (stark hochskaliert).
  for (const { area, x, y, w, h } of resolvedAreas) {
    if (area.kind === "text") {
      const brightness = sampleBrightness(p5, x, y, w, h);
      p5.noStroke();
      p5.fill(pickTextColor(brightness));
      p5.textAlign(p5.CENTER, p5.CENTER);
      p5.textSize(applyTextStyle("p1", Math.min(w, h) * 0.16));
      p5.text(area.text ?? "", x + w / 2, y + h / 2, w, h);
    } else if (area.kind === "image" && areaImages) {
      const img = areaImages.getImage(area, w, h);
      if (img) {
        p5.imageMode(p5.CORNER);
        p5.image(img, x, y, w, h);
      }
    }
  }

  // Einzeln positionierte Eingabefelder (z.B. Website/Label) an ihrem
  // jeweils festen Anker zeichnen, passend zum Untergrund einfärben.
  for (const { field, text, x, y, w, h } of resolvedPositionedFields) {
    const brightness = sampleBrightness(p5, x, y, w, h);
    p5.noStroke();
    p5.fill(pickTextColor(brightness));
    const align = field.position!.align ?? "left";
    const alignX = align === "left" ? p5.LEFT : align === "right" ? p5.RIGHT : p5.CENTER;
    p5.textAlign(alignX, p5.CENTER);
    const baseSize = Math.min(h * 0.6, w * 0.09);
    p5.textSize(applyTextStyle(field.style, baseSize));
    const tx = align === "left" ? x : align === "right" ? x + w : x + w / 2;
    p5.text(text, tx, y + h / 2);
  }

  // Eingabefelder als Textblock zeichnen, passend zum Untergrund einfärben.
  if (inputBox && inputLines.length > 0) {
    const { x, y, w, h } = inputBox;
    const brightness = sampleBrightness(p5, x, y, w, h);
    p5.noStroke();
    p5.fill(pickTextColor(brightness));

    const lineHeight = h / inputLines.length;
    const baseSize = Math.min(lineHeight * 0.6, w * 0.09);
    const alignX =
      inputLayout.align === "left" ? p5.LEFT : inputLayout.align === "right" ? p5.RIGHT : p5.CENTER;
    p5.textAlign(alignX, p5.CENTER);
    const tx = inputLayout.align === "left" ? x : inputLayout.align === "right" ? x + w : x + w / 2;
    inputLines.forEach((line, i) => {
      p5.textSize(applyTextStyle(line.style, baseSize));
      p5.text(line.text, tx, y + lineHeight * (i + 0.5));
    });
  }

  // Logo zuletzt zeichnen (Position wurde oben schon bestimmt, damit Shapes
  // sie als Ausschlusszone kennen), passend zum bisherigen Untergrund
  // einfärben.
  if (logoBox) {
    const { x, y, w: logoW, h: logoH } = logoBox;
    const brightness = sampleBrightness(p5, x, y, logoW, logoH);
    const logoImg =
      brightness > 140
        ? logoVariantImages!.black ?? logoVariantImages!.white
        : logoVariantImages!.white ?? logoVariantImages!.black;

    if (logoImg) {
      p5.imageMode(p5.CORNER);
      p5.image(logoImg, x, y, logoW, logoH);
    }
  }
}
