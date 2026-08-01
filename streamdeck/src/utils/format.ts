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
    case "ParametricDarks":
    case "ParametricLights":
    case "ParametricShadows":
    case "ParametricHighlights":
    case "ParametricShadowSplit":
    case "ParametricMidtoneSplit":
    case "ParametricHighlightSplit":
    case "SplitToningShadowHue":
    case "SplitToningShadowSaturation":
    case "ColorGradeShadowLum":
    case "SplitToningHighlightHue":
    case "SplitToningHighlightSaturation":
    case "ColorGradeHighlightLum":
    case "ColorGradeMidtoneHue":
    case "ColorGradeMidtoneSat":
    case "ColorGradeMidtoneLum":
    case "ColorGradeGlobalHue":
    case "ColorGradeGlobalSat":
    case "ColorGradeGlobalLum":
    case "SplitToningBalance":
    case "ColorGradeBlending":
    case "Sharpness":
    case "LuminanceSmoothing":
    case "ColorNoiseReduction":
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
    ParametricDarks: "PDark",
    ParametricLights: "PLite",
    ParametricShadows: "PSh",
    ParametricHighlights: "PHi",
    ParametricShadowSplit: "ShSp",
    ParametricMidtoneSplit: "MidSp",
    ParametricHighlightSplit: "HiSp",
    SplitToningShadowHue: "ShHue",
    SplitToningShadowSaturation: "ShSat",
    ColorGradeShadowLum: "ShLum",
    SplitToningHighlightHue: "HiHue",
    SplitToningHighlightSaturation: "HiSat",
    ColorGradeHighlightLum: "HiLum",
    ColorGradeMidtoneHue: "MtHue",
    ColorGradeMidtoneSat: "MtSat",
    ColorGradeMidtoneLum: "MtLum",
    ColorGradeGlobalHue: "GlHue",
    ColorGradeGlobalSat: "GlSat",
    ColorGradeGlobalLum: "GlLum",
    SplitToningBalance: "Bal",
    ColorGradeBlending: "Blend",
    Sharpness: "Sharp",
    LuminanceSmoothing: "NR-L",
    ColorNoiseReduction: "NR-C",
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
  ParametricDarks: 5,
  ParametricLights: 5,
  ParametricShadows: 5,
  ParametricHighlights: 5,
  ParametricShadowSplit: 5,
  ParametricMidtoneSplit: 5,
  ParametricHighlightSplit: 5,
  SplitToningShadowHue: 5,
  SplitToningShadowSaturation: 5,
  ColorGradeShadowLum: 5,
  SplitToningHighlightHue: 5,
  SplitToningHighlightSaturation: 5,
  ColorGradeHighlightLum: 5,
  ColorGradeMidtoneHue: 5,
  ColorGradeMidtoneSat: 5,
  ColorGradeMidtoneLum: 5,
  ColorGradeGlobalHue: 5,
  ColorGradeGlobalSat: 5,
  ColorGradeGlobalLum: 5,
  SplitToningBalance: 5,
  ColorGradeBlending: 5,
  Sharpness: 5,
  LuminanceSmoothing: 5,
  ColorNoiseReduction: 5,
};
