// "Einfliegen"-Animation: Shapes fliegen aus einer Richtung (oben/unten/
// links/rechts oder diagonal) auf ihre Zielposition zu und am Ende der Loop-
// Phase wieder hinaus – nahtlos wiederholend wie die Bewegungen in
// shapeAnimation.ts, aber als eigener, davon unabhängiger Animations-Modus
// (siehe flyInEnabled in grid.ts), der die Anordnungs-spezifische Bewegung
// für die jeweilige Komposition ersetzt statt sich mit ihr zu überlagern.

export type FlyInDirection = "top" | "bottom" | "left" | "right" | "diagonalUpRight" | "diagonalDownLeft";

const FLY_IN_DIRECTIONS: FlyInDirection[] = [
  "top",
  "bottom",
  "left",
  "right",
  "diagonalUpRight",
  "diagonalDownLeft",
];

// Einheitsvektor der Startposition relativ zur Zielposition – zeigt dorthin,
// wo das Element bei voller Auslenkung (außerhalb der Canvas) sitzt, bevor es
// einfliegt. "diagonalUpRight" = von links-unten nach rechts-oben (Start
// also links-unten vom Ziel); "diagonalDownLeft" = von rechts-oben nach
// links-unten (Start rechts-oben vom Ziel).
const DIRECTION_VECTORS: Record<FlyInDirection, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  diagonalUpRight: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  diagonalDownLeft: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
};

/** Wählt deterministisch eine der 6 Richtungen (z.B. aus einem Seed-Hash). */
export function pickFlyInDirection(seed: number): FlyInDirection {
  const idx = Math.abs(seed) % FLY_IN_DIRECTIONS.length;
  return FLY_IN_DIRECTIONS[idx];
}

// Zeitfenster der Animation in ABSOLUTEN Sekunden (nicht als Bruch der Loop)
// – dadurch bleibt die Flug-GESCHWINDIGKEIT der einzelnen Elemente immer
// gleich, ganz unabhängig davon, wie lang die Loop insgesamt eingestellt ist
// (siehe loopDurationSeconds in presence()/getFlyInMotion()). Nur das
// Verhältnis dieser Sekundenwerte zur tatsächlichen Loop-Länge wird zur
// Laufzeit in Phasen-Brüche (0..1) umgerechnet. Reihenfolge: zuerst sind ALLE
// Elemente draußen, dann fliegt nacheinander (gestaffelt über
// ENTER_SPREAD_SECONDS) jedes Element ein und bleibt abrupt stehen, hält
// (adaptiv, siehe MIN_HOLD_SECONDS unten), und fliegt ebenso gestaffelt
// wieder hinaus – am Loop-Rand (t=0/1) ist die Canvas dadurch garantiert leer.
const ENTER_SPREAD_SECONDS = 0.7; // Streuung der Start-Zeitpunkte – kurz, damit die Canvas schnell gefüllt ist statt lange leer/spärlich zu wirken
const ENTER_FLIGHT_SECONDS = 0.3; // Flugzeit eines einzelnen Elements bei Standardgeschwindigkeit (speedFactor 0.5)
const EXIT_SPREAD_SECONDS = 0.7; // genauso kurz gestreut wie der Einflug
const EXIT_FLIGHT_SECONDS = 0.4;

// HOLD ist bewusst KEINE feste Konstante, sondern "was von der Loop nach
// Enter+Exit übrig bleibt" (siehe presence()). Eine feste Sekundenzahl hätte
// bei einer Loop-Länge, die größer ist als Enter+HOLD+Exit zusammen, eine
// große, komplett leere Lücke zwischen Ausflug und nächstem Einflug erzeugt
// (z.B. bei 9s Loop und nur 5.1s "Budget": ~3.9s nichts zu sehen) – und genau
// in dieser Lücke bzw. im kurzen Ein-/Ausflug-Fenster (statt in der Hold-
// Phase) landet man beim Hinschauen überproportional oft, was wie
// "Shapes stehen nie an ihrer richtigen Position" wirkt. Mit adaptivem HOLD
// füllt die Haltephase immer (fast) die ganze Loop, unabhängig vom
// eingestellten Wert.
const MIN_HOLD_SECONDS = 0.3;

// Erlaubte Spanne für den Geschwindigkeits-Faktor pro Element: >1 = schneller
// (kürzere Flugzeit), <1 = langsamer. Bei MAX_SPEED bleibt noch genug Puffer
// zur Haltephase, damit auch die schnellsten/langsamsten Elemente innerhalb
// ihres Fensters fertig fliegen.
const MIN_SPEED = 0.6;
const MAX_SPEED = 2.2;

// Bremsweg nur ganz am Ende der Flugzeit: den größten Teil der Zeit
// (CRUISE_FRACTION) legt das Element mit konstantem Tempo den Großteil der
// Strecke (CRUISE_PROGRESS) zurück; erst im letzten Stück der Zeit (1 -
// CRUISE_FRACTION) wird abgebremst, je näher die Zielposition kommt, desto
// langsamer (quadratisches Ease-out). Der Anfang bleibt linear/kantig, nur
// das Ende der Bewegung wird sanft.
const CRUISE_FRACTION = 0.7;
const CRUISE_PROGRESS = 0.82;
function easeOutTail(u: number): number {
  if (u <= CRUISE_FRACTION) return (u / CRUISE_FRACTION) * CRUISE_PROGRESS;
  const s = (u - CRUISE_FRACTION) / (1 - CRUISE_FRACTION); // 0..1 in der Bremsphase
  const eased = 1 - (1 - s) * (1 - s);
  return CRUISE_PROGRESS + (1 - CRUISE_PROGRESS) * eased;
}

// Anwesenheit eines Elements zum Zeitpunkt t (0..1 in der Loop): 0 = noch/
// schon vollständig draußen, 1 = an der Zielposition. `off` (0..1, pro
// Element fix) staffelt sowohl den Einflug- als auch den Auflug-Zeitpunkt,
// damit die Elemente nacheinander statt im Gleichschritt erscheinen/
// verschwinden ("vereinzelt"). `speed` (>0, 1 = Standardgeschwindigkeit)
// verkürzt/verlängert die individuelle Flugzeit, damit nicht alle Elemente
// gleich schnell fliegen. `loopDurationSeconds` rechnet die festen Sekunden-
// Werte oben in Phasen-Brüche um – das Ein-/Ausflugfenster wird dadurch bei
// einer längeren Loop nicht automatisch langsamer durchlaufen, nur die
// Haltephase dazwischen wird entsprechend länger. Beim Einfliegen bremst
// easeOutTail() das letzte Stück vor der Zielposition ab; beim Ausfliegen
// (zeitlich gespiegelt) ist es entsprechend gleich nach dem Start (= nahe
// der Position) langsam und wird danach schneller. Das Exit-Fenster startet
// nach der (adaptiven) Haltephase nach dem spätesten Eintreffen (anhand der
// Standard-Flugzeit, nicht der tatsächlichen `speed`), damit seine Lage nicht
// von der individuellen Geschwindigkeit eines Elements abhängt.
function presence(t: number, off: number, speed: number, loopDurationSeconds: number): number {
  const loop = Math.max(0.1, loopDurationSeconds);
  // Adaptiv: HOLD füllt den Rest der Loop nach dem festen Enter+Exit-Budget,
  // statt eine feste Sekundenzahl zu sein (siehe MIN_HOLD_SECONDS oben). Das
  // Budget rechnet mit der LANGSAMSTEN möglichen Flugzeit (ENTER_FLIGHT/EXIT_
  // FLIGHT geteilt durch MIN_SPEED, nicht die Standard-Flugzeit) – sonst kann
  // ein langsames UND spät gestaffeltes Element (hohes off) über das Loop-
  // Ende hinaus fliegen wollen und an der Naht abrupt verschwinden ("poppen"),
  // statt seinen Ausflug sichtbar zu Ende zu bringen.
  const transitBudget =
    ENTER_SPREAD_SECONDS + ENTER_FLIGHT_SECONDS / MIN_SPEED + EXIT_SPREAD_SECONDS + EXIT_FLIGHT_SECONDS / MIN_SPEED;
  const holdSeconds = Math.max(MIN_HOLD_SECONDS, loop - transitBudget);
  const enterSpread = ENTER_SPREAD_SECONDS / loop;
  const enterDuration = ENTER_FLIGHT_SECONDS / speed / loop;
  const enterStart = off * enterSpread;
  const enterEnd = enterStart + enterDuration;
  if (t < enterStart) return 0;
  if (t < enterEnd) return easeOutTail((t - enterStart) / enterDuration);

  const exitSpread = EXIT_SPREAD_SECONDS / loop;
  const exitWindowStart = (ENTER_SPREAD_SECONDS + ENTER_FLIGHT_SECONDS + holdSeconds) / loop;
  const exitDuration = EXIT_FLIGHT_SECONDS / speed / loop;
  const exitStart = exitWindowStart + off * exitSpread;
  const exitEnd = exitStart + exitDuration;
  if (t < exitStart) return 1;
  if (t < exitEnd) return easeOutTail(1 - (t - exitStart) / exitDuration);
  return 0;
}

/**
 * Verschiebung (dx,dy) und Opazitäts-Faktor (opacity, 0..1) für die aktuelle
 * Loop-Phase: außerhalb des Anwesenheits-Fensters (siehe presence()) ist das
 * Element um `amplitude` aus der gewählten Richtung versetzt (außerhalb der
 * Canvas), während des Ein-/Ausflugs linear interpoliert (konstante
 * Geschwindigkeit pro Flug, kantiger Stopp statt sanftem Ease-out) und in der
 * Haltephase exakt an der Zielposition. `loopDurationSeconds` ist die
 * tatsächliche Loop-Länge (Sekunden, aus dem Store) – nötig, um die festen
 * Sekunden-Zeiten oben in Phasen-Brüche umzurechnen, ohne die Flug-
 * geschwindigkeit von der Loop-Länge abhängig zu machen. `speedFactor`
 * (0..1, z.B. aus einem Hash) wird auf [MIN_SPEED, MAX_SPEED] gemappt, damit
 * jedes Element mit einer eigenen, unterschiedlichen Geschwindigkeit fliegt
 * statt alle exakt gleich schnell. Die Opazität folgt standardmäßig derselben
 * Kurve (beim Einfliegen wird das Element sichtbarer, beim Ausfliegen
 * unsichtbarer); `invert` dreht das um. `off` (0..1) ist ein fester Versatz
 * pro Element (z.B. aus einem Hash), der die Ein-/Ausflugzeitpunkte staffelt.
 */
export function getFlyInMotion(
  direction: FlyInDirection,
  phase: number,
  off: number,
  amplitude: number,
  loopDurationSeconds: number,
  invert = false,
  speedFactor = 0.5
): { dx: number; dy: number; opacity: number } {
  const speed = MIN_SPEED + speedFactor * (MAX_SPEED - MIN_SPEED);
  const p = presence(phase, off, speed, loopDurationSeconds);
  const vec = DIRECTION_VECTORS[direction];
  return { dx: vec.x * amplitude * (1 - p), dy: vec.y * amplitude * (1 - p), opacity: invert ? 1 - p : p };
}
