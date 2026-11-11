// The splashes' worker: the splashes' simulation (models/splashsim.ts) and the rain's landings wheel (models/rainwheel.ts) stepped a frame at a time (models/rainsimtick.ts) off the render thread (the worker part "splash" of the bundle:
// src/index.ts routes it here). Its client is a SteppedTask (platform/steppedtask.ts) made with each Splashes effect: the frame's payload (the settings, the operations in their order
// and the frame's time) is given to it as an event and its packet awaited by the frame (the frame's fork and join), so what the effect then draws and uploads is, bit for bit, what the
// simulation run on the render thread gives. The worker keeps a simulation of its own, handed the render thread's state when it is taken and checkpointed to it now and then.
//
// Changelog:
// 2026-11-10: new.
// 2026-11-10: the model is the splashes' and the rain's wheel together (models/rainsimtick.ts).
import { M } from "../engine/core";
import { workerScope } from "../platform/scope";
import { serveStepped } from "../platform/steppedtask";
import { SplashSim } from "../models/splashsim";
import { RainSimTick } from "../models/rainsimtick";
import { RainWheel } from "../models/rainwheel";
import { StepClock } from "../engine/clock";

// the checkpoint a worker sends every this many ticks (frames)
const CHECKPOINT_EVERY = 24;

function serve(): void {
  // (the seed, the step clock's rate and the wheel's state are replaced by the first snapshot the worker is handed; the wheel and the simulation share the clock, as the render
  // thread's do)
  serveStepped(
    workerScope(),
    () => {
      const clock = new StepClock(M.Rain.STEP_RATE);
      return new RainSimTick(new SplashSim(M.Rain.SEED, clock, () => {}), new RainWheel(clock, () => {}), false);
    },
    { checkpointEvery: CHECKPOINT_EVERY, keep: 0 }
  );
}

export const SplashWorker = { serve, CHECKPOINT_EVERY };

M.SplashWorker = SplashWorker;
