import { create } from "zustand";

type DesignStore = {
  columns: number;
  rows: number;
  format: string;
  setColumns: (v: number) => void;
  setRows: (v: number) => void;
  setFormat: (v: string) => void;
};

const useDesignStore = create<DesignStore>((set) => ({
  columns: 5,
  rows: 4,
  format: "Flyer",
  setColumns: (v) => set({ columns: v }),
  setRows: (v) => set({ rows: v }),
  setFormat: (v) => set({ format: v }),
}));

export default useDesignStore;
