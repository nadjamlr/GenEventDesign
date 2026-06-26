export type ColorDef = {
  id: string;
  hex: string;
};

export const DEFAULT_COLORS: ColorDef[] = [
  { id: "primary-black", hex: "#000000"},
  { id: "secondary-grey", hex: "#1C1F22" },
  { id: "primary-white", hex: "#ffffff" },
  { id: "secondary-yellow", hex: "#F2D974" },
  { id: "secondary-senf", hex: "#FFAD01" },
  { id: "primary-blue", hex: "#355CD0" },
];

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
    const [r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw}`.toUpperCase();
  }
  return null;
}
