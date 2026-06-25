// Wiederverwendbare Text-Farbrollen, die in lib/inputFields.ts pro Feld über
// `color` zugewiesen werden. "default" lässt den Algorithmus wie bisher die
// passende Kontrastfarbe (schwarz/weiß, je nach Untergrund) wählen. "grey"
// nimmt dieselbe Kontrastfarbe, aber abgeschwächt (per Alpha) – für
// untergeordnete Felder (z.B. Adresse/Telefon), die sich von der
// Haupt-Information (z.B. Name) abheben sollen.
export type TextColorName = "default" | "grey";

export type TextColor = {
  /** Deckkraft (0..1) der schwarz/weißen Kontrastfarbe. 1 = volle Farbe. */
  alpha: number;
};

export const TEXT_COLORS: Record<TextColorName, TextColor> = {
  default: { alpha: 1 },
  grey: { alpha: 0.3 },
};

export const DEFAULT_TEXT_COLOR: TextColorName = "default";

export function getTextColor(color?: TextColorName): TextColor {
  return TEXT_COLORS[color ?? DEFAULT_TEXT_COLOR];
}
