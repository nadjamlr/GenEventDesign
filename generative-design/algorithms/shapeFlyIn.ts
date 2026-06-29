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

// Die Haltephase soll IMMER deutlich länger sein als die Zeit, die ein
// Element komplett außerhalb der Canvas verbringt (siehe presence()) – sonst
// wirkt es so, als würde ein Element kaum eingeflogen sein, bevor es schon
// wieder hinausfliegt. Bei einer kurzen eingestellten Loop-Dauer würde das
// feste Enter+Exit-Sekundenbudget (transitBudgetNominal) sonst einen großen
// Teil der Loop einnehmen und HOLD bis auf MIN_HOLD_SECONDS zusammendrücken.
// Deshalb wird das Budget anteilig (transitScale) verkleinert, sobald es mehr
// als (1 - MIN_HOLD_FRACTION) der Loop belegen würde – die Flüge werden dann
// zwar kürzer/schneller, aber HOLD bleibt garantiert der dominante Teil der
// Loop.
const MIN_HOLD_FRACTION = 0.6;

// Erlaubte Spanne für den Geschwindigkeits-Faktor pro Element: >1 = schneller
// (kürzere Flugzeit), <1 = langsamer. Bei MAX_SPEED bleibt noch genug Puffer
// zur Haltephase, damit auch die schnellsten/langsamsten Elemente innerhalb
// ihres Fensters fertig fliegen.
const MIN_SPEED = 0.6;
const MAX_SPEED = 2.2;

// Abbremsen über die GESAMTE Flugzeit (kubisches Ease-out), nicht nur im
// letzten Stück: vorher legte das Element den Großteil der Strecke mit
// konstantem, recht hohem Tempo zurück und bremste erst in den letzten 30%
// der Zeit ab – bei der großen Flugdistanz (siehe flyInAmplitude) sah das
// beim Einfliegen wie ein Überschießen über die Zielposition hinaus aus,
// weil der sichtbare Teil der Bewegung (innerhalb der Canvas) meist noch in
// der schnellen Phase lag und die eigentliche Bremsung erst ganz am Schluss
// (oft schon sehr nah am/hinter dem Canvas-Rand) einsetzte. Eine durchgehende
// Bremsung sorgt dafür, dass die Annäherung an die Zielposition schon von
// weiter weg sichtbar langsamer wird. Beim Ausfliegen (zeitlich gespiegelt)
// bedeutet das einen sanften Start statt eines abrupten Tempowechsels –
// fällt aber kaum auf, weil dieser Teil ohnehin meist außerhalb der Canvas
// liegt.
function easeOutTail(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

// Anwesenheit eines Elements zum Zeitpunkt t (0..1 in der Loop): 0 = noch/
// schon vollständig draußen, 1 = an der Zielposition. `off` (0..1, pro
// Element fix) staffelt sowohl den Einflug- als auch den Auflug-Zeitpunkt,
// damit die Elemente nacheinander statt im Gleichschritt erscheinen/
// verschwinden ("vereinzelt"). `speed` (>0, 1 = Standardgeschwindigkeit)
// verkürzt/verlängert die individuelle Flugzeit, damit nicht alle Elemente
// gleich schnell fliegen. `loopDurationSeconds` rechnet die (ggf. per
// MIN_HOLD_FRACTION skalierten) Sekunden-Werte oben in Phasen-Brüche um –
// das Ein-/Ausflugfenster wird dadurch bei einer längeren Loop nicht
// automatisch langsamer durchlaufen, nur die Haltephase dazwischen wird
// entsprechend länger. Beim Einfliegen bremst
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
  const transitBudgetNominal =
    ENTER_SPREAD_SECONDS + ENTER_FLIGHT_SECONDS / MIN_SPEED + EXIT_SPREAD_SECONDS + EXIT_FLIGHT_SECONDS / MIN_SPEED;
  const maxTransitBudget = loop * (1 - MIN_HOLD_FRACTION);
  const transitScale = transitBudgetNominal > maxTransitBudget ? maxTransitBudget / transitBudgetNominal : 1;
  const enterSpreadSeconds = ENTER_SPREAD_SECONDS * transitScale;
  const enterFlightSeconds = ENTER_FLIGHT_SECONDS * transitScale;
  const exitSpreadSeconds = EXIT_SPREAD_SECONDS * transitScale;
  const exitFlightSeconds = EXIT_FLIGHT_SECONDS * transitScale;
  const transitBudget =
    enterSpreadSeconds + enterFlightSeconds / MIN_SPEED + exitSpreadSeconds + exitFlightSeconds / MIN_SPEED;
  const holdSeconds = Math.max(MIN_HOLD_SECONDS, loop - transitBudget);
  const enterSpread = enterSpreadSeconds / loop;
  const enterDuration = enterFlightSeconds / speed / loop;
  const enterStart = off * enterSpread;
  const enterEnd = enterStart + enterDuration;
  if (t < enterStart) return 0;
  if (t < enterEnd) return easeOutTail((t - enterStart) / enterDuration);

  const exitSpread = exitSpreadSeconds / loop;
  const exitWindowStart = (enterSpreadSeconds + enterFlightSeconds + holdSeconds) / loop;
  const exitDuration = exitFlightSeconds / speed / loop;
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
