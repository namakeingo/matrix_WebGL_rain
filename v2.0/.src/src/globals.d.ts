// What the page (and a worker's scope, whose window is itself: webpack.config.ts) carries beside
// the wallpaper's modules: its namespace, the tests' flag, the bundle's registrar, Wallpaper
// Engine's listeners, the readout's report (window.Support) and the tests' API (window.Rain3D).
import type { Matrix3DNamespace, Matrix3DTestOptions } from "./engine/namespace";
import type { SupportReport } from "./platform/support";
import type { TestApi } from "./debug/testapi";

// a Wallpaper Engine user property as it gives it ({ value })
export interface WallpaperProperty {
  // (a setting's value: a number, a bool, a string or a colour's text, by its kind in project.json)
  value: number | boolean | string;
}

export type WallpaperProperties = Record<string, WallpaperProperty>;

// Wallpaper Engine's general properties (fps: its FPS limit)
export interface GeneralProperties {
  fps?: number;
}

export interface WallpaperPropertyListener {
  applyUserProperties: (p: WallpaperProperties) => void;
  applyGeneralProperties: (p: GeneralProperties) => void;
  setPaused: (paused: boolean) => void;
}

declare global {
  interface Window {
    Matrix3D: Matrix3DNamespace;
    Matrix3DTest?: boolean | Matrix3DTestOptions;
    Matrix3DTrace?: { wallpaper?: unknown };
    Matrix3DFactory?: (name: string, body: () => void) => void;
    Matrix3DFactories?: Record<string, () => void>;
    wallpaperPropertyListener?: WallpaperPropertyListener;
    wallpaperRegisterAudioListener?: (listener: (array: ArrayLike<number>) => void) => void;
    Support?: SupportReport;
    Rain3D?: TestApi;
  }
}
