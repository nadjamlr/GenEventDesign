import { create } from "zustand";

type DesignStore = {
  columns: number;
  rows: number;
  format: string;
  selectedShapes: string[];
  setColumns: (v: number) => void;
  setRows: (v: number) => void;
  setFormat: (v: string) => void;
  toggleShape: (id: string) => void;
};

const useDesignStore = create<DesignStore>((set) => ({
  columns: 5,
  rows: 4,
  format: "Flyer",
  selectedShapes: [],
  setColumns: (v) => set({ columns: v }),
  setRows: (v) => set({ rows: v }),
  setFormat: (v) => set({ format: v }),
  toggleShape: (id) =>
    set((state) => ({
      selectedShapes: state.selectedShapes.includes(id)
        ? state.selectedShapes.filter((s) => s !== id)
        : [...state.selectedShapes, id],
    })),
}));

export default useDesignStore;
