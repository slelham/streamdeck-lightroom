export type FlagState = -1 | 0 | 1 | number;

export interface PresetInfo {
  name: string;
  uuid: string;
}

export interface PresetFolder {
  name: string;
  presets?: PresetInfo[];
  count?: number;
}

export interface PresetSlot {
  index: number;
  name: string;
  uuid?: string | null;
  empty?: boolean;
}

export interface PresetBrowserState {
  folderCount?: number;
  folderIndex?: number;
  folderName?: string;
  presetCount?: number;
  pageIndex?: number;
  pageCount?: number;
  pageSize?: number;
  slots?: PresetSlot[];
  folders?: PresetFolder[];
}

export interface LightroomState {
  type?: "state";
  module?: string;
  rating?: number;
  flag?: FlagState;
  label?: string;
  tool?: string;
  params?: Record<string, number>;
  presetBrowser?: PresetBrowserState;
}

export interface AckMessage {
  type: "ack";
  id?: string | number;
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export type BridgeInbound = LightroomState | AckMessage | { type: string; [key: string]: unknown };

export interface BridgeCommand {
  id?: string;
  cmd: string;
  [key: string]: unknown;
}

export const BASIC_PARAMS = [
  "Temperature",
  "Tint",
  "Exposure",
  "Contrast",
  "Highlights",
  "Shadows",
  "Whites",
  "Blacks",
  "Texture",
  "Clarity",
  "Dehaze",
  "Vibrance",
  "Saturation",
] as const;

export type BasicParam = (typeof BASIC_PARAMS)[number];

export const DEFAULT_RECEIVE_PORT = 59837;
export const DEFAULT_SEND_PORT = 59838;
