import type { Side } from "@/lib/formats";

export type ExportSnapshot = {
  dataUrl: string;
  width: number;
  height: number;
};

type RenderExport = (overrideSide?: Side) => ExportSnapshot;

export const exportRegistry: { render: RenderExport | null } = { render: null };
