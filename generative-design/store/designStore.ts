import { create } from "zustand";
import { FORMAT_SIZES, DEFAULT_FORMAT, ExportType } from "@/lib/formats";
import { DEFAULT_COLORS } from "@/lib/colors";

type DesignStore = {
  columns: number;
  rows: number;
  format: string;
  width: number;
  height: number;
  cornerRadius: number;
  exportType: ExportType;
  selectedShapes: string[];
  customColors: string[];
  selectedColors: string[];
  setColumns: (v: number) => void;
  setRows: (v: number) => void;
  setFormat: (v: string) => void;
  setWidth: (v: number) => void;
  setHeight: (v: number) => void;
  setExportType: (v: ExportType) => void;
  toggleShape: (id: string) => void;
  toggleColor: (hex: string) => void;
  addCustomColor: (hex: string) => void;
};

const useDesignStore = create<DesignStore>((set) => ({
  columns: 5,
  rows: 4,
  format: DEFAULT_FORMAT,
  width: FORMAT_SIZES[DEFAULT_FORMAT].width,
  height: FORMAT_SIZES[DEFAULT_FORMAT].height,
  cornerRadius: FORMAT_SIZES[DEFAULT_FORMAT].cornerRadius ?? 0,
  exportType: FORMAT_SIZES[DEFAULT_FORMAT].defaultExportType ?? "png",
  selectedShapes: [],
  customColors: [],
  selectedColors: [],
  setColumns: (v) => set({ columns: v }),
  setRows: (v) => set({ rows: v }),
  setFormat: (v) =>
    set((state) => ({
      format: v,
      cornerRadius: 0,
      exportType: FORMAT_SIZES[v]?.defaultExportType ?? state.exportType,
      ...(FORMAT_SIZES[v] ?? {}),
    })),
  setWidth: (v) => set({ width: v }),
  setHeight: (v) => set({ height: v }),
  setExportType: (v) => set({ exportType: v }),
  toggleShape: (id) =>
    set((state) => ({
      selectedShapes: state.selectedShapes.includes(id)
        ? state.selectedShapes.filter((s) => s !== id)
        : [...state.selectedShapes, id],
    })),
  toggleColor: (hex) =>
    set((state) => ({
      selectedColors: state.selectedColors.includes(hex)
        ? state.selectedColors.filter((c) => c !== hex)
        : [...state.selectedColors, hex],
    })),
  addCustomColor: (hex) =>
    set((state) => {
      const isKnown =
        state.customColors.includes(hex) ||
        DEFAULT_COLORS.some((c) => c.hex === hex);
      return {
        customColors: isKnown ? state.customColors : [...state.customColors, hex],
        selectedColors: state.selectedColors.includes(hex)
          ? state.selectedColors
          : [...state.selectedColors, hex],
      };
    }),
}));

export default useDesignStore;
