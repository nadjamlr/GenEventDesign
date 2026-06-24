"use client";

import { useEffect, useRef } from "react";
import p5 from "p5";
import useDesignStore from "@/store/designStore";
import {
  drawGrid,
  type ShapeImageProvider,
  type LogoImages,
  type AreaImageProvider,
} from "@/algorithms/grid";
import { exportRegistry } from "@/lib/canvasExport";
import { shapes } from "@/lib/shapes";
import type { AreaDef } from "@/lib/areas";
import { hasSides, getSideLayout } from "@/lib/formats";
import { getGoogleFontUrl } from "@/lib/fonts";
import { TEXT_STYLES } from "@/lib/textStyles";

const STACK_GAP_RATIO = 0.04; // Abstand zwischen Vorder- und Rückseite, relativ zur Seitenhöhe

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
  };

  useEffect(() => {
    if (!containerRef.current) return;

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

    // Rohbilder (unverändertes schwarzes Silhouetten-SVG) pro Shape-Id.
    const rawImages = new Map<string, HTMLImageElement>();
    const loadingRaw = new Set<string>();
    // Eingefärbte Varianten, gecacht pro "shapeId|hexFarbe".
    const tintedCache = new Map<string, p5.Image>();

    function ensureRawLoaded(ids: string[]) {
      for (const id of ids) {
        if (rawImages.has(id) || loadingRaw.has(id)) continue;
        const shape = shapes.find((s) => s.id === id);
        if (!shape) continue;
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
        htmlImg.src = shape.src;
      }
    }

    // p5.tint() + image() is broken for the 2D renderer in this p5 version
    // (states.tint is a Color object, but the renderer treats it like a
    // plain [r,g,b,a] array internally and throws). Baking the color into
    // the bitmap ourselves via canvas compositing avoids that path entirely.
    function getTintedImage(p: p5, id: string, colorHex: string): p5.Image | undefined {
      const raw = rawImages.get(id);
      if (!raw) return undefined;

      const key = `${id}|${colorHex}`;
      const cached = tintedCache.get(key);
      if (cached) return cached;

      const pImg = p.createImage(raw.naturalWidth, raw.naturalHeight);
      const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D })
        .drawingContext;
      ctx.drawImage(raw, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = colorHex;
      ctx.fillRect(0, 0, pImg.width, pImg.height);

      tintedCache.set(key, pImg);
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
    // Fertige, durch die Shape maskierte Komposite, gecacht pro "areaId|w|h".
    const areaMaskedCache = new Map<string, p5.Image>();

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

    // Foto "cover"-skaliert in die Box zeichnen, dann mit der Shape-Silhouette
    // maskieren (destination-in) – die Shape füllt die Box komplett aus
    // ("sehr hoch skaliert"), das Foto ist nur innerhalb ihrer Form sichtbar.
    function getMaskedAreaImage(p: p5, area: AreaDef, w: number, h: number): p5.Image | undefined {
      const photo = areaPhotoImages.get(area.id);
      const mask = area.shapeId ? rawImages.get(area.shapeId) : undefined;
      if (!photo || !mask) return undefined;

      const rw = Math.round(w);
      const rh = Math.round(h);
      const key = `${area.id}|${rw}|${rh}`;
      const cached = areaMaskedCache.get(key);
      if (cached) return cached;

      const pImg = p.createImage(rw, rh);
      const ctx = (pImg as unknown as { drawingContext: CanvasRenderingContext2D })
        .drawingContext;

      const photoScale = Math.max(rw / photo.naturalWidth, rh / photo.naturalHeight);
      const pw = photo.naturalWidth * photoScale;
      const ph = photo.naturalHeight * photoScale;
      ctx.drawImage(photo, (rw - pw) / 2, (rh - ph) / 2, pw, ph);

      ctx.globalCompositeOperation = "destination-in";
      const maskScale = Math.max(rw / mask.naturalWidth, rh / mask.naturalHeight);
      const mw = mask.naturalWidth * maskScale;
      const mh = mask.naturalHeight * maskScale;
      ctx.drawImage(mask, (rw - mw) / 2, (rh - mh) / 2, mw, mh);

      areaMaskedCache.set(key, pImg);
      return pImg;
    }

    // Bei Formaten mit Vorder-/Rückseite werden beide Seiten in eigene
    // Offscreen-Graphics gezeichnet und dann untereinander auf das
    // sichtbare Canvas komponiert.
    let frontGfx: p5.Graphics | undefined;
    let backGfx: p5.Graphics | undefined;

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
      p.loadFont(
        url,
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
      let canvasElt: HTMLElement;

      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex) => getTintedImage(p, id, colorHex),
      };
      const areaImages: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(p, area, w, h),
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
      };
      p.draw = () => {
        const { w, h, sideW, sideH, gap, stacked, layout, cornerRadius } = fittedSize();
        if (p.width !== w || p.height !== h) {
          p.resizeCanvas(w, h);
        }
        canvasElt.style.borderRadius = `${cornerRadius}px`;
        const areaShapeIds = paramsRef.current.areas
          .filter((a): a is AreaDef & { shapeId: string } => !!a.shapeId)
          .map((a) => a.shapeId);
        ensureRawLoaded([...paramsRef.current.selectedShapes, ...areaShapeIds]);
        ensureAreaPhotosLoaded(paramsRef.current.areas);
        const fontProvider = getFontProvider(p);

        if (stacked) {
          if (!frontGfx || frontGfx.width !== sideW || frontGfx.height !== sideH) {
            frontGfx?.remove();
            backGfx?.remove();
            frontGfx = p.createGraphics(sideW, sideH);
            backGfx = p.createGraphics(sideW, sideH);
          }
          drawGrid(frontGfx!, { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider, side: "front" });
          drawGrid(backGfx!, { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider, side: "back" });
          p.clear();
          p.imageMode(p.CORNER);
          p.image(frontGfx!, 0, 0, sideW, sideH);
          if (layout === "row") {
            p.image(backGfx!, sideW + gap, 0, sideW, sideH);
          } else {
            p.image(backGfx!, 0, sideH + gap, sideW, sideH);
          }
        } else {
          drawGrid(p, { ...paramsRef.current, shapeImages, logoImages, areaImages, fontProvider });
        }
      };
    }, containerRef.current);

    exportRegistry.render = (overrideSide) => {
      const {
        columns,
        rows,
        width,
        height,
        selectedShapes,
        selectedColors,
        seed,
        format,
        areas,
        inputValues,
        side,
        logoEnabled,
        logoMode,
      } = paramsRef.current;
      const gfx = instance.createGraphics(width, height);
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex) => getTintedImage(instance, id, colorHex),
      };
      const areaImages: AreaImageProvider = {
        getImage: (area, w, h) => getMaskedAreaImage(instance, area, w, h),
      };
      drawGrid(gfx, {
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
      });
      const dataUrl = (gfx.elt as HTMLCanvasElement).toDataURL("image/png");
      gfx.remove();
      return { dataUrl, width, height };
    };

    return () => {
      exportRegistry.render = null;
      frontGfx?.remove();
      backGfx?.remove();
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
