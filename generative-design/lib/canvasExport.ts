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

export const exportRegistry: {
  render: RenderExport | null;
  renderVideo: RenderVideo | null;
} = { render: null, renderVideo: null };
