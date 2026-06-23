import type p5Types from "p5";

export type ShapeImageProvider = {
  isReady: (id: string) => boolean;
  getImage: (id: string, colorHex: string) => p5Types.Image | undefined;
};

type Params = {
  columns: number;
  rows: number;
  cornerRadius?: number;
  selectedShapes?: string[];
  selectedColors?: string[];
  shapeImages?: ShapeImageProvider;
};

const MARGIN_RATIO = 0.05; // Rand relativ zur kürzeren Kantenlänge
const FALLBACK_COLOR = "#2F00FF"; // primary-color, falls keine Farbe ausgewählt ist

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// Einfacher seeded PRNG (LCG), damit das Muster bei gleichen Parametern
// stabil bleibt, sich aber ändert, sobald Shapes/Colors/Grid sich ändern.
function createRng(seed: number) {
  let state = seed || 1;
  return function rng() {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
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
  } = params;

  p5.background(255); // Frame hat immer einen weißen Hintergrund

  const margin = Math.min(p5.width, p5.height) * MARGIN_RATIO;
  const innerX = margin;
  const innerY = margin;
  const innerW = p5.width - margin * 2;
  const innerH = p5.height - margin * 2;
  const innerRadius = Math.max(0, cornerRadius - margin);

  p5.noFill();
  p5.stroke(0);
  p5.strokeWeight(1);
  p5.rect(innerX, innerY, innerW, innerH, innerRadius);

  const cellW = innerW / columns;
  const cellH = innerH / rows;

  // Nur Shapes verwenden, deren Bild bereits geladen ist.
  const availableShapes = shapeImages
    ? selectedShapes.filter((id) => shapeImages.isReady(id))
    : [];
  const seed = hashString(
    `${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(",")}`
  );
  const rng = createRng(seed);

  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = innerX + col * cellW + cellW / 2;
      const cy = innerY + row * cellH + cellH / 2;

      const colorHex =
        selectedColors.length > 0
          ? selectedColors[Math.floor(rng() * selectedColors.length)]
          : FALLBACK_COLOR;

      const shapeId =
        availableShapes.length > 0
          ? availableShapes[Math.floor(rng() * availableShapes.length)]
          : undefined;
      const img = shapeId && shapeImages ? shapeImages.getImage(shapeId, colorHex) : undefined;

      if (!img) {
        // Platzhalter, solange keine Shapes ausgewählt/geladen sind.
        p5.noStroke();
        p5.fill(colorHex);
        p5.ellipse(cx, cy, cellW * 0.6, cellH * 0.6);
        continue;
      }

      const sizeJitter = 0.55 + rng() * 0.35; // 55–90% der kürzeren Zellkante
      const maxDim = Math.min(cellW, cellH) * sizeJitter;
      const fit = Math.min(maxDim / img.width, maxDim / img.height);
      const drawW = img.width * fit;
      const drawH = img.height * fit;
      const angle = Math.floor(rng() * 4) * p5.HALF_PI; // 0/90/180/270°
      const flip = rng() > 0.5 ? -1 : 1;

      p5.push();
      p5.translate(cx, cy);
      p5.rotate(angle);
      p5.scale(flip, 1);
      p5.imageMode(p5.CENTER);
      p5.image(img, 0, 0, drawW, drawH);
      p5.pop();
    }
  }
}
