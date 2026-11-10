// The readout of what the browser supports (a UI element, over the scene): the browser, WebGL
// 2.0's version, renderer and limits, WebGPU's adapter, features, limits and checks, and whether
// the bolt's shapes are made in a Web Worker (once known), where the renderer runs (a worker or the
// page, and why), from the report (Support); renewed when asked (once a second), never per frame,
// and the page written only where its text or what is shown changed. Always on the page: with
// the renderer in a worker, the report comes from it.
//
// Changelog:
// 2026-11-04: TypeScript, a module of src/debug/ (was engine/readout.js).
// 2026-11-04: the OLED readout's section (oledLines).
// 2026-11-05: the HDR probe's section (hdrLines).
// 2026-11-06: the GPU latency line of the Performance readout (latencyLine).
// 2026-11-06: the quality lines of the Performance readout (qualityLines) and the report's assembling (assembleQuality).
import { M } from "../engine/core";
import type { SupportReport, PerformanceReport, MouseReport, MusicReport, OledReport, HdrReport, HdrOutputReport } from "../platform/support";
import type { FrameHealthReport } from "./debug";
import type { EffectQuality, QualityReport, QualityPoolReport } from "../models/quality/types";

export class SupportReadout {
  written: { text: string | null; display: string | null; panel: string | null };
  shown: boolean;
  panel: HTMLCanvasElement;
  text: HTMLElement;
  report: SupportReport;
  // text: the readout's element; panel: WebGPU's panel's canvas, behind it
  constructor(report: SupportReport, text: HTMLElement, panel: HTMLCanvasElement) {
    this.report = report;
    this.text = text;
    this.panel = panel;
    this.shown = false;
    // what the page shows now (its text, and each element's display)
    this.written = { text: null, display: null, panel: null };
  }

  // its sections: what the browser supports (with Show support, or after a failure), then Debug
  // mode's Performance, Music and OLED readouts (report.debug)
  lines(): string[] {
    const d = this.report.debug;
    const lines = !d || d.support ? this.supportLines() : [];
    if (d && d.performance) {
      if (lines.length) {
        lines.push("");
      }
      lines.push(...SupportReadout.performanceLines(d.performance));
    }
    if (d && d.music) {
      if (lines.length) {
        lines.push("");
      }
      lines.push(...SupportReadout.musicLines(d.music));
    }
    if (d && d.oled) {
      if (lines.length) {
        lines.push("");
      }
      lines.push(...SupportReadout.oledLines(d.oled));
    }
    return lines;
  }

  // Debug mode's Performance readout: the frames a second (their limit), the frame's script and
  // GPU time, the scene's size and counts, the frames' health
  static performanceLines(p: PerformanceReport): string[] {
    const limit = `limit ${p.limit}: Frame cap ${p.frameCap}, Wallpaper Engine's FPS ${p.wallpaperFps > 0 ? p.wallpaperFps : "-"}`;
    return [
      `Performance: ${p.fps.toFixed(1)} fps (${limit})${p.frozen ? `, frozen ${p.frozenFor} s` : ""}`,
      `  script ${p.scriptMs.toFixed(2)} ms a frame`,
      p.timer && p.gpuMs !== null ? `  GPU ${p.gpuMs.toFixed(2)} ms a frame (the GPU guard's timer queries)` : `  GPU: not measured (${p.timer ? "no pass timed yet" : "no timer queries"})`,
      `  screen ${p.width} x ${p.height}, drops ${p.drops} falling, splashes ${p.splashes}, strikes ${p.strikes}`,
      SupportReadout.framesLine(p.frames),
      SupportReadout.latencyLine(p.frames),
      ...SupportReadout.qualityLines(p.quality),
      ...(p.mouse ? [SupportReadout.mouseLine(p.mouse)] : []),
    ];
  }

  // the Performance readout's Mouse line: the mode, the cursor and where it is, the offsets in the mode's units (rotation: degrees; translation: metres), where the
  // smoothing runs, and whether the view is still moving
  static mouseLine(m: MouseReport): string {
    if (!m.on) {
      return "  Mouse parallax: off";
    }
    const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
    const offsets = m.mode === "rotation" ? `yaw ${deg(m.yaw)}°, pitch ${deg(m.pitch)}°` : `eye x ${m.eyeX.toFixed(2)} m, y ${m.eyeY.toFixed(2)} m`;
    return `  Mouse parallax: eye ${m.mode}, cursor (${m.x.toFixed(2)}, ${m.y.toFixed(2)}) ${m.inside ? "inside" : "outside"}, ${offsets}, ${m.worker ? "worker" : "inline"}, ${m.moving ? "moving" : "still"}`;
  }

  // the effects' quality: a line for each effect class and one for the quality pool, never one for each instance
  // (null or missing: not counted yet)
  static qualityLines(q: QualityReport | null | undefined): string[] {
    if (!q) {
      return ["  Quality: counted once the wallpaper has loaded"];
    }
    const lines = q.effects.map((e) => {
      const numbers = e.units > 0 ? `  Quality ${e.name}: ${e.units} ${e.unit}, ${e.drawn} drawn, mean level ${Math.round(e.meanLevel)} of 40` : `  Quality ${e.name}: level ${Math.round(e.meanLevel)} of 40`;
      return e.note ? `${numbers}, ${e.note}` : numbers;
    });
    const p = q.pool;
    if (p.mode === "none") {
      lines.push("  Quality pool: none (the quality is not computed in workers yet)");
    } else {
      lines.push(`  Quality pool: ${p.workers} ${p.workers === 1 ? "worker" : "workers"}, ${p.ms.toFixed(2)} ms${p.waitedMs > 0 ? `, waited ${p.waitedMs.toFixed(2)} ms` : ""}${p.late > 0 ? `, ${p.late} late` : ""}${p.restarts ? `, ${p.restarts} ${p.restarts === 1 ? "restart" : "restarts"}` : ""}`);
    }
    return lines;
  }

  // what an effect did with the quality this frame, from its own counters (a count of -1 or 0: nothing to say, an empty note):
  // rain direct/reach/mirror, splashes direct/mirror/live, bolt listed/mirror, fog held/slices, reflection and waves skipped
  static noteOf(name: string, c: Record<string, number>): string {
    switch (name) {
      case "rain":
        return c.direct >= 0 ? `direct ${c.direct} of ${c.reach}${c.mirror >= 0 ? `, mirrored ${c.mirror}` : ""}` : "";
      case "splashes":
        return c.direct >= 0 ? `direct ${c.direct}, mirrored ${c.mirror} of ${c.live} live` : "";
      case "bolt":
        return c.listed > 0 ? `${c.listed} pieces listed${c.mirror > 0 ? `, mirrored ${c.mirror}` : ""}` : "";
      case "fog":
        return c.held > 0 ? `${c.held} of ${c.slices} slices held` : "";
      case "reflection":
        return [c.skipped > 0 ? `${c.skipped} passes skipped` : "", c.reused > 0 ? `mirrored picture reused ${c.reused} of ${c.reused + c.drawn} frames` : ""].filter(Boolean).join(", ");
      case "waves":
        return c.skipped > 0 ? `${c.skipped} searches skipped` : "";
      case "lightning":
        return c.hidden > 0 ? `${c.hidden} strikes hidden` : "";
      case "water":
        return "no quality job, its flat path decides per pixel on the GPU";
      default:
        return "";
    }
  }

  // the quality report of the effects in their order (name: the class's name in lower case; unit: its QUALITY_UNIT);
  // the pool's line says it does not exist yet
  static assembleQuality(entries: { name: string; unit: string; quality: EffectQuality; note?: string }[], pool?: QualityPoolReport): QualityReport {
    return {
      effects: entries.map((e) => {
        const line: QualityReport["effects"][number] = { name: e.name.toLowerCase(), unit: e.unit, units: e.quality.units, drawn: e.quality.drawn, meanLevel: e.quality.meanLevel };
        if (e.note) {
          line.note = e.note;
        }
        return line;
      }),
      pool: pool || { workers: 0, ms: 0, waitedMs: 0, late: 0, mode: "none" },
    };
  }

  // the frames' health: dropped (sent while the GPU was still busy with the frame before), missed
  // (due, never drawn) and stalls (gaps over 100 ms and 3 frame intervals), each in total and in
  // the last second, the longest stall, the display's refresh as measured
  static framesLine(f: FrameHealthReport | null): string {
    if (!f) {
      return "  frames: counted once the wallpaper has loaded";
    }
    const hz = f.refreshMs > 0 ? (1000 / f.refreshMs).toFixed(0) : "-";
    return `  frames: dropped ${f.dropped} (${f.droppedLast} in the last second), missed ${f.missed} (${f.missedLast}), stalls ${f.stalls} (${f.stallsLast}), longest stall ${Math.round(f.longestStallMs)} ms, display ${hz} Hz`;
  }

  // how long each frame's GPU work took to finish, from the frame being sent (the GPU process' queue and scheduling included, which
  // the guard's timer queries do not see): from the histogram of every frame since the counting began, the median and the 95th
  // percentile (the upper edge of the bucket holding them), the share over the display's 8.33 ms, and the longest of the last second
  static latencyLine(f: FrameHealthReport | null): string {
    if (!f) {
      return "  GPU latency: counted once the wallpaper has loaded";
    }
    const edges = M.FrameHealth.LATENCY_EDGES;
    const hist = f.latencyHist;
    let total = 0;
    for (let i = 0; i < hist.length; i++) {
      total += hist[i];
    }
    if (total === 0) {
      return "  GPU latency: no frame measured yet";
    }
    // (the upper edge of the bucket in which the running count reaches the share of the frames: "over" the last edge for the last bucket)
    const upTo = (share: number): string => {
      let run = 0;
      for (let i = 0; i < hist.length; i++) {
        run += hist[i];
        if (run >= share * total) {
          return i < edges.length ? `under ${edges[i]} ms` : `over ${edges[edges.length - 1]} ms`;
        }
      }
      return `over ${edges[edges.length - 1]} ms`;
    };
    const frame = edges.indexOf(8.33);
    let over = 0;
    for (let i = frame + 1; i < hist.length; i++) {
      over += hist[i];
    }
    return `  GPU latency (frame sent to its work done): median ${upTo(0.5)}, 95% ${upTo(0.95)}, over 8.33 ms: ${((100 * over) / total).toFixed(1)}% of ${total} frames, longest in the last second ${Math.round(f.latencyLast)} ms`;
  }

  // Debug mode's Music readout: what the audio arrays carry, and with React to music (the follower) what the music does: driving or idle, the followed loudness and floor, the best
  // peak score and the threshold, the tempo and the factors of a peak's score, the music strikes lately, the rain it sets
  static musicLines(m: MusicReport): string[] {
    const l = m.levels;
    const f = m.follower;
    const lines = [
      `Music (${m.source}${f ? (f.driven ? ", driven" : ", idle") : ""}): ${Math.round(m.rate)} arrays a second`,
      `  loudness ${l.loudness.toFixed(3)}, left ${l.left.toFixed(3)}, right ${l.right.toFixed(3)}`,
      `  bass ${l.bass.toFixed(3)}, mid ${l.mid.toFixed(3)}, treble ${l.treble.toFixed(3)}`,
      l.peakBin >= 0 ? `  peak ${l.peak.toFixed(3)} at bin ${l.peakBin} of 64` : "  peak: none (silence)",
    ];
    if (f) {
      lines.push(
        `  followed loudness ${f.loudness.toFixed(3)}  floor ${f.floor.toFixed(3)}`,
        `  best peak score ${f.scoreMost.toFixed(3)}  threshold ${f.threshold.toFixed(3)}`,
        `  tempo ${f.tempo > 0 ? Math.round(f.tempo) + " bpm" : "-"}  x${f.tempoFactor.toFixed(2)}`,
        `  song energy x${f.energyFactor.toFixed(2)}  brightness x${f.brightnessFactor.toFixed(2)}`,
        `  music strikes in the last ${f.strikeWindow} s: ${f.strikes}`,
        `  rain target ${f.target} drops (density ${f.density.toFixed(1)} of ${f.densitySet}), ${f.falling} falling of ${f.wanted} wanted`
      );
    }
    return lines;
  }

  // Debug mode's OLED readout: OLED Pixel Shift (the most a shift may reach from where it started,
  // across or down; 0: off), the scene's shift across, the clock's and the message's across and
  // down, in pixels
  static oledLines(o: OledReport): string[] {
    return [
      `OLED Pixel Shift: at most ${o.limit} px from where they started, across or down${o.limit === 0 ? " (off)" : ""}`,
      `  scene ${o.scene.x} px across`,
      `  clock ${o.clock.x} px across, ${o.clock.y} px down`,
      `  message ${o.message.x} px across, ${o.message.y} px down`,
    ];
  }

  // the HDR probe's section: nothing until it has run
  static hdrLines(h: HdrReport | null, out?: HdrOutputReport | null): string[] {
    if (!h) {
      return [];
    }
    return [
      "HDR (what the page can show):",
      `  Display: dynamic range ${h.display}, video dynamic range ${h.video}, colour gamut ${h.gamut}, colour depth ${h.colorDepth === null ? "unknown" : `${h.colorDepth} bits`}`,
      `  WebGPU canvas, extended tone mapping: ${h.webgpu}`,
      `  WebGL canvas, HDR output (drawingBufferStorage, drawingBufferToneMapping): ${h.webgl}`,
      SupportReadout.outputLine(out),
    ];
  }

  // the HDR output's line: HDR with its headroom; else SDR as always, with the reason where the
  // setting is on but HDR is not used
  static outputLine(out?: HdrOutputReport | null): string {
    if (out && out.on) {
      return `  This wallpaper's output: HDR (extended range: 1 = SDR white, up to ${out.headroom})`;
    }
    const sdr = "  This wallpaper's output: SDR (ACES, sRGB, 0 to 1)";
    return out && out.why && out.why !== "HDR setting off" ? `${sdr}; HDR not used: ${out.why}` : sdr;
  }

  supportLines(): string[] {
    const w = this.report.webgl2;
    const g = this.report.webgpu;
    const lines = ["Matrix 3D Rain WebGL 2.0: what this browser supports", `Browser: ${this.report.browser}`, ""];
    if (w.ok) {
      lines.push(`WebGL 2.0: yes (${w.version}, ${w.glsl})`);
      lines.push(`  Renderer: ${w.renderer}`);
      lines.push(`  Max texture ${w.maxTexture}, MSAA up to ${w.maxSamples}x, float render targets: ${w.floatTargets ? "yes" : "no"}`);
      lines.push(`  Timer queries: ${w.timerQueries ? "yes (the GPU guard sizes each pass's pieces by its time)" : "no (the GPU guard's pieces at small fixed sizes)"}`);
    } else {
      lines.push(`WebGL 2.0: no (${w.error})`);
    }
    lines.push("");
    if (g.ok) {
      lines.push(`WebGPU: yes${g.fallbackAdapter ? " (a fallback adapter: software)" : ""}`);
      lines.push(`  Adapter: ${g.adapter}`);
      lines.push(`  Features (${g.features.length}):`);
      for (let i = 0; i < g.features.length; i += 4) {
        lines.push(`    ${g.features.slice(i, i + 4).join(", ")}`);
      }
      lines.push(`  Max texture ${g.limits.maxTextureDimension2D}, max buffer ${Math.round(g.limits.maxBufferSize / 1048576)} MB, canvas format ${g.format || "?"}`);
      lines.push(`  Compute (the drops' layout): ${g.compute}`);
      lines.push(`  Render to a texture, read back: ${g.render}`);
      lines.push(`  This panel: ${g.frames} frames, ${g.errors.length ? `errors: ${g.errors.join("; ")}` : "no errors"}`);
    } else {
      lines.push(`WebGPU: not available (${g.error || "checking"})`);
    }
    lines.push("");
    lines.push(`The drops' layout from: ${this.report.drops.source === "webgpu" ? "WebGPU" : "the script"}`);
    const t = this.report.threads;
    if (t) {
      lines.push(`Threads: protocol ${t.protocol}, crossOriginIsolated ${t.crossOriginIsolated ? "yes" : "no"}, SharedArrayBuffer ${t.sharedArrayBuffer ? "yes" : "no"}, OffscreenCanvas ${t.offscreenCanvas ? "yes" : "no"}, cores ${t.cores}, requestIdleCallback ${t.idle ? "yes" : "no"}, postTask ${t.postTask ? "yes" : "no"}`);
    }
    const r = this.report;
    if (r.renderer === "worker") {
      lines.push(`Renderer: in a worker (OffscreenCanvas; shared state: ${r.rendererShared ? "SharedArrayBuffer" : "messages"}), the page's thread keeps only the page`);
    } else if (r.renderer === "page") {
      lines.push(`Renderer: on the page (${r.rendererWhy || "?"})`);
    }
    if (this.report.workers !== undefined) {
      lines.push(`Workers: ${this.report.workers ? `yes (${this.report.workers}), the bolt's shapes made off the main thread` : "no, the bolt's shapes made on the main thread, a slice a frame"}`);
    }
    const hdr = SupportReadout.hdrLines(this.report.hdr, this.report.hdrOutput);
    if (hdr.length) {
      lines.push("", ...hdr);
    }
    return lines;
  }

  // shows it (with its panel, when WebGPU draws one) or hides it
  show(panelReady?: boolean) {
    const w = this.written;
    const display = this.shown ? "block" : "none";
    const panel = this.shown && panelReady ? "block" : "none";
    if (w.display !== display) {
      w.display = this.text.style.display = display;
    }
    if (w.panel !== panel) {
      w.panel = this.panel.style.display = panel;
    }
    if (this.shown) {
      const text = this.lines().join("\n");
      if (w.text !== text) {
        w.text = this.text.textContent = text;
      }
    }
  }
}

M.SupportReadout = SupportReadout;
