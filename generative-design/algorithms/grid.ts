import type p5Types from "p5";

type Params = {
  columns: number;
  rows: number;
};

// Hier schreibst du deinen Algorithmus.
// p5 ist die p5.js Instanz, params kommen aus dem Store.
export function drawGrid(p5: p5Types, params: Params) {
  const { columns, rows } = params;

  p5.background(238); // primary-lightgrey

  const cellW = p5.width / columns;
  const cellH = p5.height / rows;

  for (let col = 0; col < columns; col++) {
    for (let row = 0; row < rows; row++) {
      const x = col * cellW;
      const y = row * cellH;

      p5.fill(47, 0, 255); // primary-color
      p5.noStroke();
      p5.ellipse(x + cellW / 2, y + cellH / 2, cellW * 0.6, cellH * 0.6);
    }
  }
}
