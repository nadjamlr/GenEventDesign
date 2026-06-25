// Wiederverwendbare Text-Rollen, die in lib/inputFields.ts pro Feld über
// `style` zugewiesen werden. Dieselbe Rolle (z.B. "h1") sieht über alle
// Formate hinweg gleich aus, statt pro Format eigene Größen/Weights zu
// vergeben.
export type TextStyleName = "title" | "h1" | "h2" | "h3" | "h4" | "p1" | "p2";

export type TextStyle = {
  /** Multiplikator auf die normale Basis-Schriftgröße. */
  sizeMultiplier: number;
  /** Font-Weight (siehe lib/fonts.ts – Inter wird in diesen Weights geladen). */
  weight: number;
  /** Zusätzlicher Buchstabenabstand, relativ zur Schriftgröße (0 = normal). */
  letterSpacing?: number;
};

export const TEXT_STYLES: Record<TextStyleName, TextStyle> = {
  title: { sizeMultiplier: 6, weight: 400 },
  h1: { sizeMultiplier: 2.1, weight: 400 },
  h2: { sizeMultiplier: 1.5, weight: 400, letterSpacing: 0.04 },
  h3: { sizeMultiplier: 1.2, weight: 200, letterSpacing: 0.04 },
  h4: { sizeMultiplier: 1.2, weight: 400, letterSpacing: 0.04 },
  p1: { sizeMultiplier: 0.9, weight: 400, letterSpacing: 0.04 },
  p2: { sizeMultiplier: 0.9, weight: 200, letterSpacing: 0.04 },
};

export const DEFAULT_TEXT_STYLE: TextStyleName = "h1";

export function getTextStyle(style?: TextStyleName): TextStyle {
  return TEXT_STYLES[style ?? DEFAULT_TEXT_STYLE];
}
