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
