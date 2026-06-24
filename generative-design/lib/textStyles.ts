// Wiederverwendbare Text-Rollen, die in lib/inputFields.ts pro Feld über
// `style` zugewiesen werden. Dieselbe Rolle (z.B. "h1") sieht über alle
// Formate hinweg gleich aus, statt pro Format eigene Größen/Weights zu
// vergeben.
export type TextStyleName = "h1" | "h2" | "h3" | "p1" | "p2";

export type TextStyle = {
  /** Multiplikator auf die normale Basis-Schriftgröße. */
  sizeMultiplier: number;
  /** Font-Weight (siehe lib/fonts.ts – Inter wird in diesen Weights geladen). */
  weight: number;
};

export const TEXT_STYLES: Record<TextStyleName, TextStyle> = {
  h1: { sizeMultiplier: 2.2, weight: 900 },
  h2: { sizeMultiplier: 2.2, weight: 900 },
  h3: { sizeMultiplier: 1.4, weight: 600 },
  p1: { sizeMultiplier: 1, weight: 400 },
  p2: { sizeMultiplier: 0.8, weight: 500 },
};

export const DEFAULT_TEXT_STYLE: TextStyleName = "p1";

export function getTextStyle(style?: TextStyleName): TextStyle {
  return TEXT_STYLES[style ?? DEFAULT_TEXT_STYLE];
}
