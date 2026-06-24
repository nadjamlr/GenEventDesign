// Prompt (Google Fonts) wird als Schrift für alle Formate verwendet. p5.js
// v2 kann eine Google-Fonts-CSS2-URL direkt per loadFont() laden (siehe
// p5-Doku zu loadFont – unterstützt @font-face/CSS-Importe, nicht nur
// einzelne .ttf/.otf-Dateien). Pro benötigtem Weight (siehe lib/textStyles.ts)
// wird eine eigene URL mit genau diesem Weight geladen, damit p5 nicht
// zwischen mehreren Weights in einer Datei unterscheiden muss.
export const FONT_FAMILY = "Prompt";

export function getGoogleFontUrl(weight: number): string {
  return `https://fonts.googleapis.com/css2?family=Prompt:wght@${weight}&display=swap`;
}
