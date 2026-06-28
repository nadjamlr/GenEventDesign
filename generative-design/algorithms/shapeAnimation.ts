// Animierte Eigenbewegung einer platzierten Shape über die Loop-Phase
// (0..1) – je nach Anordnung unterschiedlich, aber immer nahtlos (sin/cos
// bzw. volle Umdrehung), damit der Video-Export ruckelfrei schließt.
// Ausgelagert aus algorithms/grid.ts, damit die Bewegungs-Logik unabhängig
// von der restlichen Platzierungs-/Render-Logik lesbar bleibt.

export type Motion = {
  dx: number;
  dy: number;
  dRot: number;
  scale: number;
  /** Multiplikator auf die sonst bestimmte Opazität (z.B. Fade-in/-out beim
   *  Einfliegen, siehe shapeFlyIn.ts); ohne Angabe keine Änderung (1). */
  opacityMul?: number;
};

/** Nur für "wave" benötigt: Wellenphase, -amplitude und Steigungsfaktor des
 *  jeweiligen Elements (siehe placeWave in grid.ts). */
export type WaveAnimationState = {
  baseRot?: number;
  waveTheta?: number;
  waveAmp?: number;
  waveSlopeK?: number;
};

const TAU = Math.PI * 2;

/**
 * Bewegung für die aktuelle Loop-Phase. `off` ist ein pro Element vorab
 * bestimmter Desync-Versatz (0..TAU, z.B. aus einem Hash auf den Index),
 * damit nicht alle Elemente einer Anordnung exakt synchron schwingen.
 */
export function getShapeMotion(
  arrangement: string,
  phase: number,
  off: number,
  driftAmp: number,
  wave: WaveAnimationState
): Motion {
  switch (arrangement) {
    case "wave": {
      // Wandernde Welle: die Wellenphase läuft über die Loop um TAU weiter,
      // sodass die Kämme seitlich durchwandern. Jedes Element folgt der neuen
      // Höhe an seiner x-Position und kippt mit der lokalen Steigung mit.
      const tt = wave.waveTheta! + TAU * phase;
      const dy = wave.waveAmp! * (Math.sin(tt) - Math.sin(wave.waveTheta!));
      const slopeNow = Math.cos(tt) * wave.waveSlopeK!;
      const dRot = Math.atan(slopeNow) - (wave.baseRot ?? 0);
      return { dx: 0, dy, dRot, scale: 1 };
    }
    case "diagonal": {
      // Hin und her entlang der 45°-Richtung.
      const d = Math.sin(TAU * phase + off) * driftAmp;
      return { dx: d * Math.SQRT1_2, dy: d * Math.SQRT1_2, dRot: 0, scale: 1 };
    }
    case "grid":
      // Truchet-Kacheln wippen leicht in der Rotation (Raster bleibt lesbar).
      return { dx: 0, dy: 0, dRot: Math.sin(TAU * phase + off) * (Math.PI / 8), scale: 1 };
    case "packing":
      // Atmen – sanftes Größen-Pulsieren des ganzen Elements.
      return { dx: 0, dy: 0, dRot: 0, scale: 1 + Math.sin(TAU * phase + off) * 0.06 };
    default:
      // scatter/border/rings: keine Eigenbewegung der Shapes – nur das
      // Punkt-Pulsieren im Gitter bleibt.
      return { dx: 0, dy: 0, dRot: 0, scale: 1 };
  }
}
