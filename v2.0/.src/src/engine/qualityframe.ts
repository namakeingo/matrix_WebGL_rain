// QualityFrame: the frame's controller for the quality pool (the Debug setting p628_setting_DebugQualityMode). It orders what a
// frame does around the quality job and keeps a pending frame safe; the wallpaper (the host) supplies the work.
// - "off": advance, draw, at once; nothing of the quality runs (the wallpaper does not even call the controller: its own frame is
//   the frame as it was).
// - "inline": advance, the jobs run synchronously on this thread (host.inline: the same pure code the workers run), draw, apply.
// - "workers": advance, the pool's run is posted, the work that needs no quality (host.work), then the replies are awaited and
//   the DRAW IS THE CONTINUATION (a promise's callback), then apply. A mode "workers" with no pool acts as "inline".
//   With host.fork (the effects' per-frame jobs: Effect.fork) its promise is awaited with the pool's replies, so the draw is the continuation of both, in the same frame.
// - In flight: a frame asked while the previous one is pending is skipped (counted in skipped, nothing called): the wallpaper
//   then draws nothing in that animation frame, so the frames' health sees the longer gap to the next drawn frame as missed
//   frames (FrameHealth.frame counts the gap, not the animation frames).
// - Late: a null result (the pool's late bound passed) draws with no quality applied (late counted).
// - Generation: every frame takes the generation number; cancel() and setMode() move it on and clear the in-flight flag, so a
//   continuation that finds another number neither draws nor applies (its outcome is "cancelled"). The wallpaper cancels on pause,
//   hide, a lost context, the effects being made again, a failure and the page's end, so a stale continuation never draws.
// - Failures: a throw in the continuation, or a pool run that rejects, goes to host.fail (once; outcome "failed"); in the
//   synchronous modes a throw propagates to the caller (the animation frame's try/catch, which makes it a failure).
// last is the outcome of the latest frame started ("drawn", "late", "cancelled" or "failed").
// - Lead (host.lead, workers mode, delayMs() > 0: the Parallax delay as lead time; Feature P1, story P4): each frame asks the pool for the jobs of host.lead.ahead(delayMs) (the inputs of the pose the view shows
//   delayMs later; pool.run(frame, jobs, params, { leadMs: delayMs })) and keeps the promise on a QualityLead.Board keyed by that view; at each frame the asks whose release time has come are released against
//   host.lead.live() (the view as it is now): the newest of the live view's key is applied (its results, awaited), the others are dropped; none (the first frames, an obsolete ask, no pose known) or a null
//   result (late or lost): the frame is answered as without the lead (jobs, params, a pool run in the frame; a null ask by host.inline with the frame's own params: the ThreadedTask rule's fallback).
//   Counters lead: asked, released (applied from an ask), fallback, dropped, and with host.lead.verify (the tests') checked and mismatched units. With delayMs() 0 or no host.lead nothing of this runs.
// summarize(levels) is the EffectQuality of a job's levels (a unit hidden at level 0).
//
// Changelog:
// 2026-11-06: new.
// 2026-11-23: the lead's per-effect validity (LeadEffect, margin, partial: the stale effects answered by their own job, carry of the units born since); verify counts unsafe units; fields and staleBy counters.
// 2026-11-23: the lead (host.lead, QualityLead.Board): asks a lead early, applied at the release frame; lead counters.
import { M } from "./core";
import { QualityLead } from "../models/quality/lead";
import type { ViewKey, Board, LeadApplied, LeadDetail, LeadEffect } from "../models/quality/lead";
import type { QualityJob, EffectQuality } from "../models/quality/types";
import type { QualityResults } from "./qualitypool";

export type QualityMode = "off" | "inline" | "workers";
export type QualityOutcome = "drawn" | "late" | "cancelled" | "failed";

// the pool as the controller uses it (QualityPool's run)
export interface QualityRunner {
  run(frame: number, jobs: QualityJob[], params: Record<number, object>, options?: { leadMs?: number; overlap?: boolean }): Promise<QualityResults | null>;
}

export interface QualityHostLead {
  // the lead in ms (0: no lead)
  delayMs(): number;
  // the frame's time in ms, on the clock of the parallax's schedule
  nowMs(): number;
  // the jobs, their parameters, the view key, each effect's LeadEffect, the margin the parameters were made with and what carry needs, for the pose the view shows msAhead later; null when no pose is known
  ahead(msAhead: number): { key: ViewKey; jobs: QualityJob[]; params: Record<number, object>; effects: Record<number, LeadEffect>; margin: number; state?: unknown } | null;
  // the view as it is at this frame (after the advance): its key, each effect's LeadEffect and the margin
  live(): { key: ViewKey; effects: Record<number, LeadEffect>; margin: number };
  // the results of an ask carried to this frame's units (the splashes born since get full quality), given the state ahead() returned
  carry?(results: QualityResults, state: unknown): QualityResults;
  // the tests': the units of a result applied from the lead that the frame's own jobs show and the result hides
  verify?(results: QualityResults): { checked: number; unsafe: number };
}

export interface QualityHost {
  pool: QualityRunner | null;
  // the Parallax delay as the lead time (optional)
  lead?: QualityHostLead;
  advance(): void;
  jobs(): QualityJob[];
  params(): Record<number, object>;
  inline(jobs: QualityJob[], params: Record<number, object>): QualityResults;
  work(): void;
  draw(): void;
  // fromLead: the results were made ahead for the view the camera shows now (a released ask), not for this frame's own inputs
  apply(results: QualityResults, fromLead?: boolean): void;
  fail(error: unknown): void;
  // the effects' per-frame jobs asked of their workers with the frame's exact inputs (Effect.fork): a promise of all answered; the draw waits for it with the pool's replies
  fork?(): Promise<unknown>;
  // what the quality job's parameters need (the camera's matrices): awaited right after the advance, before jobs and params
  forkFirst?(): Promise<unknown>;
}

const MODES: readonly string[] = ["off", "inline", "workers"];

export class QualityFrame {
  mode: QualityMode;
  generation: number;
  inFlight: boolean;
  skipped: number;
  late: number;
  applied: number;
  frames: number;
  last: Promise<QualityOutcome>;
  host: QualityHost;
  lead: { asked: number; released: number; fallback: number; dropped: number; partial: number; checked: number; unsafe: number; noneDue: number; fields: Record<string, number>; staleBy: Record<string, number> };
  private board: Board<Promise<QualityResults | null>> | null;
  private boardDelay: number;

  constructor(host: QualityHost) {
    this.host = host;
    this.mode = "off";
    this.generation = 0;
    this.inFlight = false;
    this.skipped = 0;
    this.late = 0;
    this.applied = 0;
    this.frames = 0;
    this.last = Promise.resolve("drawn");
    this.lead = { asked: 0, released: 0, fallback: 0, dropped: 0, partial: 0, checked: 0, unsafe: 0, noneDue: 0, fields: {}, staleBy: {} };
    this.board = null;
    this.boardDelay = 0;
  }

  setMode(mode: string): void {
    this.mode = (MODES.indexOf(mode) >= 0 ? mode : "off") as QualityMode;
    this.cancel();
  }

  // a pending frame will neither draw nor apply; the next one may start at once
  cancel(): void {
    this.generation++;
    this.inFlight = false;
    this.board = null;
  }

  // whether a frame in this mode forks (the workers mode with a pool: it calls the host's forkFirst and fork): the host leaves the work the fork does to it only then
  forking(): boolean {
    return this.mode === "workers" && !!this.host.pool;
  }

  frame(): "drawn" | "pending" | "skipped" {
    const host = this.host;
    const mode = this.mode === "workers" && !host.pool ? "inline" : this.mode;
    if (mode === "off") {
      host.advance();
      host.draw();
      this.last = Promise.resolve("drawn");
      return "drawn";
    }
    if (mode === "inline") {
      host.advance();
      const jobs = host.jobs();
      const results = host.inline(jobs, host.params());
      host.apply(results);
      host.draw();
      this.applied++;
      this.last = Promise.resolve("drawn");
      return "drawn";
    }
    if (this.inFlight) {
      this.skipped++;
      return "skipped";
    }
    host.advance();
    const generation = this.generation;
    this.inFlight = true;
    let fromLead = false;
    const hostLead = host.lead;
    const delayMs = hostLead ? hostLead.delayMs() : 0;
    let released: LeadApplied<Promise<QualityResults | null>> | null = null;
    let board: Board<Promise<QualityResults | null>> | null = null;
    const start = (): Promise<QualityResults | null> => {
      // (today's order: the frame's jobs and parameters, the forks, the run, the work; with a released ask the frame needs no jobs of its own)
      const jobs = released ? null : host.jobs();
      const params = released ? null : host.params();
      const forks = host.fork ? host.fork() : null;
      if (hostLead && board) {
        // (the jobs of the pose the view shows a lead later, asked now)
        const ahead = hostLead.ahead(delayMs);
        if (ahead) {
          const detail: LeadDetail = { effects: ahead.effects, margin: ahead.margin, state: ahead.state };
          board.ask(hostLead.nowMs(), ahead.key, host.pool!.run(this.frames++, ahead.jobs, ahead.params, { leadMs: delayMs }), detail);
          this.lead.asked++;
        }
      }
      let run: Promise<QualityResults | null>;
      if (released) {
        host.work();
        // (a null ask, late or lost: answered here with the frame's own jobs, the task's fallback)
        const ask = released;
        run = ask.payload.then((made) => {
          if (made) {
            let results: QualityResults = made;
            this.lead.released++;
            fromLead = true;
            // (the units born since the ask are given full quality: the host carries the ask's levels to the units that are live now)
            if (hostLead && hostLead.carry && ask.detail && ask.detail.state !== undefined) {
              results = hostLead.carry(results, ask.detail.state);
            }
            // (an effect whose key or step moved since the ask is answered by its own job, here, alone)
            if (ask.stale.length > 0) {
              const stale = ask.stale;
              const own = host.inline(
                host.jobs().filter((job) => stale.indexOf(job.effect) >= 0),
                host.params(),
              );
              results = { frame: results.frame, levels: Object.assign({}, results.levels, own.levels) };
              this.lead.partial++;
              for (const index of stale) {
                this.lead.staleBy[index] = (this.lead.staleBy[index] || 0) + 1;
              }
            }
            if (hostLead && hostLead.verify) {
              const v = hostLead.verify(results);
              this.lead.checked += v.checked;
              this.lead.unsafe += v.unsafe;
            }
            return results;
          }
          this.lead.fallback++;
          return host.inline(host.jobs(), host.params());
        });
      } else {
        if (board) {
          this.lead.fallback++;
        }
        // (with the lead other frames are in flight: the frame's own run goes beside them)
        run = host.pool!.run(this.frames++, jobs!, params!, board ? { overlap: true } : undefined);
        host.work();
      }
      return forks ? Promise.all([run, forks]).then(([results]) => results) : run;
    };
    const first = host.forkFirst ? host.forkFirst() : null;
    // (the lead: the asks whose release time has come, against the view as it is now: after forkFirst, which has set the pose the camera shows at this frame)
    if (hostLead && delayMs > 0) {
      if (!this.board || this.boardDelay !== delayMs) {
        this.board = new QualityLead.Board(delayMs / 1000);
        this.boardDelay = delayMs;
      }
      board = this.board;
      const live = hostLead.live();
      const taken = board.release(hostLead.nowMs(), live.key, { effects: live.effects, margin: live.margin });
      this.lead.dropped += taken.dropped;
      if (!taken.apply) {
        // (which field of the view kept the newest due ask from the live view, or whether its margin did not cover the live one)
        const lost = taken.newestDropped;
        if (!lost) {
          this.lead.noneDue++;
        } else {
          for (const name of Object.keys(live.key)) {
            if (lost.key[name] !== live.key[name]) {
              this.lead.fields[name] = (this.lead.fields[name] || 0) + 1;
            }
          }
          if (lost.detail && live.margin > lost.detail.margin) {
            this.lead.fields.margin = (this.lead.fields.margin || 0) + 1;
          }
        }
      }
      released = taken.apply;
    }
    // (a forkFirst of an older frame, cancelled meanwhile, starts nothing)
    const pending = first ? first.then(() => (generation === this.generation ? start() : null)) : start();
    this.last = pending.then(
      (results) => {
        if (generation !== this.generation) {
          return "cancelled";
        }
        this.inFlight = false;
        try {
          if (!results) {
            host.draw();
            this.late++;
            return "late";
          }
          // (the result first: the draw takes only what it says is seen)
          host.apply(results, fromLead);
          host.draw();
          this.applied++;
          return "drawn";
        } catch (error) {
          host.fail(error);
          return "failed";
        }
      },
      (error) => {
        if (generation !== this.generation) {
          return "cancelled";
        }
        this.inFlight = false;
        host.fail(error);
        return "failed";
      },
    );
    return "pending";
  }

  // an effect's quality from its job's levels: its units, those not hidden (level over 0), the mean level of those and the highest
  static summarize(levels: Uint8Array): EffectQuality {
    let drawn = 0;
    let sum = 0;
    let top = 0;
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (level > 0) {
        drawn++;
        sum += level;
        if (level > top) {
          top = level;
        }
      }
    }
    return { visible: drawn > 0, level: top, units: levels.length, drawn, meanLevel: drawn > 0 ? sum / drawn : 0, hidden: null, levels };
  }
}

M.QualityFrame = QualityFrame;
