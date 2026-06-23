"use client";

import { useEffect, useRef } from "react";
import p5 from "p5";
import useDesignStore from "@/store/designStore";
import { drawGrid, type ShapeImageProvider } from "@/algorithms/grid";
import { exportRegistry } from "@/lib/canvasExport";
import { shapes } from "@/lib/shapes";

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, rows, width, height, cornerRadius, selectedShapes, selectedColors, seed } =
    useDesignStore();

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
  };

  useEffect(() => {
    if (!containerRef.current) return;

    function fittedSize() {
      const { width, height, cornerRadius } = paramsRef.current;
      const maxW = containerRef.current!.clientWidth;
      const maxH = containerRef.current!.clientHeight;
      const scale = Math.min(maxW / width, maxH / height);
      return {
        w: Math.round(width * scale),
        h: Math.round(height * scale),
        cornerRadius: cornerRadius * scale,
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

    const instance = new p5((p: p5) => {
      let canvasElt: HTMLElement;

      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex) => getTintedImage(p, id, colorHex),
      };

      p.setup = () => {
        const { w, h, cornerRadius } = fittedSize();
        canvasElt = p.createCanvas(w, h).elt;
        canvasElt.style.borderRadius = `${cornerRadius}px`;
      };
      p.draw = () => {
        const { w, h, cornerRadius } = fittedSize();
        if (p.width !== w || p.height !== h) {
          p.resizeCanvas(w, h);
        }
        canvasElt.style.borderRadius = `${cornerRadius}px`;
        ensureRawLoaded(paramsRef.current.selectedShapes);
        drawGrid(p, { ...paramsRef.current, cornerRadius, shapeImages });
      };
    }, containerRef.current);

    exportRegistry.render = () => {
      const { columns, rows, width, height, cornerRadius, selectedShapes, selectedColors, seed } =
        paramsRef.current;
      const gfx = instance.createGraphics(width, height);
      const shapeImages: ShapeImageProvider = {
        isReady: (id) => rawImages.has(id),
        getImage: (id, colorHex) => getTintedImage(instance, id, colorHex),
      };
      drawGrid(gfx, {
        columns,
        rows,
        cornerRadius,
        selectedShapes,
        selectedColors,
        shapeImages,
        seed,
      });
      const dataUrl = (gfx.elt as HTMLCanvasElement).toDataURL("image/png");
      gfx.remove();
      return { dataUrl, width, height };
    };

    return () => {
      exportRegistry.render = null;
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
