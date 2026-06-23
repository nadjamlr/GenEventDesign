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
  seed?: number;
};

const MARGIN_RATIO = 0.05; // Rand relativ zur kürzeren Kantenlänge
const BLEED_RATIO = 0.18; // wie weit Elemente über den Rand hinausragen dürfen
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
// stabil bleibt, sich aber ändert, sobald Shapes/Colors/Grid/Seed sich ändern.
function createRng(seed: number) {
  let state = seed || 1;
  return function rng() {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

type Instance = {
  cx: number;
  cy: number;
  size: number;
  shapeId?: string;
  colorHex: string;
  angle: number;
  flip: number;
};

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

  const availableShapes = shapeImages
    ? selectedShapes.filter((id) => shapeImages.isReady(id))
    : [];

  const seed = hashString(
    `${seedParam}|${columns}x${rows}|${availableShapes.join(",")}|${selectedColors.join(",")}`
  );
  const rng = createRng(seed);

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
    instances.push({
      cx: innerX - bleedX + rng() * (innerW + bleedX * 2),
      cy: innerY - bleedY + rng() * (innerH + bleedY * 2),
      size: baseUnit * scale,
      shapeId:
        availableShapes.length > 0
          ? availableShapes[Math.floor(rng() * availableShapes.length)]
          : undefined,
      colorHex:
        selectedColors.length > 0
          ? selectedColors[Math.floor(rng() * selectedColors.length)]
          : FALLBACK_COLOR,
      angle: rng() * p5.TWO_PI,
      flip: rng() > 0.5 ? -1 : 1,
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
    p5.rotate(inst.angle);
    p5.scale(inst.flip, 1);

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
}
