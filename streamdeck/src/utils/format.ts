import type { FlagState } from "../bridge/types";

export function formatParamValue(param: string, value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";

  switch (param) {
    case "Exposure":
      return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
    case "Temperature":
      return `${Math.round(value)}K`;
    case "Tint":
    case "Contrast":
    case "Highlights":
    case "Shadows":
    case "Whites":
    case "Blacks":
    case "Texture":
    case "Clarity":
    case "Dehaze":
    case "Vibrance":
    case "Saturation":
      return `${Math.round(value)}`;
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
}

export function formatRating(rating: number | undefined): string {
  const n = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
  return n === 0 ? "☆" : "★".repeat(n);
}

export function formatFlag(flag: FlagState | undefined): string {
  if (flag === 1) return "PICK";
  if (flag === -1) return "REJECT";
  return "—";
}

export function shortParamName(param: string): string {
  const map: Record<string, string> = {
    Temperature: "Temp",
    Tint: "Tint",
    Exposure: "Exp",
    Contrast: "Con",
    Highlights: "Hi",
    Shadows: "Sh",
    Whites: "Wh",
    Blacks: "Bk",
    Texture: "Tex",
    Clarity: "Cla",
    Dehaze: "Deh",
    Vibrance: "Vib",
    Saturation: "Sat",
  };
  return map[param] ?? param.slice(0, 4);
}

export const DEFAULT_STEPS: Record<string, number> = {
  Temperature: 50,
  Tint: 5,
  Exposure: 0.1,
  Contrast: 5,
  Highlights: 5,
  Shadows: 5,
  Whites: 5,
  Blacks: 5,
  Texture: 5,
  Clarity: 5,
  Dehaze: 5,
  Vibrance: 5,
  Saturation: 5,
};
