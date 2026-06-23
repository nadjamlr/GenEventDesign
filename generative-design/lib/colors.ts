export type ColorDef = {
  id: string;
  hex: string;
};

export const DEFAULT_COLORS: ColorDef[] = [
  { id: "primary-blue", hex: "#2F00FF" },
  { id: "secondary-red", hex: "#F72E14" },
  { id: "secondary-light-blue", hex: "#C2DAFF" },
  { id: "secondary-pink", hex: "#FBACFB" },
  { id: "secondary-green", hex: "#D7EE44" },
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
