import type p5Types from "p5";
import { shapes as ALL_SHAPES, FULL_LOGO_SHAPE_ID, SHAPE_COMBOS } from "@/lib/shapes";
import { getLogoZones, getAnchorBox, ALL_ANCHORS, type LogoAnchor } from "@/lib/logoPlacement";
import type { AreaDef } from "@/lib/areas";
import { getInputFields, getInputLayout, type InputFieldDef } from "@/lib/inputFields";
import { hasSides, type Side } from "@/lib/formats";
import { getTextStyle, DEFAULT_TEXT_STYLE } from "@/lib/textStyles";
import { getTextColor, type TextColorName } from "@/lib/textColors";
import { getShapeMotion, type Motion } from "@/algorithms/shapeAnimation";
import { getFlyInMotion, pickFlyInDirection } from "@/algorithms/shapeFlyIn";

export type ShapeImageProvider = {
  isReady: (id: string) => boolean;
  /**
   * targetSize = gewünschte Anzeigegröße in px, damit große Shapes scharf
   * gerastert werden. `time` = Animations-Phase [0,1): ist sie gesetzt,
   * pulsieren die Punkte im Gitter; undefined = statisches Gitter.
   */
  getImage: (
    id: string,
    colorHex: string,
    targetSize?: number,
    time?: number
  ) => p5Types.Image | undefined;
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
  /** Loop-Länge in Sekunden (aus dem Store) – nötig, um die in shapeFlyIn.ts
   *  fest in Sekunden definierten Zeitfenster (Einfliegen/Halten/Ausfliegen)
   *  in Phasen-Brüche umzurechnen, ohne die Flug-Geschwindigkeit von der
   *  Loop-Länge abhängig zu machen. */
  loopDuration?: number;
};

const BLEED_RATIO = 0.3; // wie weit Elemente über den Rand hinausragen dürfen
const FALLBACK_COLOR = "#000000"; // primary-color, falls keine Farbe ausgewählt ist
const LOGO_WIDTH_RATIO = 0.28; // Logo-Breite relativ zur Rahmenbreite
const PADDING_RATIO = 0.06; // Abstand zum Rahmenrand relativ zur Rahmenbreite
const POSITIONED_FIELD_WIDTH_RATIO = 0.35; // Breite eines einzeln positionierten Feldes
const POSITIONED_FIELD_HEIGHT_RATIO = 0.08; // Höhe eines einzeln positionierten Feldes
const AREA_FONT_RATIO = 0.016; // Basis-Schriftgröße einer Text-Area relativ zur Rahmenhöhe, vor Style-Multiplikator (siehe lib/textStyles.ts)
const AREA_MAX_WIDTH_RATIO = 0.6; // Maximale Breite einer Text-Area relativ zur Rahmenbreite, danach Zeilenumbruch
const AREA_PAD_RATIO = 0.015; // Innenabstand einer Text-Area um den eigentlichen Text, relativ zur Rahmenbreite/-höhe
const IMAGE_SHAPE_BLEED_RATIO = 0.1; // Wie weit Shapes an jeder Seite in eine Bild-Area hineinragen dürfen, relativ zu deren Breite
const MIN_GAP_RATIO = 0.8; // Mindestabstand zwischen Mittelpunkten, relativ zur Summe der halben Größen – kleiner erlaubt mehr Überlappung (Tiefe), größer verhindert sie stärker
const MAX_PLACEMENT_ATTEMPTS = 24; // Versuche pro Element, eine Position mit genug Abstand zu Nachbarn zu finden

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

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Deterministischer Wert [0,1) pro Feldzelle (ix,iy) + Seed.
function fieldHash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Glattes Value-Noise: benachbarte Positionen liefern ähnliche Werte, sodass
// die daraus abgeleitete Rotation über die Fläche fließt statt zu springen.
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const v00 = fieldHash(x0, y0, seed);
  const v10 = fieldHash(x0 + 1, y0, seed);
  const v01 = fieldHash(x0, y0 + 1, seed);
  const v11 = fieldHash(x0 + 1, y0 + 1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return (v00 + (v10 - v00) * u) * (1 - v) + (v01 + (v11 - v01) * u) * v;
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

// Bleed-Rand einer Bild-Area: 10% der Breite horizontal, 10% der Höhe
// vertikal (nicht dieselbe Zahl für beide Achsen – ein hochformatiges Bild
// soll oben/unten nicht denselben Rand wie links/rechts bekommen).
function imageBleedInset(w: number, h: number): { insetX: number; insetY: number } {
  return { insetX: w * IMAGE_SHAPE_BLEED_RATIO, insetY: h * IMAGE_SHAPE_BLEED_RATIO };
}

type Instance = {
  idx: number;
  cx: number;
  cy: number;
  size: number;
  shapeId?: string;
  colorHex: string;
  /** Strukturelle Rotation dieser Shape; ohne Angabe greift das Rotations-Rauschfeld. */
  baseRot?: number;
  /** Nur "wave": Wellenphase, -amplitude und Steigungsfaktor dieses Elements –
   *  damit die Animation die wandernde Welle exakt nachrechnen kann. */
  waveTheta?: number;
  waveAmp?: number;
  waveSlopeK?: number;
  /** Erzwingt eine feste Opazität (Schema "abwechselnd hoch/niedrig"); ohne
   *  Angabe greift das Opazitäts-Rauschfeld (nur im Random-Modus). */
  opacityOverride?: number;
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
  return "#ffffff";
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

// Setzt Größe + Font-Weight (Inter, siehe lib/fonts.ts) für die übergebene
// Text-Rolle (siehe lib/textStyles.ts) und liefert die Basis-Schriftgröße
// multipliziert mit der Rollen-Größe zurück. Eigenständig (statt Closure in
// drawGrid), damit resolveOverlayAreas (Layout-Berechnung, auch fürs
// Drag&Drop-Hit-Testing in Canvas.tsx) dieselbe Logik nutzen kann.
export function applyTextStyle(
  p5: p5Types,
  fontProvider: ((weight: number) => p5Types.Font | undefined) | undefined,
  styleName: Parameters<typeof getTextStyle>[0],
  baseSize: number
): number {
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

// Tatsächliche Text-Ausmaße ermitteln (statt sich auf eine nominale Box zu
// verlassen) – große Rollen wie "title"/"h1" rendern oft deutlich größer als
// eine pauschal angenommene Box. Dient sowohl der Auto-Größe von Text-Areas
// als auch der Ausschlusszone von Eingabefeldern. Bei maxWidth wird die
// Zeilenzahl bei Umbruch geschätzt.
export function measureTextFootprint(
  p5: p5Types,
  fontProvider: ((weight: number) => p5Types.Font | undefined) | undefined,
  text: string,
  styleName: Parameters<typeof getTextStyle>[0],
  baseSize: number,
  maxWidth?: number
): { w: number; h: number } {
  const finalSize = applyTextStyle(p5, fontProvider, styleName, baseSize);
  p5.textSize(finalSize);
  const rawWidth = p5.textWidth(text);
  const leading = p5.textLeading();
  if (maxWidth !== undefined && rawWidth > maxWidth) {
    const lines = Math.max(1, Math.ceil(rawWidth / maxWidth));
    return { w: maxWidth, h: lines * leading };
  }
  return { w: rawWidth, h: leading };
}

export type ResolvedArea = { area: AreaDef; x: number; y: number; w: number; h: number };

// Berechnet Position & Größe aller frei platzierten Areas (Text/Bild, ohne
// "background") innerhalb eines innerW×innerH-Rahmens. Wird sowohl beim
// Zeichnen (drawGrid) als auch fürs Drag&Drop-Hit-Testing auf der Canvas
// verwendet, damit beide exakt dieselben Boxen ergeben.
//
// Text-Areas werden NICHT mehr über eine hand-justierte widthRatio/heightRatio
// dimensioniert, sondern über die tatsächlich gerenderte Text-Größe
// (measureTextFootprint) – das war wiederholt eine Bug-Quelle diese Session
// (z.B. die "title"-Rolle, die ihre nominale Box weit überragte). So bleibt
// die Box immer exakt so groß wie der Text plus etwas Innenabstand, ganz ohne
// Default-Werte, die für jede Text-Rolle/Länge neu hätten passen müssen.
// Bild-Areas behalten ihre ratio-basierte Größe (kein Text zum Messen).
export function resolveOverlayAreas(
  p5: p5Types,
  areas: AreaDef[],
  innerW: number,
  innerH: number,
  fontProvider?: (weight: number) => p5Types.Font | undefined
): ResolvedArea[] {
  const padding = innerW * PADDING_RATIO;
  const overlayAreas = areas.filter(
    (a): a is AreaDef & { anchor: Exclude<AreaDef["anchor"], "background"> } => a.anchor !== "background"
  );
  return overlayAreas.map((area) => {
    let w: number;
    let h: number;
    if (area.kind === "text") {
      const fontBase = innerH * AREA_FONT_RATIO;
      const maxWidth = innerW * AREA_MAX_WIDTH_RATIO;
      const measured = measureTextFootprint(
        p5,
        fontProvider,
        area.text ?? "",
        area.style ?? DEFAULT_TEXT_STYLE,
        fontBase,
        maxWidth
      );
      w = measured.w + innerW * AREA_PAD_RATIO * 2;
      h = measured.h + innerH * AREA_PAD_RATIO * 2;
    } else {
      const isUnmaskedImage = area.kind === "image" && !area.shapeId;
      const squareSide = Math.min(innerW, innerH) * area.widthRatio;
      w = isUnmaskedImage ? squareSide : innerW * area.widthRatio;
      h = isUnmaskedImage ? squareSide : innerH * area.heightRatio;
    }
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
    loopDuration = 9,
  } = params;

  // Animation: phase in [0,1), bei time=undefined keine Bewegung.
  const animate = time !== undefined;
  const phase = animate ? (((time as number) % 1) + 1) % 1 : 0;

  const isTwoSided = hasSides(format);
  const activeSide: Side | undefined = isTwoSided ? side ?? "front" : undefined;

  // Bei zweiseitigen Formaten gehört jede Area zu genau einer Seite (siehe
  // AreaDef.side in lib/areas.ts) – nur die zur gerade gezeichneten Seite
  // passenden Areas werden berücksichtigt, damit ein auf der Rückseite
  // platziertes Bild/Text nicht auch auf der Vorderseite auftaucht.
  const sideAreas = isTwoSided
    ? areas.filter((a) => (a.side ?? "front") === activeSide)
    : areas;

  // Sind ALLE Shapes ausgewählt, wird statt der einzelnen Buchstaben das volle
  // Logo verwendet (als synthetische Shape, gerendert wie alle anderen – also
  // als Punktgitter, mit denselben Anordnungen und Animationen).
  const allShapesSelected =
    ALL_SHAPES.length > 0 && ALL_SHAPES.every((s) => selectedShapes.includes(s.id));
  const availableShapes = shapeImages
    ? allShapesSelected && shapeImages.isReady(FULL_LOGO_SHAPE_ID)
      ? [FULL_LOGO_SHAPE_ID]
      : selectedShapes.filter((id) => shapeImages.isReady(id))
    : [];

  const seed = hashString(
    `${seedParam}|${activeSide ?? ""}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(
      ","
    )}|${sideAreas.map((a) => a.id).join(",")}`
  );
  const rng = createRng(seed);

  // Eigener, von der Seite unabhängiger Seed für die Rotation, damit Vorder-
  // und Rückseite immer gleich gedreht sind, auch wenn der Rest der
  // Komposition (Streuung, Farben, Logo) sich pro Seite unterscheidet.
  const sharedSeed = hashString(
    `${seedParam}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(",")}|${sideAreas
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
  const backgroundArea = sideAreas
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
  const resolvedAreas = resolveOverlayAreas(p5, sideAreas, innerW, innerH, fontProvider);

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

  // Ausschlusszone der Eingabefelder anhand der tatsächlich gerenderten
  // Text-Ausmaße (measureTextFootprint), nicht der nominalen widthRatio/
  // heightRatio – sonst können Shapes in Zonen landen, die der Text in
  // Wirklichkeit überragt. Vertikal bleibt der Box-Mittelpunkt erhalten,
  // sodass ein größerer Footprint die Box symmetrisch nach oben/unten
  // wachsen lässt. Areas brauchen das nicht extra: ihre Box aus
  // resolveOverlayAreas ist bereits exakt auf den Text zugeschnitten.
  const positionedFieldExclusionRects = resolvedPositionedFields.map(({ field, text, x, y, w, h }) => {
    const align = field.position!.align ?? "left";
    const baseSize = Math.min(h * 0.6, w * 0.09);
    const measured = measureTextFootprint(
      p5,
      fontProvider,
      text,
      field.style,
      baseSize,
      field.position!.wrap ? w : undefined
    );
    const boxH = Math.max(h, measured.h);
    const boxW = Math.max(w, measured.w);
    let boxX = x;
    if (measured.w > w) {
      if (align === "center") boxX = x + w / 2 - measured.w / 2;
      else if (align === "right") boxX = x + w - measured.w;
    }
    return { x: boxX, y: y + h / 2 - boxH / 2, w: boxW, h: boxH };
  });

  // Ausschlusszone für freie Shapes (Areas/Eingabefelder) – das Logo kommt
  // gleich dazu, damit auch hinter dem Logo selbst keine Shape landet.
  // Bild-Areas dürfen Shapes an jeder Seite um IMAGE_SHAPE_BLEED_RATIO ihrer
  // Breite/Höhe hineinragen lassen (die Bilder werden dafür vor den Shapes
  // gezeichnet, siehe weiter unten – die Shapes liegen dann sichtbar darüber).
  // Das ist nur eine Platzierungs-Heuristik (vermeidet, dass Shapes mitten im
  // Bild zentriert werden); den tatsächlichen Bleed auf 10% begrenzt erst der
  // Re-Draw des Bild-Kerns NACH den Shapes (siehe dort) – unabhängig davon,
  // wie groß die jeweilige Shape ist. Text-Areas bleiben komplett ausgeschlossen.
  const staticExclusionRects = [
    ...resolvedAreas.map(({ area, x, y, w, h }) => {
      if (area.kind !== "image") return { x, y, w, h };
      const { insetX, insetY } = imageBleedInset(w, h);
      return { x: x + insetX, y: y + insetY, w: w - insetX * 2, h: h - insetY * 2 };
    }),
    ...(inputBox ? [inputBox] : []),
    ...positionedFieldExclusionRects,
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

    const isFree = (anchor: LogoAnchor) => {
      const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);
      return !staticExclusionRects.some((a) => rectsOverlap(x, y, logoW, logoH, a.x, a.y, a.w, a.h));
    };
    const candidates = getLogoZones(format);
    const freeCandidates = candidates.filter(isFree);
    // Sind alle für dieses Format vorgesehenen Zonen durch Areas/Text belegt,
    // notfalls auf eine freie Position aus allen 9 Ankern ausweichen – sonst
    // würde das Logo garantiert über dem Text landen, statt ihm auszuweichen.
    // Nur wenn wirklich nirgendwo Platz ist, doch eine (überlappende)
    // Format-Zone nehmen, damit das Logo nicht ganz verschwindet.
    const zones =
      freeCandidates.length > 0
        ? freeCandidates
        : ALL_ANCHORS.filter(isFree).length > 0
          ? ALL_ANCHORS.filter(isFree)
          : candidates;
    const anchor = zones[Math.floor(rng() * zones.length)];
    const { x, y } = getAnchorBox(anchor, innerX, innerY, innerW, innerH, logoW, logoH, padding);
    logoBox = { x, y, w: logoW, h: logoH };
  }

  // Spalten/Zeilen steuern die Gesamtdichte; baseUnit ist die typische
  // Elementgröße, abgeleitet aus Fläche / Anzahl.
  const count = Math.max(1, columns * rows);
  const baseUnit = Math.sqrt((innerW * innerH) / count);

  // Anordnung schon hier bestimmen (nur seedabhängig), damit die Logo-Sperrzone
  // um die maximale Bewegungsweite DIESER Anordnung vergrößert werden kann – so
  // wandert auch während der Animation keine Shape über/unter das Logo.
  const ARRANGEMENTS = [
    "scatter",
    "grid",
    "rings",
    "diagonal",
    "wave",
    "border",
    "packing",
  ] as const;
  const arrangement = ARRANGEMENTS[Math.abs(hashString(`arrangement|${seedParam}`)) % ARRANGEMENTS.length];

  // Bewegungspuffer entsprechend der animierten Verschiebung in motionFor
  // (scatter/border/rings bewegen sich nicht -> 0).
  const waveRowsN = Math.max(1, Math.round(Math.sqrt(count)));
  const logoMotionMargin =
    arrangement === "wave"
      ? (innerH / waveRowsN) * 0.6
      : arrangement === "diagonal"
        ? baseUnit * 0.45
        : arrangement === "grid"
          ? baseUnit * 0.25
          : arrangement === "packing"
            ? baseUnit * 0.1
            : 0;

  // Das Logo wird ohnehin zuletzt (ganz oben) gezeichnet, ist also nie verdeckt;
  // die um den Bewegungspuffer vergrößerte Sperrzone hält die Shapes zusätzlich
  // auf Abstand, damit das Logo auch animiert frei steht. Die echte Zeichen-Box
  // logoBox bleibt unverändert.
  const logoExclusion = logoBox
    ? {
        x: logoBox.x - logoMotionMargin,
        y: logoBox.y - logoMotionMargin,
        w: logoBox.w + logoMotionMargin * 2,
        h: logoBox.h + logoMotionMargin * 2,
      }
    : undefined;
  const exclusionRects = [...staticExclusionRects, ...(logoExclusion ? [logoExclusion] : [])];

  // Pro Shuffle leicht variierende Meta-Parameter, damit dieselbe Anordnung
  // bei jedem Shuffle anders wirkt. Seitenunabhängig (sharedRng), damit Vorder-
  // und Rückseite denselben Charakter behalten.
  const bleedRatio = BLEED_RATIO * (0.6 + sharedRng() * 0.9); // wie weit über den Rand
  const gapRatio = MIN_GAP_RATIO * (0.7 + sharedRng() * 0.6); // Abstand/Überlappung (scatter)
  const scaleMin = 0.4 + sharedRng() * 0.4; // kleinste Elementgröße (scatter)
  const scaleRange = 1.6 + sharedRng() * 2.2; // Größenspanne (scatter)
  const scaleExp = 1.4 + sharedRng() * 1.8; // Verteilung: höher = mehr kleine Elemente

  const bleedX = innerW * bleedRatio;
  const bleedY = innerH * bleedRatio;

  // Rotations-Rauschfeld: Elemente ohne eigene (strukturelle) Rotation werden
  // anhand ihrer Position gedreht, statt alle in dieselbe Richtung zu zeigen –
  // die Ausrichtung „fließt“ über die Fläche. Feature-Größe relativ zur
  // Elementgröße; Seed seitenunabhängig (sharedSeed), damit Vorder-/Rückseite
  // gleich rotieren.
  const rotFieldCell = baseUnit * (2 + sharedRng() * 3);
  const rotTurns = 1 + Math.floor(sharedRng() * 2); // 1–2 Umdrehungen über das Feld
  const fieldAngle = (cx: number, cy: number) =>
    valueNoise(cx / rotFieldCell, cy / rotFieldCell, sharedSeed) * TAU * rotTurns;

  // Farb- und Opazitäts-Rauschfeld: dieselbe Idee wie fieldAngle, aber für
  // Farbwahl und Transparenz – benachbarte Elemente bekommen dadurch
  // ähnliche Werte (zusammenhängende Farb-/Transparenz-Flächen, die selbst
  // ein Muster bilden), statt unabhängig "Salz und Pfeffer" gewürfelt zu
  // werden. Eigene Zellgröße + Seed-Offset, damit die Bänder nicht exakt mit
  // dem Rotationsfeld zusammenfallen.
  const colorFieldCell = baseUnit * (1.5 + sharedRng() * 2.5);
  const opacityFieldCell = baseUnit * (2 + sharedRng() * 3);
  const OPACITY_LEVELS = [1, 0.6, 0.32]; // helle Bänder bleiben voll deckend, dunkle werden transparenter
  const fieldOpacity = (cx: number, cy: number) => {
    const n = valueNoise(cx / opacityFieldCell, cy / opacityFieldCell, sharedSeed + 7919);
    return OPACITY_LEVELS[Math.min(OPACITY_LEVELS.length - 1, Math.floor(n * OPACITY_LEVELS.length))];
  };
  // "Layered shapes": zusätzliche Option, die nur bei einem Teil der
  // Kompositionen (seed-abhängig, wie die Anordnung selbst) aktiv ist – dort
  // bekommen die transparentesten Elemente eine zweite, größere, stärker
  // gedrehte Kopie direkt darunter für eine geschichtete Tiefenwirkung.
  const layeringEnabled = Math.abs(hashString(`layering|${seedParam}`)) % 3 === 0;
  // Kombinations-Modus: zusätzliche Option, bei der jede platzierte Instanz
  // nicht eine einzelne Shape zeigt, sondern eine der 15 festen Form-
  // Kombinationen (siehe SHAPE_COMBOS in lib/shapes.ts) – wiederholt über die
  // Komposition verteilt (per idx durchgezählt), wobei die Teile innerhalb
  // einer Kombination unterschiedliche Farben/Opazitäten bekommen.
  const comboModeEnabled = Math.abs(hashString(`combo|${seedParam}`)) % 3 === 0;
  // "Einfliegen"-Animation: eigener, von der Anordnung unabhängiger
  // Bewegungs-Modus (siehe shapeFlyIn.ts) – ersetzt statt überlagert die
  // Anordnungs-spezifische Bewegung aus shapeAnimation.ts, wenn aktiv. Das
  // ist bei den meisten animierten Kompositionen der Fall (3 von 4): Shapes
  // starten dann außerhalb der Canvas und fliegen erst zu ihrer Position;
  // nur bei einem Viertel bleibt die anordnungsspezifische Eigenbewegung
  // (Welle/Diagonale/Truchet-Wippen/Packing-Atmen) erhalten.
  const flyInEnabled = Math.abs(hashString(`flyin|${seedParam}`)) % 4 !== 0;
  const flyInDirection = pickFlyInDirection(sharedSeed);
  const flyInAmplitude = Math.max(innerW, innerH) * 0.6 + baseUnit;
  // Normalerweise gewinnen Elemente beim Einfliegen an Opazität und verlieren
  // sie beim Ausfliegen; bei der Hälfte der Kompositionen ist es umgekehrt.
  const flyInInvertOpacity = Math.abs(hashString(`flyinvert|${seedParam}`)) % 2 === 0;

  // Gemeinsame Helfer für alle Anordnungen.
  const pickShape = () =>
    availableShapes.length > 0 ? availableShapes[Math.floor(rng() * availableShapes.length)] : undefined;
  // Kontrastregel: Shapes nie in der Hintergrundfarbe einfärben (sonst gehen sie
  // im Untergrund unter). Nur wenn dadurch keine Farbe übrig bliebe (z.B. genau
  // eine Farbe ausgewählt, die zugleich Hintergrund ist), auf die volle Palette
  // bzw. die Primärfarbe zurückfallen.
  const shapeColorPool = selectedColors.filter((c) => c !== bgColorHex);
  const colorPool = shapeColorPool.length > 0 ? shapeColorPool : selectedColors;
  // Positionsbasiert statt rein zufällig: benachbarte Elemente fallen in
  // dieselbe Rauschzelle und bekommen so dieselbe Farbe – es entstehen
  // zusammenhängende Farbflächen/Streifen statt unkorrelierter Einzelfarben.
  const pickColor = (cx: number, cy: number) => {
    if (colorPool.length === 0) return FALLBACK_COLOR;
    const n = valueNoise(cx / colorFieldCell, cy / colorFieldCell, sharedSeed + 311);
    return colorPool[Math.min(colorPool.length - 1, Math.floor(n * colorPool.length))];
  };
  // Shapes werden um einen beliebigen Winkel rotiert (siehe baseRot/fieldAngle
  // unten) – nach Rotation kann ihre achsenparallele Bounding-Box bis zur
  // Diagonale (size*√2, bei 45°) reichen statt nur size×size. Ohne diesen
  // Sicherheitsabstand können rotierte Shapes als "frei" durchgehen und dann
  // doch in Text/Logo hineinragen.
  const intersectsExclusion = (cx: number, cy: number, size: number) => {
    const safeSize = size * Math.SQRT2;
    return exclusionRects.some(({ x, y, w, h }) =>
      rectsOverlap(cx - safeSize / 2, cy - safeSize / 2, safeSize, safeSize, x, y, w, h)
    );
  };
  const inBleed = (cx: number, cy: number) =>
    cx >= innerX - bleedX &&
    cx <= innerX + innerW + bleedX &&
    cy >= innerY - bleedY &&
    cy <= innerY + innerH + bleedY;

  // "l"/"n1"/"n2" sind diagonale Striche, die bei 45°/225° waagrecht statt
  // diagonal aussehen würden – für diese Shapes auf den nächsten 90°-Nachbarn
  // (135°/315°) ausweichen, der weiterhin diagonal bleibt.
  const NO_HORIZONTAL_SHAPES = new Set(["l", "n1", "n2"]);
  function avoidHorizontalRotation(shapeId: string | undefined, angle: number): number {
    if (!shapeId || !NO_HORIZONTAL_SHAPES.has(shapeId)) return angle;
    const normalized = ((angle % TAU) + TAU) % TAU;
    const isHorizontal =
      Math.abs(normalized - Math.PI / 4) < 1e-6 || Math.abs(normalized - (5 * Math.PI) / 4) < 1e-6;
    return isHorizontal ? angle + Math.PI / 2 : angle;
  }

  // Begrenzung der Richtungsvielfalt: jede Shape darf in dieser Visualisierung
  // nur in maximal N unterschiedlichen Richtungen auftauchen – mit wenigen
  // Shape-Typen sind 2 Richtungen pro Shape erlaubt, ab 3 Shape-Typen nur noch
  // 1 (sonst wird die Komposition mit vielen Formen schnell unruhig). Die
  // erlaubten Richtungen je Shape werden einmal pro Komposition (sharedSeed,
  // seitenunabhängig) aus den 8 Himmelsrichtungen (45°-Schritte) gewählt;
  // die eigentliche, von der Anordnung berechnete Richtung wird danach auf
  // die jeweils nächstliegende erlaubte Richtung "eingerastet". Bei genau 2
  // erlaubten Richtungen ist die zweite immer exakt 180° von der ersten
  // entfernt (Spiegelung statt einer beliebigen zweiten Zufallsrichtung).
  const MAX_DIRECTIONS_PER_SHAPE = availableShapes.length >= 3 ? 1 : 2;
  const allowedAnglesCache = new Map<string, number[]>();
  function getAllowedAngles(shapeId: string): number[] {
    const cached = allowedAnglesCache.get(shapeId);
    if (cached) return cached;
    const dirRng = createRng(hashString(`directions|${shapeId}|${sharedSeed}`));
    const baseStep = Math.floor(dirRng() * 8);
    const steps = MAX_DIRECTIONS_PER_SHAPE >= 2 ? [baseStep, (baseStep + 4) % 8] : [baseStep];
    const angles = steps.map((step) => avoidHorizontalRotation(shapeId, step * (Math.PI / 4)));
    allowedAnglesCache.set(shapeId, angles);
    return angles;
  }
  function circularDist(a: number, b: number): number {
    const diff = Math.abs(a - b) % TAU;
    return Math.min(diff, TAU - diff);
  }
  function restrictDirection(shapeId: string | undefined, angle: number): number {
    if (!shapeId) return angle;
    const allowed = getAllowedAngles(shapeId);
    const normalized = ((angle % TAU) + TAU) % TAU;
    let best = allowed[0];
    let bestDist = circularDist(normalized, allowed[0]);
    for (let i = 1; i < allowed.length; i++) {
      const d = circularDist(normalized, allowed[i]);
      if (d < bestDist) {
        bestDist = d;
        best = allowed[i];
      }
    }
    return best;
  }

  // --- Anordnung 1: organische Streuung (Standard) ---
  // Jedes Element bekommt zuerst eine "Heimatzelle" in einem an die Anzahl
  // angepassten Grundraster (statt komplett frei im Feld zu würfeln) und wird
  // dort kräftig gejittert platziert – das hält die Verteilung gleichmäßig
  // (kein Klumpen/Lücken-Zufall), bleibt aber durch den Jitter organisch.
  // Größte Elemente zuerst platzieren (erste Wahl an freiem Platz), Nachbar-
  // Abstand über ein räumliches Hash-Grid prüfen. Etwas Überlappung bleibt
  // erlaubt (MIN_GAP_RATIO) für die gewollte Tiefenwirkung. Erst wenn die
  // Heimatzelle wiederholt blockiert ist (Sperrzone/Nachbarn), weicht ein
  // Element als Ausweg frei ins gesamte Feld aus, damit nichts verloren geht.
  function placeScatter(): Instance[] {
    const candidates = Array.from({ length: count }, (_, i) => {
      const scale = scaleMin + rng() ** scaleExp * scaleRange;
      return { idx: i, size: baseUnit * scale };
    });

    const areaW = innerW + bleedX * 2;
    const areaH = innerH + bleedY * 2;
    const gridCols = Math.max(1, Math.round(Math.sqrt((count * areaW) / areaH)));
    const gridRows = Math.max(1, Math.ceil(count / gridCols));
    const cellW = areaW / gridCols;
    const cellH = areaH / gridRows;

    // Heimatzellen gemischt zuweisen (Fisher-Yates), damit nicht die ohnehin
    // nach Größe sortierten Elemente in Lese-Reihenfolge über die Zellen
    // wandern (sonst sichtbares Größen-Gefälle von oben-links nach unten-rechts).
    const cellOrder = Array.from({ length: gridCols * gridRows }, (_, i) => i);
    for (let i = cellOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cellOrder[i], cellOrder[j]] = [cellOrder[j], cellOrder[i]];
    }
    const homeCell = new Map<number, number>();
    candidates.forEach((c, i) => homeCell.set(c.idx, cellOrder[i % cellOrder.length]));

    const sortedCandidates = [...candidates].sort((a, b) => b.size - a.size);

    const cellSize = Math.max(1, sortedCandidates[0]?.size ?? baseUnit);
    const grid = new Map<string, Instance[]>();
    const neighborsTooClose = (cx: number, cy: number, size: number): boolean => {
      const ix = Math.floor(cx / cellSize);
      const iy = Math.floor(cy / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(cellKey(ix + dx, iy + dy));
          if (!bucket) continue;
          for (const other of bucket) {
            const minDist = ((size + other.size) / 2) * gapRatio;
            const ddx = cx - other.cx;
            const ddy = cy - other.cy;
            if (ddx * ddx + ddy * ddy < minDist * minDist) return true;
          }
        }
      }
      return false;
    };

    const result: Instance[] = [];
    for (const { idx, size } of sortedCandidates) {
      const home = homeCell.get(idx)!;
      const homeX = innerX - bleedX + (home % gridCols) * cellW;
      const homeY = innerY - bleedY + Math.floor(home / gridCols) * cellH;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        const free = attempt >= MAX_PLACEMENT_ATTEMPTS - 6;
        const cx = free ? innerX - bleedX + rng() * areaW : homeX + rng() * cellW;
        const cy = free ? innerY - bleedY + rng() * areaH : homeY + rng() * cellH;
        if (intersectsExclusion(cx, cy, size)) continue;
        if (neighborsTooClose(cx, cy, size)) continue;
        const inst: Instance = { idx, cx, cy, size, shapeId: pickShape(), colorHex: pickColor(cx, cy) };
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
        const cx = x + cw / 2;
        const cy = y + ch / 2;
        const shapeId = pickShape();
        result.push({
          idx: i++,
          cx,
          cy,
          size: cell,
          // Rauschfeld statt unabhängigem Würfeln je Zelle – benachbarte
          // Truchet-Kacheln drehen sich dadurch kohärent statt rein zufällig.
          baseRot: avoidHorizontalRotation(shapeId, Math.round(fieldAngle(cx, cy) / (Math.PI / 2)) * (Math.PI / 2)),
          shapeId,
          colorHex: pickColor(cx, cy),
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
        const shapeId = pickShape();
        result.push({
          idx: i++,
          cx,
          cy,
          size,
          baseRot: avoidHorizontalRotation(shapeId, Math.round((a + Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4)),
          shapeId,
          colorHex: pickColor(cx, cy),
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
        const shapeId = pickShape();
        result.push({ idx: i++, cx, cy, size, baseRot: avoidHorizontalRotation(shapeId, angle), shapeId, colorHex: pickColor(cx, cy) });
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
    const slopeK = (amp * TAU * freq) / innerW; // Steigung = cos(theta) * slopeK
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
        const slope = Math.cos(theta) * slopeK;
        const shapeId = pickShape();
        result.push({
          idx: i++,
          cx,
          cy,
          size,
          baseRot: avoidHorizontalRotation(shapeId, Math.round(Math.atan(slope) / (Math.PI / 4)) * (Math.PI / 4)),
          waveTheta: theta,
          waveAmp: amp,
          waveSlopeK: slopeK,
          shapeId,
          colorHex: pickColor(cx, cy),
        });
      }
    }
    return result;
  }

  // --- Anordnung 7: Rahmen ---
  // Shapes liegen nur im Randstreifen, die Mitte bleibt frei (gut für zentralen
  // Text/Logo). Systematisch in gleich großen Slots entlang des Umfangs
  // verteilt (statt rein zufällig im Streifen gewürfelt, was sichtbar
  // klumpen/Lücken lassen konnte) – Jitter entlang des Umfangs und in der
  // Eindringtiefe sorgt trotzdem für eine organische Note.
  function pointOnBorderBand(along: number, depth: number): { cx: number; cy: number } {
    // Umfang im Uhrzeigersinn ab oben-links: oben (→), rechts (↓), unten (←), links (↑).
    let a = along;
    if (a < innerW) return { cx: innerX + a, cy: innerY + depth };
    a -= innerW;
    if (a < innerH) return { cx: innerX + innerW - depth, cy: innerY + a };
    a -= innerH;
    if (a < innerW) return { cx: innerX + innerW - a, cy: innerY + innerH - depth };
    a -= innerW;
    return { cx: innerX + depth, cy: innerY + innerH - a };
  }
  function placeBorder(): Instance[] {
    const band = Math.min(innerW, innerH) * 0.22;
    const perimeter = 2 * (innerW + innerH);
    const slot = perimeter / count;
    const result: Instance[] = [];
    for (let n = 0; n < count; n++) {
      const size = baseUnit * (0.7 + rng() * 0.6);
      const slotCenter = (n + 0.5) * slot;
      for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
        // Erste Versuche: Jitter um den systematischen Umfangs-Slot; erst bei
        // wiederholter Sperrzonen-Kollision frei irgendwo am Rand ausweichen.
        const free = attempt >= MAX_PLACEMENT_ATTEMPTS - 6;
        const along = free ? rng() * perimeter : slotCenter + (rng() - 0.5) * slot * 1.4;
        const wrapped = ((along % perimeter) + perimeter) % perimeter;
        const depth = rng() * band;
        const { cx, cy } = pointOnBorderBand(wrapped, depth);
        if (intersectsExclusion(cx, cy, size)) continue;
        result.push({ idx: n, cx, cy, size, shapeId: pickShape(), colorHex: pickColor(cx, cy) });
        break;
      }
    }
    return result;
  }

  // --- Anordnung 7: Circle-Packing (Wachstums-Simulation) ---
  // Kreise wachsen iterativ aus zufälligen Startpunkten, bis sie sich
  // gegenseitig, die Ränder oder Ausschlusszonen berühren – eine emergente,
  // dicht gepackte Komposition mit natürlicher Größenhierarchie (große Kreise
  // in offenen Flächen, kleine füllen die Lücken). Anders als die übrigen
  // Anordnungen ergibt sich die Größe hier aus der Simulation, nicht vorab.
  function placePacking(): Instance[] {
    type Circle = { x: number; y: number; r: number; grow: number; idx: number; live: boolean };
    const minR = Math.max(2, baseUnit * 0.18);
    const maxR = baseUnit * 1.6;
    const ITERATIONS = 18;
    const cell = Math.max(1, maxR);

    // Startpunkte aus einem Grundraster (statt rein zufällig im ganzen Feld),
    // damit die Wachstums-Simulation gleichmäßig über die Fläche verteilt
    // beginnt – das Ergebnis bleibt durch die Simulation organisch, folgt in
    // der Verteilung der Startpunkte aber einem Schema statt dem Zufall.
    const areaW = innerW + bleedX * 2;
    const areaH = innerH + bleedY * 2;
    const gridCols = Math.max(1, Math.round(Math.sqrt((count * areaW) / areaH)));
    const gridRows = Math.max(1, Math.ceil(count / gridCols));
    const cellW = areaW / gridCols;
    const cellH = areaH / gridRows;

    const circles: Circle[] = [];
    for (let i = 0; i < count; i++) {
      const gx = i % gridCols;
      const gy = Math.floor(i / gridCols);
      const x = innerX - bleedX + gx * cellW + rng() * cellW;
      const y = innerY - bleedY + gy * cellH + rng() * cellH;
      if (intersectsExclusion(x, y, minR * 2)) continue; // Startpunkt in Sperrzone
      circles.push({ x, y, r: minR, grow: minR * (0.4 + rng() * 0.9), idx: i, live: true });
    }

    // Jede Iteration: Kreise, die noch wachsen dürfen, einen Schritt vergrößern;
    // wer Nachbar/Rand/Sperrzone berühren würde, hört auf zu wachsen.
    for (let it = 0; it < ITERATIONS; it++) {
      const grid = new Map<string, Circle[]>();
      for (const c of circles) {
        const key = cellKey(Math.floor(c.x / cell), Math.floor(c.y / cell));
        const bucket = grid.get(key);
        if (bucket) bucket.push(c);
        else grid.set(key, [c]);
      }
      for (const c of circles) {
        if (!c.live) continue;
        const nr = c.r + c.grow;
        if (
          nr > maxR ||
          c.x - nr < innerX - bleedX ||
          c.x + nr > innerX + innerW + bleedX ||
          c.y - nr < innerY - bleedY ||
          c.y + nr > innerY + innerH + bleedY ||
          intersectsExclusion(c.x, c.y, nr * 2)
        ) {
          c.live = false;
          continue;
        }
        const ix = Math.floor(c.x / cell);
        const iy = Math.floor(c.y / cell);
        let blocked = false;
        for (let dx = -1; dx <= 1 && !blocked; dx++) {
          for (let dy = -1; dy <= 1 && !blocked; dy++) {
            const bucket = grid.get(cellKey(ix + dx, iy + dy));
            if (!bucket) continue;
            for (const o of bucket) {
              if (o === c) continue;
              const ddx = c.x - o.x;
              const ddy = c.y - o.y;
              if (ddx * ddx + ddy * ddy < (nr + o.r) * (nr + o.r)) {
                blocked = true;
                break;
              }
            }
          }
        }
        if (blocked) c.live = false;
        else c.r = nr;
      }
    }

    return circles
      .filter((c) => c.r > minR * 1.05) // winzige Reste weglassen
      .map((c) => {
        const shapeId = pickShape();
        return {
          idx: c.idx,
          cx: c.x,
          cy: c.y,
          size: c.r * 2,
          baseRot: avoidHorizontalRotation(shapeId, Math.floor(rng() * 8) * (Math.PI / 4)),
          shapeId,
          colorHex: pickColor(c.x, c.y),
        };
      });
  }

  // Anordnung wurde oben schon bestimmt (für die Logo-Sperrzone); hier nur noch
  // die passende Platzierungs-Funktion auswählen und ausführen.
  const placers: Record<(typeof ARRANGEMENTS)[number], () => Instance[]> = {
    scatter: placeScatter,
    grid: placeGrid,
    rings: placeRings,
    diagonal: placeDiagonal,
    wave: placeWave,
    border: placeBorder,
    packing: placePacking,
  };
  const instances = (placers[arrangement] ?? placeScatter)();

  // Schema-Zwang für Farbe/Opazität: nur "scatter" bleibt der bewusst freie,
  // organische Random-Modus (Farbe/Opazität folgen dort weiterhin dem
  // Rauschfeld). Alle anderen, systematischen Anordnungen bekommen stattdessen
  // entweder durchgehend abwechselnde Farben ODER abwechselnd hohe/niedrige
  // Opazität – nach der Platzierungs-Reihenfolge (idx) statt nach Position,
  // damit das Schema (z.B. jedes zweite Element) klar erkennbar bleibt statt
  // wie ein unscharfer Farbverlauf zu wirken.
  if (arrangement !== "scatter") {
    const useOpacityScheme = Math.abs(hashString(`colorscheme|${seedParam}`)) % 2 === 0;
    const baseColor = colorPool[0] ?? FALLBACK_COLOR;
    instances.forEach((inst, i) => {
      if (useOpacityScheme) {
        inst.colorHex = baseColor;
        inst.opacityOverride = i % 2 === 0 ? 1 : 0.4;
      } else {
        inst.colorHex = colorPool.length > 0 ? colorPool[i % colorPool.length] : FALLBACK_COLOR;
        inst.opacityOverride = 1;
      }
    });
  }

  // `candidates` ist bereits absteigend nach Größe sortiert, `instances`
  // erbt diese Reihenfolge: größere Elemente liegen unten, kleinere obenauf –
  // das sorgt für Tiefe in den verbliebenen Überlappungen statt zufälligem
  // Gewusel.

  // Einfliegen-Modus: räumlich überlappende Instanzen bekommen einen
  // möglichst unterschiedlichen Einflug-Versatz zugewiesen, statt unabhängig
  // vom Hash gewürfelt zu werden – sonst können zwei übereinanderliegende
  // Shapes (zufällig) zur gleichen Zeit an derselben Stelle ankommen und wie
  // ein einzelner Blob wirken. Innerhalb einer Überlappungs-Gruppe wird der
  // Versatz gleichmäßig über [0,1) verteilt, damit sie klar nacheinander
  // einfliegen.
  const flyInOffByIdx = new Map<number, number>();
  if (flyInEnabled && instances.length > 0) {
    // Jede Instanz bekommt einen eigenen, garantiert getrennten Slot über
    // [0,1) (Abstand exakt 1/N) statt unabhängig gehasht zu werden – sonst
    // können bei vielen Elementen rein statistisch mehrere sehr ähnliche
    // off-Werte (und damit gleichzeitige Start-/Ankunftszeiten) entstehen,
    // egal ob sie sich räumlich überlappen oder nicht. Eine Zufalls-
    // Reihenfolge (statt Platzierungs-Reihenfolge) plus kleiner Jitter
    // sorgt dafür, dass es trotzdem nicht wie ein starres Metronom wirkt,
    // ohne die garantierte Mindestdistanz zwischen zwei Slots zu verlieren.
    const order = [...instances];
    const shuffleRng = createRng(hashString(`flyinorder|${seedParam}`));
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(shuffleRng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const slot = 1 / order.length;
    order.forEach((inst, i) => {
      const jitter = (fieldHash(inst.idx + 1, 19, sharedSeed) - 0.5) * slot * 0.6;
      flyInOffByIdx.set(inst.idx, (((i + 0.5) * slot + jitter) % 1 + 1) % 1);
    });
  }

  // Zusätzlich zum Punkt-Pulsieren bewegen sich die Shapes selbst – je nach
  // Anordnung unterschiedlich (siehe getShapeMotion in shapeAnimation.ts).
  // Seed seitenunabhängig (sharedSeed), damit Vorder-/Rückseite synchron
  // laufen; der Desync-Versatz pro Element wird hier berechnet (braucht
  // fieldHash/sharedSeed aus diesem Modul) und nur durchgereicht.
  const driftAmp = baseUnit * 0.45;
  const motionFor = (inst: Instance): Motion => {
    if (!animate) return { dx: 0, dy: 0, dRot: 0, scale: 1 };
    if (flyInEnabled) {
      const off = flyInOffByIdx.get(inst.idx) ?? fieldHash(inst.idx + 1, 11, sharedSeed); // 0..1, Staffelung statt Gleichschritt
      const speedFactor = fieldHash(inst.idx + 1, 17, sharedSeed); // 0..1, eigene Fluggeschwindigkeit pro Element
      const { dx, dy, opacity } = getFlyInMotion(
        flyInDirection,
        phase,
        off,
        flyInAmplitude,
        loopDuration,
        flyInInvertOpacity,
        speedFactor
      );
      return { dx, dy, dRot: 0, scale: 1, opacityMul: opacity };
    }
    const off = fieldHash(inst.idx + 1, 7, sharedSeed) * TAU; // desynchronisiert pro Element
    return getShapeMotion(arrangement, phase, off, driftAmp, inst);
  };

  // Bild-Areas VOR den Shapes zeichnen, damit die Shapes sichtbar über den
  // Bleed-Rand (IMAGE_SHAPE_BLEED_RATIO) hinwegragen können. Text-Areas
  // bleiben bewusst in der Schleife NACH den Shapes (siehe weiter unten).
  for (const { area, x, y, w, h } of resolvedAreas) {
    if (area.kind === "image" && areaImages) {
      const img = areaImages.getImage(area, w, h);
      if (img) {
        p5.imageMode(p5.CORNER);
        p5.image(img, x, y, w, h);
      }
    }
  }

  // p5.tint() + image() ist im 2D-Renderer dieser p5-Version kaputt (siehe
  // Kommentar bei getTintedImage in Canvas.tsx) – Transparenz wird deshalb
  // direkt über den Canvas-Context (globalAlpha) gesetzt, das betrifft sowohl
  // image() als auch fill()/ellipse() gleichermaßen.
  const shadeCtx = (p5 as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;

  for (const inst of instances) {
    const { cx, cy, size } = inst;
    // Arrangements mit struktureller Rotation (Truchet/Ringe/Welle/Diagonale)
    // behalten ihr baseRot; freie Elemente (scatter/border) folgen dem
    // Rotations-Rauschfeld statt einer einheitlichen Richtung. Am Ende wird
    // pro Shape-Typ auf eine von max. 1–2 erlaubten Richtungen eingerastet
    // (siehe restrictDirection), damit nicht jede Shape effektiv in eine
    // eigene Richtung zeigt.
    const rot = restrictDirection(
      inst.shapeId,
      avoidHorizontalRotation(inst.shapeId, inst.baseRot ?? fieldAngle(cx, cy))
    );
    const m = motionFor(inst);
    // Außerhalb des Random-Modus ist die Opazität durch das Farb-/Opazitäts-
    // Schema vorgegeben (siehe oben); nur scatter nutzt weiterhin das
    // Rauschfeld, ausgewertet an der unbewegten Position, damit die
    // Transparenz-Bänder während der Animation stabil stehen bleiben statt
    // mit der Shape mitzuwandern/zu flackern. Im Einfliegen-Modus kommt noch
    // der Fade-in/-out-Faktor aus motionFor dazu (siehe opacityMul).
    const opacity = (inst.opacityOverride ?? fieldOpacity(cx, cy)) * (m.opacityMul ?? 1);

    // Kombinations-Modus (zusätzliche Option, siehe comboModeEnabled): statt
    // einer einzelnen Shape wird eine der 15 festen Form-Kombinationen
    // gezeichnet (wiederholt, per idx durchgezählt) – jeder Teil bekommt eine
    // eigene Farbe (nächste Palettenfarbe) und abwechselnd hohe/niedrige
    // Opazität, damit die Kombination als zusammengesetztes Symbol lesbar
    // bleibt statt als eine flache Fläche.
    if (comboModeEnabled && inst.shapeId && shapeImages) {
      const combo = SHAPE_COMBOS[inst.idx % SHAPE_COMBOS.length];
      const baseColorIdx = colorPool.indexOf(inst.colorHex);
      p5.push();
      p5.translate(cx + m.dx, cy + m.dy);
      p5.rotate(rot + m.dRot);
      combo.forEach((part, pi) => {
        const partColor =
          colorPool.length > 0 && baseColorIdx >= 0 ? colorPool[(baseColorIdx + pi) % colorPool.length] : inst.colorHex;
        const partImgColored = shapeImages.getImage(part.shapeId, partColor, size, animate ? phase : undefined);
        shadeCtx.globalAlpha = pi % 2 === 0 ? opacity : opacity * 0.55;
        if (!partImgColored) return;
        const partSize = size * part.scale;
        const fit = Math.min(partSize / partImgColored.width, partSize / partImgColored.height);
        p5.push();
        p5.translate(part.dx * size, part.dy * size);
        p5.rotate(part.rotOffset);
        p5.imageMode(p5.CENTER);
        p5.image(partImgColored, 0, 0, partImgColored.width * fit, partImgColored.height * fit);
        p5.pop();
      });
      p5.pop();
      shadeCtx.globalAlpha = 1;
      continue;
    }

    // Das Punkt-Pulsieren im Gitter bleibt (Phase an getImage); zusätzlich
    // bewegt sich die ganze Shape gemäß m.
    const img =
      inst.shapeId && shapeImages
        ? shapeImages.getImage(inst.shapeId, inst.colorHex, size, animate ? phase : undefined)
        : undefined;

    // Layered Echo (zusätzliche Option, siehe layeringEnabled): die
    // transparentesten Elemente bekommen eine größere, stärker gedrehte
    // Kopie direkt darunter – Tiefenwirkung durch geschichtete Formen statt
    // einer einzigen flachen Fläche.
    if (layeringEnabled && img && opacity < 1) {
      shadeCtx.globalAlpha = opacity * 0.5;
      p5.push();
      p5.translate(cx + m.dx, cy + m.dy);
      p5.rotate(rot + m.dRot + Math.PI / 6);
      const echoFit = (Math.min(size / img.width, size / img.height)) * 1.3;
      p5.imageMode(p5.CENTER);
      p5.image(img, 0, 0, img.width * echoFit, img.height * echoFit);
      p5.pop();
    }

    shadeCtx.globalAlpha = opacity;
    p5.push();
    p5.translate(cx + m.dx, cy + m.dy);
    p5.rotate(rot + m.dRot);
    if (m.scale !== 1) p5.scale(m.scale);

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
    shadeCtx.globalAlpha = 1;
  }

  // Bild-Kern (alles außer dem 10%-Bleed-Rand) NACH den Shapes erneut
  // zeichnen: garantiert den Bleed strikt auf 10% Breite/Höhe, unabhängig
  // davon, wie groß eine Shape ist bzw. wie weit sie beim Platzieren ins Bild
  // hineinreichen durfte (die Ausschlusszone oben ist nur eine Heuristik,
  // kein exakter Begrenzer). Da img bereits 1:1 in Pixeln auf x..x+w/y..y+h
  // gemappt ist (siehe getMaskedAreaImage), entspricht der Quell-Ausschnitt
  // exakt dem Ziel-Ausschnitt.
  for (const { area, x, y, w, h } of resolvedAreas) {
    if (area.kind === "image" && areaImages) {
      const img = areaImages.getImage(area, w, h);
      if (!img) continue;
      const { insetX, insetY } = imageBleedInset(w, h);
      const coreX = x + insetX;
      const coreY = y + insetY;
      const coreW = w - insetX * 2;
      const coreH = h - insetY * 2;
      if (coreW <= 0 || coreH <= 0) continue;
      p5.imageMode(p5.CORNER);
      p5.image(img, coreX, coreY, coreW, coreH, insetX, insetY, coreW, coreH);
    }
  }

  // Feste Text-Areas zeichnen (NACH den Shapes, damit Text immer lesbar
  // oben liegt): Farbe passend zum Untergrund.
  for (const { area, x, y, w, h } of resolvedAreas) {
    if (area.kind === "text") {
      const brightness = sampleBrightness(p5, x, y, w, h);
      p5.noStroke();
      p5.fill(pickTextColor(brightness));
      // Horizontal linksbündig (auf Wunsch), vertikal zentriert in der Box.
      p5.textAlign(p5.LEFT, p5.CENTER);
      // Dieselbe Basis wie in resolveOverlayAreas (AREA_FONT_RATIO), NICHT von
      // w/h abgeleitet: die Box ist hier bereits das Ergebnis der Textgröße
      // (siehe dort), nicht mehr umgekehrt.
      p5.textSize(applyTextStyle(p5, fontProvider, area.style ?? DEFAULT_TEXT_STYLE, innerH * AREA_FONT_RATIO));
      const padX = innerW * AREA_PAD_RATIO;
      // Kein Height-Argument übergeben: p5 schneidet bei text(str,x,y,w,h)
      // schon die erste Zeile komplett weg, sobald ihre Zeilenhöhe größer ist
      // als h (z.B. bei der "title"-Rolle in der kompakten Standard-Box) –
      // ohne h wird stattdessen nur um den als Mitte übergebenen y-Punkt
      // zentriert, ohne Begrenzung nach oben/unten.
      p5.text(area.text ?? "", x + padX, y + h / 2, w - padX * 2);
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
    p5.textSize(applyTextStyle(p5, fontProvider, field.style, baseSize));
    if (field.position!.wrap) {
      // Breite übergeben, damit der Text bei Erreichen von w in die nächste
      // Zeile umbricht, statt als eine lange Zeile zu überlaufen. Kein
      // Height-Argument (siehe Area-Text oben): sonst schneidet p5 schon die
      // erste Zeile komplett weg, falls ihre Zeilenhöhe größer als h ist.
      // Nur Felder mit explizitem "wrap" nutzen das (z.B. freier Beschreibungs-
      // text), sonst bricht es eng aufeinander abgestimmte Layouts wie beim
      // Voucher, deren Boxen bewusst breiter als der eigentliche Text sind.
      p5.text(text, x, y + h / 2, w);
    } else {
      const tx = align === "left" ? x : align === "right" ? x + w : x + w / 2;
      p5.text(text, tx, y + h / 2);
    }
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
      p5.textSize(applyTextStyle(p5, fontProvider, line.style, baseSize));
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
