import type p5Types from "p5";
import { getLogoZones, getAnchorBox } from "@/lib/logoPlacement";
import type { AreaDef } from "@/lib/areas";
import { getInputFields, getInputLayout, type InputFieldDef } from "@/lib/inputFields";
import { hasSides, type Side } from "@/lib/formats";
import { getTextStyle } from "@/lib/textStyles";
import { getTextColor, type TextColorName } from "@/lib/textColors";

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
  /** Bild "cover"-skaliert auf w×h, ohne Shape-Maske – für Hintergrund-Areas. */
  getBackgroundImage: (area: AreaDef, w: number, h: number) => p5Types.Image | undefined;
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
// bzw. als absolute Faktoren.
const MOTION_DRIFT = 0.45; // organische Eigen-Bewegung pro Element, relativ zu baseUnit
const MOTION_PULSE = 0.5; // max. Größen-Pulsieren
const MOTION_ROT_WOBBLE = Math.PI / 12; // kleines organisches Wackeln zusätzlich zur Haupt-Rotation
const SWAY_AMOUNT = 0.3; // gemeinsames Schwingen der ganzen Komposition (Lissajous-Bahn), relativ zu baseUnit
const SPIN_BASE = 2; // Basiswert für die größenabhängige Umdrehungszahl – kleinere Elemente drehen schneller (Parallaxe/Tiefenwirkung)
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
  /** Basis-Rotation dieser Shape; ohne Angabe gilt die gemeinsame angleStep. */
  baseRot?: number;
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

// Farbrolle eines Eingabefeldes (siehe lib/textColors.ts) in eine konkrete
// Füllfarbe übersetzen: "default" wie bisher die passende Kontrastfarbe,
// "grey" dieselbe schwarz/weiße Kontrastfarbe, aber abgeschwächt (Alpha) –
// für untergeordnete Felder (z.B. Adresse), die sich von der Haupt-Info
// abheben sollen, ohne die mittlere Graustufe von pickTextColor zu nutzen.
function resolveFieldTextColor(brightness: number, color?: TextColorName): string {
  if ((color ?? "default") === "default") return pickTextColor(brightness);
  const { alpha } = getTextColor(color);
  const base = brightness > 127 ? 0 : 255;
  return `rgba(${base}, ${base}, ${base}, ${alpha})`;
}

// Anzuzeigender Text eines Eingabefeldes: bei locked-Feldern immer der feste
// Wert. Bei editierbaren Feldern der eingegebene Wert – ist noch nichts
// eingegeben, wird (falls vorhanden) der defaultValue als Vorbelegung
// angezeigt, statt das Feld leer zu lassen (z.B. Adresse/"P:"-Label, die
// schon mit einem sinnvollen Wert vorbelegt sind).
function resolveFieldText(field: InputFieldDef, inputValues: Record<string, string>): string | undefined {
  if (field.locked) return field.defaultValue;
  const typed = inputValues[field.key];
  return typed && typed.trim() !== "" ? typed : field.defaultValue;
}

export type ResolvedArea = { area: AreaDef; x: number; y: number; w: number; h: number };

// Berechnet Position & Größe aller frei platzierten Areas (Text/Bild, ohne
// "background") innerhalb eines innerW×innerH-Rahmens. Wird sowohl beim
// Zeichnen (drawGrid) als auch fürs Drag&Drop-Hit-Testing auf der Canvas
// verwendet, damit beide exakt dieselben Boxen ergeben.
export function resolveOverlayAreas(areas: AreaDef[], innerW: number, innerH: number): ResolvedArea[] {
  const padding = innerW * PADDING_RATIO;
  const overlayAreas = areas.filter(
    (a): a is AreaDef & { anchor: Exclude<AreaDef["anchor"], "background"> } => a.anchor !== "background"
  );
  return overlayAreas.map((area) => {
    const isUnmaskedImage = area.kind === "image" && !area.shapeId;
    const squareSide = Math.min(innerW, innerH) * area.widthRatio;
    const w = isUnmaskedImage ? squareSide : innerW * area.widthRatio;
    const h = isUnmaskedImage ? squareSide : innerH * area.heightRatio;
    let x: number;
    let y: number;
    if (area.x !== undefined && area.y !== undefined) {
      x = area.x * innerW;
      y = area.y * innerH;
    } else {
      ({ x, y } = getAnchorBox(area.anchor, 0, 0, innerW, innerH, w, h, padding));
    }
    return { area, x, y, w, h };
  });
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
    // textFont() setzt nur die Font-Family (alle Weight-Varianten teilen denselben
    // Namen, z.B. "Poppins") – das tatsächliche Render-Gewicht ist ein eigener,
    // unabhängiger State und muss separat gesetzt werden, sonst bleibt es immer
    // beim zuletzt gesetzten bzw. dem Default-Gewicht.
    p5.textWeight(style.weight);
    const finalSize = baseSize * style.sizeMultiplier;
    // Buchstabenabstand in px statt em setzen, damit er unabhängig davon korrekt
    // ist, ob die Canvas-Engine ihn vor oder nach dem folgenden textSize()-Aufruf
    // auswertet (em wäre relativ zur jeweils *aktuellen* Schriftgröße).
    // Auf 3 Nachkommastellen runden und nicht-endliche Werte überspringen:
    // Chrome normalisiert letterSpacing auf diese Präzision; ein unrunder Wert
    // (Float-Rest oder NaN) weicht beim Zurücklesen minimal ab, worauf p5
    // fälschlich "Unable to set 'letterSpacing' ... not supported" meldet.
    const letterSpacingPx = (style.letterSpacing ?? 0) * finalSize;
    if (Number.isFinite(letterSpacingPx)) {
      p5.textProperty("letterSpacing", `${Math.round(letterSpacingPx * 1000) / 1000}px`);
    }
    return finalSize;
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

  // Hintergrund-Bild-Area (anchor === "background"): füllt den kompletten
  // Rahmen und wird vor den Shapes gezeichnet. Die letzte gewinnt, falls
  // mehrere existieren. Alle übrigen Areas werden normal platziert.
  const backgroundArea = areas
    .filter((a) => a.kind === "image" && a.anchor === "background")
    .pop();

  if (backgroundArea && areaImages) {
    const bgImg = areaImages.getBackgroundImage(backgroundArea, innerW, innerH);
    if (bgImg) {
      p5.imageMode(p5.CORNER);
      p5.image(bgImg, innerX, innerY, innerW, innerH);
    }
  }

  // Feste Areas (Text/Bild) bleiben von den generativen Shapes frei.
  const resolvedAreas = resolveOverlayAreas(areas, innerW, innerH);

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
      const text = resolveFieldText(field, inputValues);
      if (!text || text.trim() === "") return undefined;
      const pos = field.position!;
      const w = innerW * (pos.widthRatio ?? POSITIONED_FIELD_WIDTH_RATIO);
      const h = innerH * (pos.heightRatio ?? POSITIONED_FIELD_HEIGHT_RATIO);
      const x = innerX + pos.x * innerW;
      const y = innerY + pos.y * innerH;
      return { field, text, x, y, w, h };
    })
    .filter((v): v is NonNullable<typeof v> => !!v);

  const inputLines = stackedFields
    .map((field) => ({
      text: resolveFieldText(field, inputValues),
      style: field.style,
      color: field.color,
    }))
    .filter(
      (line): line is { text: string; style: typeof line.style; color: typeof line.color } =>
        !!line.text && line.text.trim() !== ""
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

  // Spalten/Zeilen steuern die Gesamtdichte; baseUnit ist die typische
  // Elementgröße, abgeleitet aus Fläche / Anzahl.
  const count = Math.max(1, columns * rows);
  const baseUnit = Math.sqrt((innerW * innerH) / count);
  const bleedX = innerW * BLEED_RATIO;
  const bleedY = innerH * BLEED_RATIO;

  // Gemeinsame Helfer für alle Anordnungen.
  const pickShape = () =>
    availableShapes.length > 0 ? availableShapes[Math.floor(rng() * availableShapes.length)] : undefined;
  // Kontrastregel: Shapes nie in der Hintergrundfarbe einfärben (sonst gehen sie
  // im Untergrund unter). Nur wenn dadurch keine Farbe übrig bliebe (z.B. genau
  // eine Farbe ausgewählt, die zugleich Hintergrund ist), auf die volle Palette
  // bzw. die Primärfarbe zurückfallen.
  const shapeColorPool = selectedColors.filter((c) => c !== bgColorHex);
  const colorPool = shapeColorPool.length > 0 ? shapeColorPool : selectedColors;
  const pickColor = () =>
    colorPool.length > 0 ? colorPool[Math.floor(rng() * colorPool.length)] : FALLBACK_COLOR;
  const intersectsExclusion = (cx: number, cy: number, size: number) =>
    exclusionRects.some(({ x, y, w, h }) =>
      rectsOverlap(cx - size / 2, cy - size / 2, size, size, x, y, w, h)
    );
  const inBleed = (cx: number, cy: number) =>
    cx >= innerX - bleedX &&
    cx <= innerX + innerW + bleedX &&
    cy >= innerY - bleedY &&
    cy <= innerY + innerH + bleedY;

  // --- Anordnung 1: organische Streuung (Standard) ---
  // Größte Elemente zuerst platzieren (erste Wahl an freiem Platz), Nachbar-
  // Abstand über ein räumliches Hash-Grid prüfen. Etwas Überlappung bleibt
  // erlaubt (MIN_GAP_RATIO) für die gewollte Tiefenwirkung.
  function placeScatter(): Instance[] {
    const candidates = Array.from({ length: count }, (_, i) => {
      const scale = 0.5 + rng() ** 2 * 2.5;
      return { idx: i, size: baseUnit * scale };
    }).sort((a, b) => b.size - a.size);

    const cellSize = Math.max(1, candidates[0]?.size ?? baseUnit);
    const grid = new Map<string, Instance[]>();
    const neighborsTooClose = (cx: number, cy: number, size: number): boolean => {
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
    };

    const result: Instance[] = [];
    for (const { idx, size } of candidates) {
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        const cx = innerX - bleedX + rng() * (innerW + bleedX * 2);
        const cy = innerY - bleedY + rng() * (innerH + bleedY * 2);
        if (intersectsExclusion(cx, cy, size)) continue;
        if (neighborsTooClose(cx, cy, size)) continue;
        const inst: Instance = { idx, cx, cy, size, shapeId: pickShape(), colorHex: pickColor() };
        result.push(inst);
        const key = cellKey(Math.floor(cx / cellSize), Math.floor(cy / cellSize));
        const bucket = grid.get(key);
        if (bucket) bucket.push(inst);
        else grid.set(key, [inst]);
        break;
      }
    }
    return result;
  }

  // --- Anordnung 2: regelmäßiges Raster (Truchet) ---
  // Eine Shape pro Zelle, kantenbündig, mit zufälliger 90°-Drehung – die
  // Shapes verbinden sich zu durchgehenden Formen.
  function placeGrid(): Instance[] {
    const cols = Math.max(1, Math.round(columns));
    const rowsCount = Math.max(1, Math.round(rows));
    const cw = innerW / cols;
    const ch = innerH / rowsCount;
    const cell = Math.min(cw, ch);
    const result: Instance[] = [];
    let i = 0;
    for (let r = 0; r < rowsCount; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const y = r * ch;
        if (exclusionRects.some((a) => rectsOverlap(x, y, cw, ch, a.x, a.y, a.w, a.h))) continue;
        result.push({
          idx: i++,
          cx: x + cw / 2,
          cy: y + ch / 2,
          size: cell,
          baseRot: Math.floor(rng() * 4) * (Math.PI / 2),
          shapeId: pickShape(),
          colorHex: pickColor(),
        });
      }
    }
    return result;
  }

  // --- Anordnung 3: konzentrische Ringe (radial) ---
  // Shapes sitzen auf Kreisen um die Mitte und sind tangential ausgerichtet.
  function placeRings(): Instance[] {
    const ccx = innerX + innerW / 2;
    const ccy = innerY + innerH / 2;
    const maxR = Math.hypot(innerW, innerH) / 2;
    const ringCount = Math.max(1, Math.round(Math.sqrt(count)));
    const result: Instance[] = [];
    let i = 0;
    for (let ring = 0; ring < ringCount; ring++) {
      const radius = ((ring + 0.6) / ringCount) * maxR;
      const size = baseUnit * (0.8 + rng() * 0.5);
      const perRing = ring === 0 ? 1 : Math.max(1, Math.round((TAU * radius) / (baseUnit * 1.2)));
      const angleOffset = rng() * TAU;
      for (let j = 0; j < perRing; j++) {
        const a = angleOffset + (j / perRing) * TAU;
        const cx = ccx + Math.cos(a) * radius;
        const cy = ccy + Math.sin(a) * radius;
        if (!inBleed(cx, cy)) continue;
        if (intersectsExclusion(cx, cy, size)) continue;
        result.push({
          idx: i++,
          cx,
          cy,
          size,
          baseRot: Math.round((a + Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4),
          shapeId: pickShape(),
          colorHex: pickColor(),
        });
      }
    }
    return result;
  }

  // --- Anordnung 4: diagonaler Strom ---
  // Shapes entlang paralleler 45°-Linien, in Stromrichtung ausgerichtet.
  function placeDiagonal(): Instance[] {
    const angle = Math.PI / 4;
    const dirx = Math.cos(angle);
    const diry = Math.sin(angle);
    const perpx = -diry;
    const perpy = dirx;
    const lines = Math.max(1, Math.round(Math.sqrt(count)));
    const perLine = Math.max(1, Math.round(count / lines));
    const span = Math.hypot(innerW, innerH);
    const lineSpacing = span / lines;
    const stepAlong = span / perLine;
    const ccx = innerX + innerW / 2;
    const ccy = innerY + innerH / 2;
    const result: Instance[] = [];
    let i = 0;
    for (let l = 0; l < lines; l++) {
      const sOff = (l + 0.5 - lines / 2) * lineSpacing + (rng() - 0.5) * lineSpacing * 0.3;
      for (let t = 0; t < perLine; t++) {
        const size = baseUnit * (0.8 + rng() * 0.5);
        const tOff = (t + 0.5 - perLine / 2) * stepAlong + (rng() - 0.5) * stepAlong * 0.2;
        const cx = ccx + dirx * tOff + perpx * sOff;
        const cy = ccy + diry * tOff + perpy * sOff;
        if (!inBleed(cx, cy)) continue;
        if (intersectsExclusion(cx, cy, size)) continue;
        result.push({ idx: i++, cx, cy, size, baseRot: angle, shapeId: pickShape(), colorHex: pickColor() });
      }
    }
    return result;
  }

  // --- Anordnung 6: Welle ---
  // Horizontale Reihen, deren Höhe per Sinus über die Breite schwingt; die
  // Shapes folgen der lokalen Steigung der Welle.
  function placeWave(): Instance[] {
    const rowsN = Math.max(1, Math.round(Math.sqrt(count)));
    const perRow = Math.max(1, Math.round(count / rowsN));
    const amp = (innerH / rowsN) * 0.6;
    const freq = 1 + Math.floor(rng() * 2);
    const phase0 = rng() * TAU;
    const result: Instance[] = [];
    let i = 0;
    for (let r = 0; r < rowsN; r++) {
      const baseY = innerY + ((r + 0.5) / rowsN) * innerH;
      for (let c = 0; c < perRow; c++) {
        const fx = (c + 0.5) / perRow;
        const theta = phase0 + fx * TAU * freq + r * 0.6;
        const cx = innerX + fx * innerW;
        const cy = baseY + Math.sin(theta) * amp;
        const size = baseUnit * (0.8 + rng() * 0.4);
        if (!inBleed(cx, cy)) continue;
        if (intersectsExclusion(cx, cy, size)) continue;
        const slope = (Math.cos(theta) * amp * TAU * freq) / innerW;
        result.push({
          idx: i++,
          cx,
          cy,
          size,
          baseRot: Math.round(Math.atan(slope) / (Math.PI / 4)) * (Math.PI / 4),
          shapeId: pickShape(),
          colorHex: pickColor(),
        });
      }
    }
    return result;
  }

  // --- Anordnung 7: Rahmen ---
  // Shapes liegen nur im Randstreifen, die Mitte bleibt frei (gut für zentralen
  // Text/Logo).
  function placeBorder(): Instance[] {
    const band = Math.min(innerW, innerH) * 0.22;
    const result: Instance[] = [];
    let placed = 0;
    for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
      const size = baseUnit * (0.7 + rng() * 0.6);
      const cx = innerX - bleedX + rng() * (innerW + bleedX * 2);
      const cy = innerY - bleedY + rng() * (innerH + bleedY * 2);
      const minEdge = Math.min(cx - innerX, innerX + innerW - cx, cy - innerY, innerY + innerH - cy);
      if (minEdge > band) continue; // zu zentral
      if (intersectsExclusion(cx, cy, size)) continue;
      result.push({ idx: placed++, cx, cy, size, shapeId: pickShape(), colorHex: pickColor() });
    }
    return result;
  }

  // Anordnung pro Shuffle auswürfeln: seedabhängig und seitenunabhängig (nur
  // seedParam), damit jede Generierung zufällig zwischen den Stilen wechselt
  // und Vorder-/Rückseite dieselbe Anordnung teilen.
  const ARRANGEMENTS = [
    "scatter",
    "grid",
    "rings",
    "diagonal",
    "wave",
    "border",
  ] as const;
  const arrangement = ARRANGEMENTS[Math.abs(hashString(`arrangement|${seedParam}`)) % ARRANGEMENTS.length];
  const placers: Record<(typeof ARRANGEMENTS)[number], () => Instance[]> = {
    scatter: placeScatter,
    grid: placeGrid,
    rings: placeRings,
    diagonal: placeDiagonal,
    wave: placeWave,
    border: placeBorder,
  };
  const instances = (placers[arrangement] ?? placeScatter)();

  // `candidates` ist bereits absteigend nach Größe sortiert, `instances`
  // erbt diese Reihenfolge: größere Elemente liegen unten, kleinere obenauf –
  // das sorgt für Tiefe in den verbliebenen Überlappungen statt zufälligem
  // Gewusel.

  for (const inst of instances) {
    let { cx, cy, size } = inst;
    let rot = inst.baseRot ?? angleStep;

    // Pro Element eine eigene, über die Loop-Phase nahtlose Bewegung. Die
    // stabile Generierungs-Id (inst.idx) sorgt dafür, dass jedes Element über
    // die Frames hinweg konsistent driftet/pulsiert.
    if (animate) {
      const k = inst.idx * 1.7;

      // Gemeinsames Schwingen der ganzen Komposition auf einer Lissajous-Bahn
      // (x mit einfacher, y mit doppelter Frequenz) – alle Elemente bewegen
      // sich zusätzlich im Verbund, statt nur unabhängig voneinander zu
      // wackeln. Beide Komponenten sind bei phase 0 und 1 exakt 0, damit das
      // Loop nahtlos bleibt und der statische Stand unverändert bleibt.
      cx += Math.sin(TAU * phase) * baseUnit * SWAY_AMOUNT;
      cy += Math.sin(TAU * phase * 2) * baseUnit * SWAY_AMOUNT * 0.6;

      // Eigene, über die Loop-Phase nahtlose Restbewegung für organische
      // Varianz zusätzlich zum gemeinsamen Schwingen.
      cx += loopDelta(seed, k, 11.3, phase) * baseUnit * MOTION_DRIFT;
      cy += loopDelta(seed, k + 50, 23.7, phase) * baseUnit * MOTION_DRIFT;
      size *= 1 + loopDelta(seed, k + 99, 7.1, phase) * MOTION_PULSE;

      // Kontinuierliche Rotation statt nur Wackeln: kleinere Elemente drehen
      // sich schneller als große (Parallaxe/Tiefenwirkung). Die Umdrehungszahl
      // ist ganzzahlig, damit die Rotation bei phase=1 wieder exakt auf dem
      // Startwinkel landet (mod 360°) und die Schleife nahtlos bleibt.
      const relSize = inst.size / baseUnit;
      const spins = Math.max(1, Math.round(SPIN_BASE / Math.max(0.4, relSize)));
      const dir = hash2(inst.idx, 77, seed) < 0.5 ? 1 : -1;
      rot += dir * spins * TAU * phase;
      rot += loopDelta(seed, k + 200, 3.3, phase) * MOTION_ROT_WOBBLE;
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
      // Linksbündig statt zentriert: die Box-Kante (= Drag&Drop-Position)
      // entspricht damit direkt der Text-Kante, ohne "Leerraum" durch
      // Zentrierung in einer breiteren Box.
      p5.textAlign(p5.LEFT, p5.CENTER);
      p5.textSize(applyTextStyle("p1", Math.min(w, h) * 0.16));
      p5.text(area.text ?? "", x, y, w, h);
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
    p5.fill(resolveFieldTextColor(brightness, field.color));
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

    const lineHeight = h / inputLines.length;
    const baseSize = Math.min(lineHeight * 0.6, w * 0.09);
    const alignX =
      inputLayout.align === "left" ? p5.LEFT : inputLayout.align === "right" ? p5.RIGHT : p5.CENTER;
    p5.textAlign(alignX, p5.CENTER);
    const tx = inputLayout.align === "left" ? x : inputLayout.align === "right" ? x + w : x + w / 2;
    inputLines.forEach((line, i) => {
      p5.fill(resolveFieldTextColor(brightness, line.color));
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
