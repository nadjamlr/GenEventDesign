export type ExportSnapshot = {
  dataUrl: string;
  width: number;
  height: number;
};

type RenderExport = () => ExportSnapshot;

export const exportRegistry: { render: RenderExport | null } = { render: null };
