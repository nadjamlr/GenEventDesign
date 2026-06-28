import type { Side } from "@/lib/formats";

export type ExportSnapshot = {
  dataUrl: string;
  width: number;
  height: number;
};

type RenderExport = (overrideSide?: Side) => ExportSnapshot;

export type VideoExportOptions = {
  /** Loop-Länge in Sekunden. */
  duration: number;
  /** Bildrate des Videos (Default 30). */
  fps?: number;
  side?: Side;
  /** Fortschritt 0..1 während der (in Echtzeit laufenden) Aufnahme. */
  onProgress?: (progress: number) => void;
};

type RenderVideo = (options: VideoExportOptions) => Promise<Blob>;

/** Rendert genau die Animationsphase, die im sichtbaren Canvas gerade läuft, in voller Export-Auflösung – ein "Screenshot" der laufenden Animation. */
type RenderFrame = (overrideSide?: Side) => ExportSnapshot;

export type RecordingStartOptions = {
  /** Bildrate der Aufnahme (Default 30). */
  fps?: number;
  side?: Side;
};

/** Startet eine Aufnahme beliebiger Länge (kein festes `duration` wie bei renderVideo) – läuft bis stop() aufgerufen wird. */
type StartRecording = (options?: RecordingStartOptions) => void;
/** Beendet die laufende Aufnahme und liefert das aufgezeichnete WebM als Blob. */
type StopRecording = () => Promise<Blob>;

export const exportRegistry: {
  render: RenderExport | null;
  renderVideo: RenderVideo | null;
  renderFrame: RenderFrame | null;
  startRecording: StartRecording | null;
  stopRecording: StopRecording | null;
} = { render: null, renderVideo: null, renderFrame: null, startRecording: null, stopRecording: null };
