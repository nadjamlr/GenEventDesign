"use client";

import { useEffect, useRef } from "react";
import p5 from "p5";
import useDesignStore from "@/store/designStore";
import {
  drawGrid,
  resolveOverlayAreas,
  type ShapeImageProvider,
  type LogoImages,
  type AreaImageProvider,
} from "@/algorithms/grid";
import { exportRegistry } from "@/lib/canvasExport";
import { shapes, FULL_LOGO_SHAPE_ID, FULL_LOGO_SRC } from "@/lib/shapes";
import type { AreaDef } from "@/lib/areas";
import { hasSides, getSideLayout, FORMAT_SIZES, type Side } from "@/lib/formats";
import { getGoogleFontUrl } from "@/lib/fonts";
import { TEXT_STYLES } from "@/lib/textStyles";

const STACK_GAP_RATIO = 0.04; // Abstand zwischen Vorder- und Rückseite, relativ zur Seitenhöhe
const AREA_DRAG_MARGIN_RATIO = 0.06; // Mindestabstand zum Rahmenrand beim Drag&Drop von Areas (gleich auf allen 4 Seiten)
const TAU = Math.PI * 2;

// Animations-Amplitude der Punkte: jeder Punkt schwankt zufällig um seinen
// Basisradius. Min/Max begrenzen, wie stark er dabei wächst/schrumpft.
const DOT_PULSE_MIN = 0.25;
const DOT_PULSE_MAX = 0.8;

// Deterministisches Pseudo-Zufall pro Gitterknoten (i,j) + Seed – damit jeder
// Punkt eine eigene, über die Frames stabile Phase/Amplitude bekommt.
function dotRand(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Stabiler Seed pro Shape/Farbe, damit verschiedene Shapes nicht im Gleichtakt
// pulsieren.
function strSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Auflösungs-Slider (0..10) -> Anzahl der Rasterzellen über die längere
// Shape-Seite. Höher = stärker "hineingezoomt" (größere Zellen, weniger
// Punkte); niedriger = feines Raster mit vielen kleinen Punkten.
const GRID_MIN_CELLS = 15;
const GRID_MAX_CELLS = 28;
function resolutionToCellCount(resolution: number): number {
  const t = Math.max(0, Math.min(1, resolution / 10));
  return Math.round(GRID_MAX_CELLS - t * (GRID_MAX_CELLS - GRID_MIN_CELLS));
}

// Punktgrößen-Slider (0..10) -> Punktradius relativ zur Zellengröße. Bei 0
// kleine Punkte mit viel Luft, bei 10 fast aneinanderstoßende Punkte.
const DOT_MIN_RATIO = 0.08;
const DOT_MAX_RATIO = 0.9;
function dotSizeToRatio(dotSize: number): number {
  const t = Math.max(0, Math.min(1, dotSize / 10));
  return DOT_MIN_RATIO + t * (DOT_MAX_RATIO - DOT_MIN_RATIO);
}

// Texture-Slider (0..10) -> 0..1: Stärke der rauschbasierten Größenvariation.
function sliderToAmount(v: number): number {
  return Math.max(0, Math.min(1, v / 10));
}

// Feature-Größe des Rauschfeldes: kleiner = größere zusammenhängende Flächen.
const SIZE_NOISE_SCALE = 0.28;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Glattes Value-Noise auf Basis des per-Knoten-Hashes (dotRand): benachbarte
// Punkte bekommen ähnliche Werte, sodass Größen-/Farbverläufe in Flächen
// (statt punktweisem Rauschen) entstehen.
function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const v00 = dotRand(x0, y0, seed);
  const v10 = dotRand(x0 + 1, y0, seed);
  const v01 = dotRand(x0, y0 + 1, seed);
  const v11 = dotRand(x0 + 1, y0 + 1, seed);
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  return (v00 + (v10 - v00) * u) * (1 - v) + (v01 + (v11 - v01) * u) * v;
}

// Zeichnet ein regelmäßiges Gitter aus Punkten, die durch dünne Linien
// verbunden sind (Lattice), und beschneidet es anschließend per
// "destination-in" auf die Shape-Silhouette `raw` – der Rand des Gitters
// erhält dadurch exakt die Form der Shape. Das Gitter ist auf die Bildmitte
// zentriert und reicht über alle Ränder hinaus, damit die Silhouette überall
// gefüllt ist.
type DotGridOptions = {
  baseColor: string;
  cellCount: number;
  dotRatio: number;
  variation: number; // 0..1 rauschbasierte Größenvariation
  seed: number;
  phase?: number; // gesetzt = Punkte pulsieren
};

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  raw: HTMLImageElement,
  w: number,
  h: number,
  opts: DotGridOptions
) {
  const { baseColor, cellCount, dotRatio, variation, seed, phase } = opts;
  const cell = Math.max(w, h) / cellCount;
  const cx = w / 2;
  const cy = h / 2;
  const nx = Math.ceil(w / 2 / cell) + 1; // Zellen von der Mitte bis über den Rand
  const ny = Math.ceil(h / 2 / cell) + 1;

  ctx.fillStyle = baseColor;
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.lineCap = "round";

  // Verbindungslinien (durch die Punktzentren) – immer in der Basisfarbe.
  const left = cx - nx * cell;
  const right = cx + nx * cell;
  const top = cy - ny * cell;
  const bottom = cy + ny * cell;
  ctx.beginPath();
  for (let i = -nx; i <= nx; i++) {
    const x = cx + i * cell;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let j = -ny; j <= ny; j++) {
    const y = cy + j * cell;
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  // Punkte an jedem Gitterknoten.
  const dotR = cell * dotRatio;
  const maxR = cell * 1.2; // Punkte nie zu weit über die Zelle hinaus wachsen lassen
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      // Größe: optional über ein Rauschfeld in zusammenhängenden Flächen
      // variiert (große/kleine Cluster) …
      let r = dotR;
      if (variation > 0) {
        const n = valueNoise(i * SIZE_NOISE_SCALE, j * SIZE_NOISE_SCALE, seed + 991);
        const noiseMul = 0.1 + n * 1.7; // ~0.1..1.8 (Mittel ~0.95)
        r = dotR * (1 + variation * (noiseMul - 1));
      }
      // … darunter weiterhin das nahtlose Pulsieren bei gesetzter Phase. Über
      // eine ganze Loop (phase 0..1) kehrt jeder Punkt zur Ausgangsgröße zurück.
      if (phase !== undefined) {
        const offset = dotRand(i, j, seed);
        const amp = DOT_PULSE_MIN + dotRand(i, j, seed + 7) * (DOT_PULSE_MAX - DOT_PULSE_MIN);
        const freq = dotRand(i, j, seed + 13) < 0.5 ? 1 : 2;
        r *= 1 + amp * Math.sin(TAU * (freq * phase + offset));
      }
      r = Math.max(0, Math.min(maxR, r));
      if (r <= 0) continue;

      ctx.beginPath();
      ctx.arc(cx + i * cell, cy + j * cell, r, 0, TAU);
      ctx.fill();
    }
  }

  // Gitter auf die Shape-Silhouette beschneiden.
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(raw, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

// Zeichnet nur das ausgewählte Logo/Icon (in Schwarz, auf das weiße Shirt)
// zentriert in die übergebene Region – für "logo"-Mockup-Panels.
function drawLogoOnly(
  target: p5,
  drawParams: Parameters<typeof drawGrid>[1],
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const { logoImages, logoMode = "random", logoEnabled = true, seed = 0 } = drawParams;
  if (!logoEnabled || !logoImages) return;
  const variant = logoMode === "random" ? (Math.abs(seed) % 2 === 0 ? "logo" : "icon") : logoMode;
  const vi = logoImages[variant];
  const img = vi?.black ?? vi?.white;
  if (!img) return;
  const fit = Math.min(rw / img.width, rh / img.height);
  const dw = img.width * fit;
  const dh = img.height * fit;
  target.imageMode(target.CORNER);
  target.image(
    img,
    Math.round(rx + (rw - dw) / 2),
    Math.round(ry + (rh - dh) / 2),
    Math.round(dw),
    Math.round(dh)
  );
}

// Bestmöglicher unterstützter WebM-Codec für die Video-Aufnahme.
function pickVideoMime(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  if (typeof MediaRecorder !== "undefined") {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
  }
  return "video/webm";
}

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    columns,
    rows,
    width,
    height,
    cornerRadius,
    selectedShapes,
    selectedColors,
    seed,
    format,
    areas,
    inputValues,
    side,
    logoEnabled,
    logoMode,
    animate,
    loopDuration,
    gridResolution,
    dotSize,
    dotVariation,
    setAreaPosition,
  } = useDesignStore();

  // ref hält immer die aktuellen Werte, ohne p5 neu erstellen zu müssen
  const paramsRef = useRef({
    columns,
    rows,
    width,
    height,
    cornerRadius,
    selectedShapes,
    selectedColors,
    seed,
    format,
    areas,
    inputValues,
    side,
    logoEnabled,
    logoMode,
    animate,
    loopDuration,
    gridResolution,
    dotSize,
    dotVariation,
  });
  paramsRef.current = {
    columns,
    rows,
    width,
    height,
    cornerRadius,
    selectedShapes,
    selectedColors,
    seed,
    format,
    areas,
    inputValues,
    side,
    logoEnabled,
    logoMode,
    animate,
    loopDuration,
    gridResolution,
    dotSize,
    dotVariation,
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Im äußeren Scope (statt nur innerhalb des p5-Sketches), damit die
    // Drag&Drop-Listener unten beim Cleanup wieder entfernt werden können.
    let canvasElt: HTMLElement | undefined;

    function fittedSize() {
      const { width, height, cornerRadius, format } = paramsRef.current;
      const stacked = hasSides(format);
      const layout = getSideLayout(format);
      const gap = stacked ? (layout === "row" ? width : height) * STACK_GAP_RATIO : 0;
      const totalW = stacked && layout === "row" ? width * 2 + gap : width;
      const totalH = stacked && layout === "column" ? height * 2 + gap : height;
      const maxW = containerRef.current!.clientWidth;
      const maxH = containerRef.current!.clientHeight;
      const scale = Math.min(maxW / totalW, maxH / totalH);
      return {
        w: Math.round(totalW * scale),
        h: Math.round(totalH * scale),
        sideW: Math.round(width * scale),
        sideH: Math.round(height * scale),
        gap: gap * scale,
        cornerRadius: cornerRadius * scale,
        stacked,
        layout,
      };
    }

    // Liefert für eine Seite ("front"/"back"/undefined bei einseitigen
    // Formaten) den Versatz und die Größe ihrer Teilfläche innerhalb der
    // sichtbaren Gesamt-Canvas – exakt wie p.image(frontGfx/backGfx, ...) sie
    // platziert. Wird fürs Drag&Drop-Hit-Testing gebraucht.
    function sideRegion(side: Side | undefined, fitted: ReturnType<typeof fittedSize>) {
      if (!fitted.stacked || !side) {
        return { offsetX: 0, offsetY: 0, w: fitted.w, h: fitted.h };
      }
      if (side === "front") return { offsetX: 0, offsetY: 0, w: fitted.sideW, h: fitted.sideH };
      if (fitted.layout === "row") {
        return { offsetX: fitted.sideW + fitted.gap, offsetY: 0, w: fitted.sideW, h: fitted.sideH };
      }
      return { offsetX: 0, offsetY: fitted.sideH + fitted.gap, w: fitted.sideW, h: fitted.sideH };
    }

    // Welche Seite ("front"/"back") liegt unter den gegebenen Canvas-Koordinaten?
    // Bei einseitigen Formaten gibt es nur eine "Seite" (undefined).
    function hitSide(x: number, y: number, fitted: ReturnType<typeof fittedSize>): Side | undefined {
      if (!fitted.stacked) return undefined;
      const front = sideRegion("front", fitted);
      if (x >= front.offsetX && x <= front.offsetX + front.w && y >= front.offsetY && y <= front.offsetY + front.h) {
        return "front";
      }
      return "back";
    }

    type DragState = { id: string; side: Side | undefined; w: number; h: number; grabDx: number; grabDy: number };
    let dragState: DragState | null = null;

    function clientToCanvas(clientX: number, clientY: number) {
      const rect = canvasElt!.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    // Areas gehören bei zweiseitigen Formaten zu genau einer Seite (siehe
    // AreaDef.side) – nur die zur angeklickten Seite passenden Areas zählen
    // beim Hit-Testing, sonst ließe sich eine Rückseiten-Area über die
    // Vorderseite greifen.
    function areasForSide(side: Side | undefined) {
      const all = paramsRef.current.areas;
      if (!hasSides(paramsRef.current.format)) return all;
      return all.filter((a) => (a.side ?? "front") === side);
    }

    function findAreaAt(localX: number, localY: number, regionW: number, regionH: number, side: Side | undefined) {
      // Dieselbe Auto-Größe wie beim Zeichnen (siehe resolveOverlayAreas in
      // grid.ts): Hit-Testing braucht denselben p5/Font-Zugriff zur Messung,
      // damit die Drag-Box exakt der gerenderten Box entspricht.
      const resolved = resolveOverlayAreas(instance, areasForSide(side), regionW, regionH, getFontProvider(instance));
      for (let i = resolved.length - 1; i >= 0; i--) {
        const r = resolved[i];
        if (localX >= r.x && localX <= r.x + r.w && localY >= r.y && localY <= r.y + r.h) {
          return r;
        }
      }
      return undefined;
    }

    // Text-/Bild-Areas lassen sich per Drag&Drop auf der Canvas verschieben –
    // der Algorithmus (Ausschlusszone für die generativen Shapes) folgt der
    // neuen Position automatisch, da resolveOverlayAreas() bei jedem Zeichnen
    // neu aus dem Store gelesen wird.
    function handleMouseDown(e: MouseEvent) {
      const fitted = fittedSize();
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      const side = hitSide(x, y, fitted);
      const region = sideRegion(side, fitted);
      const localX = x - region.offsetX;
      const localY = y - region.offsetY;
      const hit = findAreaAt(localX, localY, region.w, region.h, side);
      if (!hit) return;
      dragState = {
        id: hit.area.id,
        side,
        w: hit.w,
        h: hit.h,
        grabDx: localX - hit.x,
        grabDy: localY - hit.y,
      };
      canvasElt!.style.cursor = "grabbing";
      e.preventDefault();
    }

    function handleMouseMove(e: MouseEvent) {
      const fitted = fittedSize();
      const { x, y } = clientToCanvas(e.clientX, e.clientY);

      if (!dragState) {
        // Nur Hover-Cursor aktualisieren, solange nicht gezogen wird.
        if (x < 0 || y < 0 || x > fitted.w || y > fitted.h) {
          canvasElt!.style.cursor = "default";
          return;
        }
        const side = hitSide(x, y, fitted);
        const region = sideRegion(side, fitted);
        const hit = findAreaAt(x - region.offsetX, y - region.offsetY, region.w, region.h, side);
        canvasElt!.style.cursor = hit ? "grab" : "default";
        return;
      }

      const region = sideRegion(dragState.side, fitted);
      const localX = x - region.offsetX - dragState.grabDx;
      const localY = y - region.offsetY - dragState.grabDy;
      const marginX = region.w * AREA_DRAG_MARGIN_RATIO;
      const marginY = region.h * AREA_DRAG_MARGIN_RATIO;
      const clampedX = Math.min(Math.max(localX, marginX), Math.max(marginX, region.w - dragState.w - marginX));
      const clampedY = Math.min(Math.max(localY, marginY), Math.max(marginY, region.h - dragState.h - marginY));
      setAreaPosition(dragState.id, clampedX / region.w, clampedY / region.h);
    }

    function handleMouseUp() {
      if (!dragState) return;
      dragState = null;
      canvasElt!.style.cursor = "default";
    }

    // Rohbilder (unverändertes schwarzes Silhouetten-SVG) pro Shape-Id.
    const rawImages = new Map<string, HTMLImageElement>();
    const loadingRaw = new Set<string>();
    // Statische Punktgitter, gecacht pro "shapeId|Farbe|Auflösung|…|Seed".
    const tintedCache = new Map<string, p5.Image>();
    // Da das Punktmuster jetzt vom globalen Seed abhängt (Shuffle ändert die
    // Textur), würde der Cache sonst über viele Shuffles unbegrenzt wachsen –
    // beim Seed-Wechsel wird er deshalb geleert.
    let tintedCacheSeed: number | undefined;
    // Animierte Punktgitter werden pro Frame neu gezeichnet; dieser Cache
    // teilt identische (Shape|Farbe|…) nur innerhalb desselben Frames und wird
    // beim Phasenwechsel geleert, damit nicht pro Frame unbegrenzt Bilder
    // wachsen (gerade bei großen Buckets sonst ein Speicherproblem).
    const animFrameCache = new Map<string, p5.Image>();
    let animFrameToken: number | undefined;

    function ensureRawLoaded(ids: string[]) {
      for (const id of ids) {
        if (rawImages.has(id) || loadingRaw.has(id)) continue;
        // Das volle Logo (synthetische Shape) hat seine eigene Quelle; sonst die
        // Datei der jeweiligen Shape.
        const src = id === FULL_LOGO_SHAPE_ID ? FULL_LOGO_SRC : shapes.find((s) => s.id === id)?.src;
        if (!src) continue;
        loadingRaw.add(id);

        // p.loadImage() decodes via createImageBitmap() on a Blob without a
        // MIME type, which fails to decode SVGs in some browsers. Loading
        // through a native <img> element avoids that and is decoded reliably.
        const htmlImg = new window.Image();
        htmlImg.onload = () => {
          rawImages.set(id, htmlImg);
          loadingRaw.delete(id);
        };
        htmlImg.onerror = () => {
          loadingRaw.delete(id);
        };
        htmlImg.src = src;
      }
    }

    // p5.tint() + image() is broken for the 2D renderer in this p5 version
    // (states.tint is a Color object, but the renderer treats it like a
    // plain [r,g,b,a] array internally and throws). Baking the color into
    // the bitmap ourselves via canvas compositing avoids that path entirely.
    function getTintedImage(
      p: p5,
      id: string,
      colorHex: string,
      targetSize = 512,
      gridResolution = 5,
      dotSize = 4,
      time?: number
    ): p5.Image | undefined {
      const raw = rawImages.get(id);
      if (!raw) return undefined;

      // Auflösung auf die nächste 2er-Potenz der Anzeigegröße runden (256..2048):
      // große Shapes werden scharf gerastert, kleine kosten keinen unnötigen
      // Speicher, und es entstehen nur wenige gecachte Stufen.
      const bucket = Math.min(2048, Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, targetSize)))));
      const longSide = Math.max(raw.naturalWidth, raw.naturalHeight) || 1;
      const scale = bucket / longSide;
      const w = Math.max(1, Math.round(raw.naturalWidth * scale));
      const h = Math.max(1, Math.round(raw.naturalHeight * scale));
      const cellCount = resolutionToCellCount(gridResolution);
      const dotRatio = dotSizeToRatio(dotSize);

      // Größen-/Farbvariation, Palette und globaler Seed kommen aus dem Store –
      // getTintedImage liest paramsRef live (wie der Provider die übrigen Werte
      // auch). Der globale Seed fließt in den Punkt-Seed ein, damit „Shuffle“
      // auch die Textur (und nicht nur Platzierung/Farben) verändert.
      const { seed: globalSeed, dotVariation } = paramsRef.current;
      const variation = sliderToAmount(dotVariation);
      const seed = strSeed(`${id}|${colorHex}|${globalSeed}`);
      const key = `${id}|${colorHex}|${bucket}|${gridResolution}|${dotSize}|${dotVariation}`;

      const buildOptions = (phase?: number): DotGridOptions => ({
        baseColor: colorHex,
        cellCount,
        dotRatio,
        variation,
        seed,
        phase,
      });

      // Stale Texturen verwerfen, sobald sich der globale Seed ändert.
      if (tintedCacheSeed !== globalSeed) {
        tintedCache.clear();
        tintedCacheSeed = globalSeed;
      }

      // Statisch (keine Animation): dauerhaft cachen, da unverändert.
      if (time === undefined) {
        const cached = tintedCache.get(key);
        if (cached) return cached;
        const pImg = p.createImage(w, h);
        const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
        drawDotGrid(ctx, raw, w, h, buildOptions());
        tintedCache.set(key, pImg);
        return pImg;
      }

      // Animiert: Punkte pulsieren mit der Phase. Pro Frame (= Phase) wird jedes
      // (Shape|Farbe|…) nur einmal gerendert und über alle Instanzen geteilt;
      // beim Phasenwechsel wird der Frame-Cache geleert.
      if (animFrameToken !== time) {
        animFrameCache.clear();
        animFrameToken = time;
      }
      const cachedFrame = animFrameCache.get(key);
      if (cachedFrame) return cachedFrame;
      const pImg = p.createImage(w, h);
      const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
      drawDotGrid(ctx, raw, w, h, buildOptions(time));
      animFrameCache.set(key, pImg);
      return pImg;
    }

    // Logo (fest, beide Farbvarianten), unabhängig von der Shape-Auswahl.
    const logoImages: LogoImages = {};

    function loadLogoVariant(p: p5, src: string, onLoaded: (img: p5.Image) => void) {
      const htmlImg = new window.Image();
      htmlImg.onload = () => {
        const pImg = p.createImage(htmlImg.naturalWidth, htmlImg.naturalHeight);
        (pImg as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext.drawImage(
          htmlImg,
          0,
          0
        );
        onLoaded(pImg);
      };
      htmlImg.src = src;
    }

    // Hochgeladene Fotos für Bild-Areas, pro Area-Id.
    const areaPhotoImages = new Map<string, HTMLImageElement>();
    const loadingAreaPhotos = new Set<string>();
    // Hochgeladene Videos für Video-Areas, pro Area-Id – spielen im
    // Hintergrund endlos in einer Loop, damit beim Zeichnen jederzeit ein
    // aktuelles Frame zur Verfügung steht.
    const areaVideoElements = new Map<string, HTMLVideoElement>();
    const loadingAreaVideos = new Set<string>();
    // Fertige Komposite, gecacht pro "areaId|w|h". Bei Fotos bleibt der Eintrag
    // unverändert (Foto ändert sich nie); bei Videos wird derselbe Pixel-
    // Puffer wiederverwendet, aber bei jedem Aufruf mit dem aktuellen Frame
    // neu bemalt (siehe isVideo-Zweig unten).
    const areaMaskedCache = new Map<string, p5.Image>();
    // Hintergrund-Komposite (Foto/Video "cover"-skaliert, ohne Maske), pro "areaId|w|h".
    const areaBgCache = new Map<string, p5.Image>();

    function ensureAreaPhotosLoaded(areaList: AreaDef[]) {
      for (const area of areaList) {
        if (area.kind !== "image" || !area.imageDataUrl) continue;
        if (areaPhotoImages.has(area.id) || loadingAreaPhotos.has(area.id)) continue;
        loadingAreaPhotos.add(area.id);

        const htmlImg = new window.Image();
        htmlImg.onload = () => {
          areaPhotoImages.set(area.id, htmlImg);
          loadingAreaPhotos.delete(area.id);
        };
        htmlImg.onerror = () => {
          loadingAreaPhotos.delete(area.id);
        };
        htmlImg.src = area.imageDataUrl;
      }
    }

    function ensureAreaVideosLoaded(areaList: AreaDef[]) {
      for (const area of areaList) {
        if (area.kind !== "video" || !area.videoUrl) continue;
        if (areaVideoElements.has(area.id) || loadingAreaVideos.has(area.id)) continue;
        loadingAreaVideos.add(area.id);

        const videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.src = area.videoUrl;
        videoEl.play().catch(() => {});
        areaVideoElements.set(area.id, videoEl);
        loadingAreaVideos.delete(area.id);
      }
    }

    // Liefert die Bildquelle einer Area (Foto-Element oder – falls schon genug
    // Frames geladen sind (readyState >= HAVE_CURRENT_DATA) – das Video-
    // Element selbst, das drawImage() direkt als aktuelles Frame akzeptiert.
    function getAreaMediaSource(area: AreaDef): HTMLImageElement | HTMLVideoElement | undefined {
      if (area.kind === "video") {
        const video = areaVideoElements.get(area.id);
        return video && video.readyState >= 2 ? video : undefined;
      }
      return areaPhotoImages.get(area.id);
    }

    function mediaSize(media: HTMLImageElement | HTMLVideoElement): { w: number; h: number } {
      if (media instanceof HTMLVideoElement) return { w: media.videoWidth, h: media.videoHeight };
      return { w: media.naturalWidth, h: media.naturalHeight };
    }

    // Foto/Video "cover"-skaliert in die Box zeichnen, dann mit der Shape-
    // Silhouette maskieren (destination-in) – die Shape füllt die Box
    // komplett aus ("sehr hoch skaliert"), das Motiv ist nur innerhalb ihrer
    // Form sichtbar. Bei Videos wird der Puffer (anders als bei Fotos) bei
    // jedem Aufruf neu mit dem aktuellen Frame bemalt.
    function getMaskedAreaImage(p: p5, area: AreaDef, w: number, h: number): p5.Image | undefined {
      const media = getAreaMediaSource(area);
      if (!media) return undefined;
      // Ohne shapeId ("No Shape") wird das Motiv nur cover-skaliert, ohne Maske.
      const mask = area.shapeId ? rawImages.get(area.shapeId) : undefined;
      if (area.shapeId && !mask) return undefined;

      const rw = Math.round(w);
      const rh = Math.round(h);
      const isVideo = area.kind === "video";
      const key = `${area.id}|${rw}|${rh}|${area.grayscale ? 1 : 0}`;

      let pImg = areaMaskedCache.get(key);
      if (pImg && !isVideo) return pImg;
      if (!pImg) {
        pImg = p.createImage(rw, rh);
        areaMaskedCache.set(key, pImg);
      }
      const { w: mediaW, h: mediaH } = mediaSize(media);
      if (mediaW <= 0 || mediaH <= 0) return isVideo ? undefined : pImg;

      const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D })
        .drawingContext;

      ctx.filter = area.grayscale ? "grayscale(1)" : "none";
      const mediaScale = Math.max(rw / mediaW, rh / mediaH);
      const pw = mediaW * mediaScale;
      const ph = mediaH * mediaScale;
      ctx.drawImage(media, (rw - pw) / 2, (rh - ph) / 2, pw, ph);
      ctx.filter = "none";

      if (mask) {
        ctx.globalCompositeOperation = "destination-in";
        const maskScale = Math.max(rw / mask.naturalWidth, rh / mask.naturalHeight);
        const mw = mask.naturalWidth * maskScale;
        const mh = mask.naturalHeight * maskScale;
        ctx.drawImage(mask, (rw - mw) / 2, (rh - mh) / 2, mw, mh);
        ctx.globalCompositeOperation = "source-over";
      }

      return pImg;
    }

    // Foto/Video "cover"-skaliert in eine w×h-Fläche (ohne Maske) – für
    // Hintergrund-Areas, die den kompletten Rahmen füllen.
    function getBackgroundCoverImage(
      p: p5,
      area: AreaDef,
      w: number,
      h: number
    ): p5.Image | undefined {
      const media = getAreaMediaSource(area);
      if (!media) return undefined;

      const rw = Math.round(w);
      const rh = Math.round(h);
      const isVideo = area.kind === "video";
      const key = `${area.id}|${rw}|${rh}|${area.grayscale ? 1 : 0}`;

      let pImg = areaBgCache.get(key);
      if (pImg && !isVideo) return pImg;
      if (!pImg) {
        pImg = p.createImage(rw, rh);
        areaBgCache.set(key, pImg);
      }
      const { w: mediaW, h: mediaH } = mediaSize(media);
      if (mediaW <= 0 || mediaH <= 0) return isVideo ? undefined : pImg;

      const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D })
        .drawingContext;
      ctx.filter = area.grayscale ? "grayscale(1)" : "none";
      const scale = Math.max(rw / mediaW, rh / mediaH);
      const pw = mediaW * scale;
      const ph = mediaH * scale;
      ctx.drawImage(media, (rw - pw) / 2, (rh - ph) / 2, pw, ph);
      ctx.filter = "none";

      return pImg;
    }

    // Bei Formaten mit Vorder-/Rückseite werden beide Seiten in eigene
    // Offscreen-Graphics gezeichnet und dann untereinander auf das
    // sichtbare Canvas komponiert.
    let frontGfx: p5.Graphics | undefined;
    let backGfx: p5.Graphics | undefined;

    // Während der Video-Aufnahme pausiert die sichtbare Render-Schleife, damit
    // die gesamte Rechenzeit in gleichmäßige Export-Frames fließt.
    let exportingVideo = false;

    // Animationsphase des zuletzt gezeichneten sichtbaren Frames – damit ein
    // Screenshot exakt den gerade laufenden Stand einfriert (statt neu zu
    // würfeln), liest exportRegistry.renderFrame diesen Wert mit aus.
    let currentPhase: number | undefined;

    // Mockup-Formate (z.B. T-Shirt): Produktfoto füllt die Canvas, die
    // generative Komposition wird in die Design-Zone (Brust) gerechnet.
    const mockupImages = new Map<string, p5.Image>();
    const loadingMockups = new Set<string>();
    let designGfx: p5.Graphics | undefined; // gecachtes Design-Graphics fürs Live-Rendering
    let maskedGfx: p5.Graphics | undefined; // gecachtes, auf die Mockup-Silhouette maskiertes Design

    function ensureMockupLoaded(p: p5, src: string) {
      if (mockupImages.has(src) || loadingMockups.has(src)) return;
      loadingMockups.add(src);
      const htmlImg = new window.Image();
      htmlImg.onload = () => {
        const pImg = p.createImage(htmlImg.naturalWidth, htmlImg.naturalHeight);
        (pImg as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext.drawImage(
          htmlImg,
          0,
          0
        );
        mockupImages.set(src, pImg);
        loadingMockups.delete(src);
      };
      htmlImg.onerror = () => loadingMockups.delete(src);
      htmlImg.src = src;
    }

    // Zeichnet die Komposition auf `target`. Mockup-Formate: Produktfoto
    // bildschirmfüllend + Design in die Design-Zone. Sonst normales drawGrid.
    // `cached` nutzt im Live-Betrieb ein wiederverwendetes Design-Graphics
    // (statt es pro Frame neu zu allokieren); Exporte erzeugen ein Einweg-Graphics.
    function drawComposition(
      p5i: p5,
      target: p5,
      w: number,
      h: number,
      drawParams: Parameters<typeof drawGrid>[1],
      cached: boolean
    ) {
      const fmt = FORMAT_SIZES[(drawParams.format as string) ?? ""];
      const panels = fmt?.mockups;
      if (!panels || panels.length === 0) {
        drawGrid(target, drawParams);
        return;
      }

      // Weißer Untergrund + jedes Shirt-Foto in seine (gleich breite) Spalte.
      target.imageMode(target.CORNER);
      target.background(255);
      const colW = w / panels.length;

      panels.forEach((panel, i) => {
        ensureMockupLoaded(p5i, panel.src);
        const shirt = mockupImages.get(panel.src);
        if (shirt) {
          // Foto mittig in seiner Spalte, optional etwas vergrößert (imageScale).
          const s = panel.imageScale ?? 1;
          const dw = colW * s;
          const dh = h * s;
          const colCx = i * colW + colW / 2;
          target.image(
            shirt,
            Math.round(colCx - dw / 2),
            Math.round(h / 2 - dh / 2),
            Math.round(dw),
            Math.round(dh)
          );
        }

        const rx = Math.round(w * panel.region.x);
        const ry = Math.round(h * panel.region.y);
        const rw = Math.max(1, Math.round(w * panel.region.w));
        const rh = Math.max(1, Math.round(h * panel.region.h));

        // "logo": nur das ausgewählte Logo/Icon in die Region.
        if (panel.content === "logo") {
          drawLogoOnly(target, drawParams, rx, ry, rw, rh);
          return;
        }

        // "full": komplette Komposition (Shapes/Animation/Logo) in ein
        // Graphics rendern, optional auf eine Silhouette maskieren, dann in die
        // Region komponieren. Das gecachte designGfx/maskedGfx wird vom
        // (einzigen) Full-Panel genutzt.
        let dg: p5.Graphics;
        if (cached) {
          if (!designGfx || designGfx.width !== rw || designGfx.height !== rh) {
            designGfx?.remove();
            designGfx = p5i.createGraphics(rw, rh);
          }
          dg = designGfx;
        } else {
          dg = p5i.createGraphics(rw, rh);
        }
        drawGrid(dg, drawParams);

        let toComposite: p5.Graphics | p5.Image = dg;
        if (panel.maskSrc) {
          ensureMockupLoaded(p5i, panel.maskSrc);
          const maskImg = mockupImages.get(panel.maskSrc);
          if (maskImg) {
            let mg: p5.Graphics;
            if (cached) {
              if (!maskedGfx || maskedGfx.width !== rw || maskedGfx.height !== rh) {
                maskedGfx?.remove();
                maskedGfx = p5i.createGraphics(rw, rh);
              }
              mg = maskedGfx;
            } else {
              mg = p5i.createGraphics(rw, rh);
            }
            mg.clear();
            mg.imageMode(mg.CORNER);
            mg.image(dg, 0, 0, rw, rh);
            const ctx = (mg as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
            ctx.globalCompositeOperation = "destination-in";
            mg.image(
              maskImg,
              0,
              0,
              rw,
              rh,
              panel.region.x * maskImg.width,
              panel.region.y * maskImg.height,
              panel.region.w * maskImg.width,
              panel.region.h * maskImg.height
            );
            ctx.globalCompositeOperation = "source-over";
            toComposite = mg;
          }
        }

        target.image(toComposite, rx, ry, rw, rh);

        if (!cached) {
          dg.remove();
          if (toComposite !== dg) (toComposite as p5.Graphics).remove();
        }
      });
    }

    // Google Font (siehe lib/fonts.ts) wird pro benötigtem Weight einzeln
    // geladen (siehe lib/textStyles.ts für die verwendeten Weights). Cache ist
    // nach der vollen URL (statt nur nach Weight) geschlüsselt, damit ein
    // Wechsel der Schriftart in lib/fonts.ts auch ohne Hard-Reload greift.
    const WEIGHTS = [...new Set(Object.values(TEXT_STYLES).map((s) => s.weight))];
    const fontCache = new Map<string, p5.Font>();
    const loadingUrls = new Set<string>();

    function ensureFontWeightLoaded(p: p5, weight: number) {
      const url = getGoogleFontUrl(weight);
      if (fontCache.has(url) || loadingUrls.has(url)) return;
      loadingUrls.add(url);
      // p5 v2's loadFont() ruft die Success/Error-Callbacks nur für direkte
      // Font-Dateien auf – bei einer Google-Fonts-CSS2-URL (unser Fall) wird
      // intern nur das zurückgegebene Promise aufgelöst, die Callbacks bleiben
      // ungenutzt. Deshalb hier auf das Promise statt auf Callbacks verlassen.
      p.loadFont(url).then(
        (font) => {
          fontCache.set(url, font);
          loadingUrls.delete(url);
        },
        () => {
          loadingUrls.delete(url);
        }
      );
    }

    function getFontProvider(p: p5) {
      for (const weight of WEIGHTS) ensureFontWeightLoaded(p, weight);
      return (weight: number) => fontCache.get(getGoogleFontUrl(weight));
    }

    const instance = new p5((p: p5) => {
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex, targetSize, time) =>
          getTintedImage(p, id, colorHex, targetSize, paramsRef.current.gridResolution, paramsRef.current.dotSize, time),
      };
      const areaImages: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(p, area, w, h),
        getBackgroundImage: (area, w, h) => getBackgroundCoverImage(p, area, w, h),
      };

      p.setup = () => {
        const { w, h, cornerRadius } = fittedSize();
        canvasElt = p.createCanvas(w, h).elt;
        canvasElt.style.borderRadius = `${cornerRadius}px`;
        logoImages.logo = {};
        logoImages.icon = {};
        loadLogoVariant(p, "/logoShapes/Logo_NRLY_Black.svg", (img) => {
          logoImages.logo!.black = img;
        });
        loadLogoVariant(p, "/logoShapes/Logo_NRLY_White.svg", (img) => {
          logoImages.logo!.white = img;
        });
        loadLogoVariant(p, "/logoShapes/Logo_NRLY_Icon_Black.png", (img) => {
          logoImages.icon!.black = img;
        });
        loadLogoVariant(p, "/logoShapes/Logo_NRLY_Icon_White.svg", (img) => {
          logoImages.icon!.white = img;
        });

        canvasElt.addEventListener("mousedown", handleMouseDown);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      };
      p.draw = () => {
        if (exportingVideo) return; // sichtbare Schleife während des Exports anhalten
        const { w, h, sideW, sideH, gap, stacked, layout, cornerRadius } = fittedSize();
        if (p.width !== w || p.height !== h) {
          p.resizeCanvas(w, h);
        }
        canvasElt!.style.borderRadius = `${cornerRadius}px`;
        const areaShapeIds = paramsRef.current.areas
          .filter((a): a is AreaDef & { shapeId: string } => !!a.shapeId)
          .map((a) => a.shapeId);
        ensureRawLoaded([...paramsRef.current.selectedShapes, FULL_LOGO_SHAPE_ID, ...areaShapeIds]);
        ensureAreaPhotosLoaded(paramsRef.current.areas);
        ensureAreaVideosLoaded(paramsRef.current.areas);
        const fontProvider = getFontProvider(p);

        // Animations-Phase aus der Echtzeit ableiten; bei ausgeschalteter
        // Animation bleibt time undefined und drawGrid zeichnet statisch.
        const { animate, loopDuration } = paramsRef.current;
        const time =
          animate && loopDuration > 0 ? (p.millis() / 1000 / loopDuration) % 1 : undefined;
        currentPhase = time;

        if (stacked) {
          if (!frontGfx || frontGfx.width !== sideW || frontGfx.height !== sideH) {
            frontGfx?.remove();
            backGfx?.remove();
            frontGfx = p.createGraphics(sideW, sideH);
            backGfx = p.createGraphics(sideW, sideH);
          }
          drawGrid(frontGfx!, { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider, side: "front", time });
          drawGrid(backGfx!, { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider, side: "back", time });
          p.clear();
          p.imageMode(p.CORNER);
          p.image(frontGfx!, 0, 0, sideW, sideH);
          if (layout === "row") {
            p.image(backGfx!, sideW + gap, 0, sideW, sideH);
          } else {
            p.image(backGfx!, 0, sideH + gap, sideW, sideH);
          }
        } else {
          drawComposition(
            p,
            p,
            w,
            h,
            { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider, time },
            true
          );
        }
      };
    }, containerRef.current);

    // Rendert einen Stand in voller Export-Auflösung (unabhängig von der
    // sichtbaren, skalierten Canvas-Größe). `time` undefined = statischer
    // Stand (normaler Export), gesetzt = eingefrorene Animationsphase
    // (Screenshot der laufenden Animation).
    function renderSnapshot(overrideSide?: Side, time?: number) {
      const {
        columns,
        rows,
        width,
        height,
        cornerRadius,
        selectedShapes,
        selectedColors,
        seed,
        format,
        areas,
        inputValues,
        side,
        logoEnabled,
        logoMode,
        gridResolution,
        dotSize,
      } = paramsRef.current;
      const gfx = instance.createGraphics(width, height);
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex, targetSize, time) =>
          getTintedImage(instance, id, colorHex, targetSize, gridResolution, dotSize, time),
      };
      const areaImages: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(instance, area, w, h),
        getBackgroundImage: (area, w, h) => getBackgroundCoverImage(instance, area, w, h),
      };
      drawComposition(
        instance,
        gfx,
        width,
        height,
        {
          columns,
          rows,
          selectedShapes,
          selectedColors,
          shapeImages,
          seed,
          format,
          logoImages,
          logoEnabled,
          logoMode,
          areas,
          areaImages,
          inputValues,
          fontProvider: getFontProvider(instance),
          side: overrideSide ?? side,
          time,
        },
        false
      );
      // Formate mit abgerundeten Ecken (z.B. Skateboard) auf ihre Silhouette
      // beschneiden, damit der Export tatsächlich die Form hat (transparente
      // Ecken) statt eines Rechtecks. In der Vorschau macht das die CSS-
      // border-radius; die exportierten Pixel brauchen den echten Zuschnitt.
      if (cornerRadius > 0) {
        const ctx = (gfx as unknown as { drawingContext: CanvasRenderingContext2D }).drawingContext;
        ctx.save();
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        ctx.roundRect(0, 0, width, height, cornerRadius);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.restore();
      }
      const dataUrl = (gfx.elt as HTMLCanvasElement).toDataURL("image/png");
      gfx.remove();
      return { dataUrl, width, height };
    }

    exportRegistry.render = (overrideSide) => renderSnapshot(overrideSide);
    exportRegistry.renderFrame = (overrideSide) => renderSnapshot(overrideSide, currentPhase);

    // Nimmt eine nahtlose Animations-Schleife in voller Format-Auflösung als
    // WebM auf. Es wird in Echtzeit in ein Offscreen-Graphics gezeichnet und
    // dessen Canvas-Stream via MediaRecorder mitgeschnitten (eine 4s-Schleife
    // dauert also ~4s).
    exportRegistry.renderVideo = ({ duration, fps = 30, side: overrideSide, onProgress }) => {
      const params = paramsRef.current;
      const { width, height } = params;
      const gfx = instance.createGraphics(width, height);
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex, targetSize, time) =>
          getTintedImage(instance, id, colorHex, targetSize, params.gridResolution, params.dotSize, time),
      };
      const areaImagesLocal: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(instance, area, w, h),
        getBackgroundImage: (area, w, h) => getBackgroundCoverImage(instance, area, w, h),
      };
      const fontProvider = getFontProvider(instance);

      // Assets, die ggf. noch laden, anstoßen, bevor aufgenommen wird.
      const areaShapeIds = params.areas
        .filter((a): a is AreaDef & { shapeId: string } => !!a.shapeId)
        .map((a) => a.shapeId);
      ensureRawLoaded([...params.selectedShapes, FULL_LOGO_SHAPE_ID, ...areaShapeIds]);
      ensureAreaPhotosLoaded(params.areas);
      ensureAreaVideosLoaded(params.areas);

      const drawFrame = (phase: number) => {
        drawComposition(
          instance,
          gfx,
          width,
          height,
          {
            ...params,
            shapeImages,
            logoImages,
            areaImages: areaImagesLocal,
            fontProvider,
            side: overrideSide ?? params.side,
            time: phase,
          },
          false
        );
      };

      const totalFrames = Math.max(1, Math.round(duration * fps));
      const frameMs = 1000 / fps;

      // Sichtbare Schleife anhalten und den ersten Frame vorzeichnen.
      exportingVideo = true;
      drawFrame(0);

      // Manuelles Frame-Capturing (captureStream(0) + requestFrame): jeder
      // gezeichnete Frame wird gezielt – gleichmäßig getaktet – in den Stream
      // geschoben, statt den Canvas in Echtzeit abzutasten. Das ergibt eine
      // konstante Bildrate ohne Ruckeln/Doppelframes.
      const stream = (gfx.elt as HTMLCanvasElement).captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const mimeType = pickVideoMime();
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      return new Promise<Blob>((resolve) => {
        // Genau einmal abschließen – egal ob normaler Stop oder Recorder-Fehler
        // –, damit Graphics + sichtbare Schleife aufgeräumt werden und die UI
        // nie hängen bleibt.
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          exportingVideo = false;
          gfx.remove();
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.onstop = finish;
        recorder.onerror = finish;

        recorder.start();
        let f = 0;
        const drawNext = () => {
          if (settled) return;
          drawFrame(f / totalFrames);
          track.requestFrame?.();
          f++;
          onProgress?.(f / totalFrames);
          if (f >= totalFrames) {
            setTimeout(() => {
              try {
                recorder.requestData?.();
                recorder.stop();
              } catch {
                finish();
              }
            }, frameMs);
            return;
          }
          setTimeout(drawNext, frameMs);
        };
        setTimeout(drawNext, frameMs);
      });
    };

    // Aufnahme mit offenem Ende (Record/Stop statt fester Dauer): nutzt
    // dieselbe Offscreen-Graphics + manuelles Frame-Capturing wie
    // renderVideo oben, treibt die Animationsphase aber per Echtzeit-Uhr an
    // (statt einer vorab berechneten Gesamt-Frameanzahl) und läuft, bis
    // stopRecording() aufgerufen wird.
    let activeRecording: {
      gfx: ReturnType<typeof instance.createGraphics>;
      recorder: MediaRecorder;
      chunks: BlobPart[];
      mimeType: string;
      timeoutId: number;
    } | null = null;

    exportRegistry.startRecording = (options) => {
      if (activeRecording) return;
      const fps = options?.fps ?? 30;
      const overrideSide = options?.side;
      const params = paramsRef.current;
      const { width, height, loopDuration, animate } = params;
      const gfx = instance.createGraphics(width, height);
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex, targetSize, time) =>
          getTintedImage(instance, id, colorHex, targetSize, params.gridResolution, params.dotSize, time),
      };
      const areaImagesLocal: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(instance, area, w, h),
        getBackgroundImage: (area, w, h) => getBackgroundCoverImage(instance, area, w, h),
      };
      const fontProvider = getFontProvider(instance);
      const areaShapeIds = params.areas
        .filter((a): a is AreaDef & { shapeId: string } => !!a.shapeId)
        .map((a) => a.shapeId);
      ensureRawLoaded([...params.selectedShapes, FULL_LOGO_SHAPE_ID, ...areaShapeIds]);
      ensureAreaPhotosLoaded(params.areas);
      ensureAreaVideosLoaded(params.areas);

      const drawFrame = (phase: number | undefined) => {
        drawComposition(
          instance,
          gfx,
          width,
          height,
          {
            ...params,
            shapeImages,
            logoImages,
            areaImages: areaImagesLocal,
            fontProvider,
            side: overrideSide ?? params.side,
            time: phase,
          },
          false
        );
      };

      // Anders als bei renderVideo wird die sichtbare Schleife hier NICHT
      // angehalten (kein exportingVideo = true): Aufnahme läuft parallel zur
      // normalen, in Echtzeit weiterlaufenden Vorschau, damit man sieht, was
      // gerade aufgenommen wird, und weiß, wann man stoppen will.
      const startMs = performance.now();
      drawFrame(animate && loopDuration > 0 ? 0 : undefined);

      const stream = (gfx.elt as HTMLCanvasElement).captureStream(0);
      const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const mimeType = pickVideoMime();
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      const frameMs = 1000 / fps;
      const tick = () => {
        if (!activeRecording) return;
        const elapsedSec = (performance.now() - startMs) / 1000;
        const phase = animate && loopDuration > 0 ? (elapsedSec / loopDuration) % 1 : undefined;
        drawFrame(phase);
        track.requestFrame?.();
        activeRecording.timeoutId = window.setTimeout(tick, frameMs);
      };

      activeRecording = { gfx, recorder, chunks, mimeType, timeoutId: window.setTimeout(tick, frameMs) };
      recorder.start();
    };

    exportRegistry.stopRecording = () => {
      return new Promise<Blob>((resolve) => {
        if (!activeRecording) {
          resolve(new Blob());
          return;
        }
        const { gfx, recorder, chunks, mimeType, timeoutId } = activeRecording;
        window.clearTimeout(timeoutId);
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          gfx.remove();
          activeRecording = null;
          resolve(new Blob(chunks, { type: mimeType }));
        };
        recorder.onstop = finish;
        recorder.onerror = finish;
        try {
          recorder.requestData?.();
          recorder.stop();
        } catch {
          finish();
        }
      });
    };

    return () => {
      exportRegistry.render = null;
      exportRegistry.renderVideo = null;
      exportRegistry.renderFrame = null;
      if (activeRecording) {
        window.clearTimeout(activeRecording.timeoutId);
        activeRecording.gfx.remove();
        activeRecording = null;
      }
      exportRegistry.startRecording = null;
      exportRegistry.stopRecording = null;
      canvasElt?.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      frontGfx?.remove();
      backGfx?.remove();
      designGfx?.remove();
      instance.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden flex items-center justify-center"
    />
  );
}
