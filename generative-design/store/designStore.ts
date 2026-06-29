import { create } from "zustand";
import { FORMAT_SIZES, DEFAULT_FORMAT, ExportType, Side } from "@/lib/formats";
import { DEFAULT_COLORS } from "@/lib/colors";
import { shapes } from "@/lib/shapes";
import type { AreaDef } from "@/lib/areas";
import type { LogoMode } from "@/algorithms/grid";

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
  seed: number;
  inputValues: Record<string, string>;
  areas: AreaDef[];
  side: Side;
  logoEnabled: boolean;
  logoMode: LogoMode;
  animate: boolean;
  loopDuration: number;
  gridResolution: number;
  dotSize: number;
  dotVariation: number;
  setColumns: (v: number) => void;
  setRows: (v: number) => void;
  setFormat: (v: string) => void;
  setSide: (v: Side) => void;
  setLogoEnabled: (v: boolean) => void;
  setLogoMode: (v: LogoMode) => void;
  setAnimate: (v: boolean) => void;
  setLoopDuration: (v: number) => void;
  setGridResolution: (v: number) => void;
  setDotSize: (v: number) => void;
  setDotVariation: (v: number) => void;
  setWidth: (v: number) => void;
  setHeight: (v: number) => void;
  setExportType: (v: ExportType) => void;
  toggleShape: (id: string) => void;
  toggleColor: (hex: string) => void;
  addCustomColor: (hex: string) => void;
  setInputValue: (key: string, value: string) => void;
  regenerate: () => void;
  addArea: (area: Omit<AreaDef, "id">) => void;
  removeArea: (id: string) => void;
  toggleAreaGrayscale: (id: string) => void;
  setAreaPosition: (id: string, x: number, y: number) => void;
  updateArea: (id: string, updates: Partial<Omit<AreaDef, "id">>) => void;
};

const useDesignStore = create<DesignStore>((set) => ({
  columns: 5,
  rows: 4,
  format: DEFAULT_FORMAT,
  width: FORMAT_SIZES[DEFAULT_FORMAT].width,
  height: FORMAT_SIZES[DEFAULT_FORMAT].height,
  cornerRadius: FORMAT_SIZES[DEFAULT_FORMAT].cornerRadius ?? 0,
  exportType: FORMAT_SIZES[DEFAULT_FORMAT].defaultExportType ?? "png",
  selectedShapes: shapes[0] ? [shapes[0].id] : [],
  customColors: [],
  selectedColors: ["#000000", "#1C1F22"],
  seed: Math.floor(Math.random() * 1e9),
  inputValues: {},
  areas: [],
  side: "front",
  logoEnabled: true,
  logoMode: "random",
  animate: false,
  loopDuration: 5.5,
  gridResolution: 5,
  dotSize: 4,
  dotVariation: 4,
  setColumns: (v) => set({ columns: v }),
  setRows: (v) => set({ rows: v }),
  setFormat: (v) =>
    set((state) => ({
      format: v,
      cornerRadius: 0,
      side: "front",
      exportType: FORMAT_SIZES[v]?.defaultExportType ?? state.exportType,
      ...(FORMAT_SIZES[v] ?? {}),
    })),
  setSide: (v) => set({ side: v }),
  setLogoEnabled: (v) => set({ logoEnabled: v }),
  setLogoMode: (v) => set({ logoMode: v }),
  setAnimate: (v) => set({ animate: v }),
  setLoopDuration: (v) => set({ loopDuration: v }),
  setGridResolution: (v) => set({ gridResolution: v }),
  setDotSize: (v) => set({ dotSize: v }),
  setDotVariation: (v) => set({ dotVariation: v }),
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
  regenerate: () => set({ seed: Math.floor(Math.random() * 1e9) }),
  setInputValue: (key, value) =>
    set((state) => ({ inputValues: { ...state.inputValues, [key]: value } })),
  addArea: (area) =>
    set((state) => ({
      areas: [...state.areas, { ...area, id: `${Date.now()}-${Math.random()}` }],
    })),
  removeArea: (id) =>
    set((state) => ({ areas: state.areas.filter((a) => a.id !== id) })),
  toggleAreaGrayscale: (id) =>
    set((state) => ({
      areas: state.areas.map((a) =>
        a.id === id ? { ...a, grayscale: !a.grayscale } : a
      ),
    })),
  setAreaPosition: (id, x, y) =>
    set((state) => ({
      areas: state.areas.map((a) => (a.id === id ? { ...a, x, y } : a)),
    })),
  updateArea: (id, updates) =>
    set((state) => ({
      areas: state.areas.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
}));

export default useDesignStore;
