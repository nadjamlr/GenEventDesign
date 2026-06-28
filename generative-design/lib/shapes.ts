export type ShapeDef = {
  id: string;
  label: string;
  src: string;
};

export const shapes: ShapeDef[] = [
  { id: "l", label: "L", src: "/logoShapes/l.svg" },
  { id: "n1", label: "N1", src: "/logoShapes/n1.svg" },
  { id: "n2", label: "N2", src: "/logoShapes/n2.svg" },
  { id: "r", label: "R", src: "/logoShapes/r.svg" },
  { id: "y1", label: "Y1", src: "/logoShapes/y1.svg" },
  { id: "y2", label: "Y2", src: "/logoShapes/y2.svg" },
];

// Synthetische "Shape" für das komplette Logo: Wird verwendet, wenn ALLE Shapes
// ausgewählt sind – dann zeigt jede platzierte Instanz das volle Logo (als
// Punktgitter wie die übrigen Shapes), statt einzelner Buchstaben.
export const FULL_LOGO_SHAPE_ID = "__full_logo__";
export const FULL_LOGO_SRC = "/logoShapes/Logo_NRLY_Black.svg";

// Eine Form-Kombination setzt 1–3 Basis-Shapes zu einem zusammengesetzten
// Symbol zusammen (z.B. zwei parallele Striche, ein gekreuztes "X", einen
// Zickzack aus drei Teilen). dx/dy/scale sind relativ zur Gesamtgröße der
// Kombination (Anteil, nicht Pixel); rotOffset kommt zusätzlich zur
// Basis-Rotation der platzierten Instanz dazu.
export type ShapeComboPart = {
  shapeId: string;
  dx: number;
  dy: number;
  rotOffset: number;
  scale: number;
};
export type ShapeCombo = ShapeComboPart[];

const HALF_PI = Math.PI / 2;
const PI = Math.PI;

// 15 feste Kombinationen aus den 6 Basis-Shapes – einfache Paare/Tripel
// (parallel, gekreuzt, gespiegelt, Zickzack), die beim Platzieren wiederholt
// als Einheit verwendet werden (siehe SHAPE_COMBOS-Nutzung in algorithms/grid.ts).
export const SHAPE_COMBOS: ShapeCombo[] = [
  [{ shapeId: "l", dx: 0, dy: 0, rotOffset: HALF_PI, scale: 0.9 }],
  [{ shapeId: "n1", dx: 0, dy: 0, rotOffset: 0, scale: 0.9 }],
  [
    { shapeId: "r", dx: -0.18, dy: 0, rotOffset: HALF_PI, scale: 0.55 },
    { shapeId: "r", dx: 0.18, dy: 0, rotOffset: HALF_PI, scale: 0.55 },
  ],
  [
    { shapeId: "y1", dx: -0.15, dy: -0.05, rotOffset: 0, scale: 0.7 },
    { shapeId: "y1", dx: 0.15, dy: 0.05, rotOffset: 0, scale: 0.7 },
  ],
  [
    { shapeId: "y2", dx: -0.08, dy: -0.03, rotOffset: 0, scale: 0.75 },
    { shapeId: "y2", dx: 0.08, dy: 0.03, rotOffset: 0, scale: 0.75 },
  ],
  [
    { shapeId: "n1", dx: -0.12, dy: 0, rotOffset: 0, scale: 0.7 },
    { shapeId: "n2", dx: 0.12, dy: 0, rotOffset: PI, scale: 0.7 },
  ],
  [
    { shapeId: "l", dx: 0, dy: 0, rotOffset: 0, scale: 0.85 },
    { shapeId: "l", dx: 0, dy: 0, rotOffset: HALF_PI, scale: 0.85 },
  ],
  [
    { shapeId: "r", dx: -0.15, dy: 0, rotOffset: 0, scale: 0.75 },
    { shapeId: "r", dx: 0.15, dy: 0, rotOffset: PI, scale: 0.75 },
  ],
  [
    { shapeId: "n2", dx: -0.1, dy: -0.1, rotOffset: 0, scale: 0.8 },
    { shapeId: "n2", dx: 0.1, dy: 0.1, rotOffset: PI, scale: 0.8 },
  ],
  [
    { shapeId: "y1", dx: 0, dy: -0.15, rotOffset: 0, scale: 0.7 },
    { shapeId: "y2", dx: 0, dy: 0.15, rotOffset: PI, scale: 0.7 },
  ],
  [
    { shapeId: "l", dx: -0.05, dy: -0.05, rotOffset: 0, scale: 0.85 },
    { shapeId: "n1", dx: 0.05, dy: 0.05, rotOffset: PI, scale: 0.85 },
  ],
  [
    { shapeId: "r", dx: -0.2, dy: -0.1, rotOffset: 0, scale: 0.65 },
    { shapeId: "r", dx: 0.2, dy: 0.1, rotOffset: 0, scale: 0.65 },
  ],
  [
    { shapeId: "n1", dx: -0.2, dy: -0.18, rotOffset: 0, scale: 0.55 },
    { shapeId: "n2", dx: 0, dy: 0, rotOffset: PI, scale: 0.55 },
    { shapeId: "n1", dx: 0.2, dy: 0.18, rotOffset: 0, scale: 0.55 },
  ],
  [
    { shapeId: "y1", dx: -0.22, dy: 0.1, rotOffset: 0, scale: 0.5 },
    { shapeId: "y2", dx: 0, dy: -0.15, rotOffset: PI, scale: 0.5 },
    { shapeId: "y1", dx: 0.22, dy: 0.1, rotOffset: 0, scale: 0.5 },
  ],
  [
    { shapeId: "l", dx: -0.15, dy: -0.15, rotOffset: 0, scale: 0.55 },
    { shapeId: "r", dx: 0, dy: 0, rotOffset: HALF_PI, scale: 0.55 },
    { shapeId: "l", dx: 0.15, dy: 0.15, rotOffset: 0, scale: 0.55 },
  ],
];
