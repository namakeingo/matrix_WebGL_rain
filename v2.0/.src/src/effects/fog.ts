// The fog: one medium of 3D clouds in the world, gathered into a volume fixed to the camera's view
// (froxels: a column per few pixels of the screen, SLICES slices along each column's ray), which
// every pixel, character and splash reads at its own distance.
// - The clouds: value noise of three sizes (24, 10 and 4 m), drifting and swirling, their
//   billows the noise between 0.4 and 0.6, with a haze of a fifth between them; as dense as Fog
//   intensity sets it; thinning out within about 4 m above the water. The air itself scatters and
//   takes away light too (AIR_SCATTER and AIR_EXTINCTION per metre: the atmosphere's clear air at the ground, about 0.65% over 300 m).
// - Their light, single scattering: the atmosphere's (the mean radiance of its sky, atmosAmbient(): the same sky the sky is seen as)
//   and diffuse moonlight from above (MOON, from MOON_DIR: materials/sky.ts), each through the
//   clouds between, scattered by the clouds' albedo (the two fog colors, linear, mixed by a noise
//   of its own: albedoAt); a little more for light scattered more than once (MULTIPLE). The
//   medium's own parameters (DENSITY_FULL, AIR_SCATTER, AIR_EXTINCTION, MULTIPLE, the phase function's constants, the default colors) are in
//   materials/fog.ts. The strikes' light
//   is scattered by the same albedo (the air's share of it white: AIR_SCATTER).
// - The clouds' shadow of the sky and the moon, baked: what gets to each place from them (8 m
//   towards them through the clouds, 4 places) in a grid fixed in the world (SHADE_ACROSS across
//   the world's width by x / distance, SHADE_UP up to SHADE_TOP by the height's square root: thin
//   near the water, where the medium changes fastest; SHADE_DEEP deep by the distance's logarithm
//   from SHADE_NEAR to FOG_FAR), its nodes on the grid's edges (the water is a node), read
//   trilinearly by the fog's light and by the light the water reflects diffusely. Above the grid
//   the medium is too thin to shade. Baked SHADE_RATE draws of layers a second (as many layers a
//   draw as the device writes at once: 8, or 4), by the time passed; each draw only over the
//   cells the view can read (its columns and rows scissored: viewBox), all of it again when the
//   view changes.
// - Each strike's shadows through the clouds, baked when it starts (the clouds hardly move while
//   it plays): what gets to each place of the same grid from each region of its emitter (Lightning:
//   the main channel merged; towards the region's nearest point, 4 places), one RGBA stack of
//   layers per strike's slot; read only by the bakes (on M.UNITS.bloomFrom, bound before them);
//   only over the cells the view can read, again for the playing strikes when the view changes.
// - The volume: for each column (the ray through its middle; the columns reach MARGIN of the
//   screen past each side, for reflected rays leaving the screen) and slice (from t(k / SLICES) to
//   t((k + 1) / SLICES), t(u) = SLICE_NEAR (e^(u ln(1 + FOG_FAR / SLICE_NEAR)) - 1): thin near
//   the eye, about 6% of the distance far away), the light gathered from the eye to the slice's
//   far end and the optical depth of the medium to there (what it lets through is its exponential: fogAt); each slice's medium taken at its middle,
//   its light weighted by (1 - e^(-σ dt)) / σ. Two volumes: along the eye's rays, and along their
//   mirror images below the water from where each meets still water (the reflection's). Built
//   slice by slice, two draws a slice (Froxels): the first reads the columns' sums so far and
//   writes the slice of both volumes, the second copies the slice into the sums. Each slice has a
//   framebuffer of its own, made once (nothing attached in a frame). (One draw writing a 3D
//   texture's layer and 2D textures at once wrote nothing through ANGLE's Direct3D 11, with no
//   error; and a draw never reads the picture it writes.)
// - The strikes' light, per unit of their light: a volume of its own, a stack of slices per slot
//   (its light's color: the clouds' albedo and the air's white share of what they scatter),
//   gathered once a strike from what the fog's volume lets through and the baked shadows: in the
//   frame after the one it starts in (its shadows baked there), before its light shows; in the
//   frame it starts in when it gives light at once; again when the view changes. Its flicker and
//   fade applied when it is read (fogAt: the slots' light in the uniform block, from setStrikes).
// - Refreshed by the time passed: VOLUME_RATE of the volume's slices a second (the first of a
//   frame's reading the sums of the slice before, from an earlier frame) and SHADE_RATE draws of
//   the shadow grid's layers (the clouds drift a few millimetres a frame): at 24 frames a second
//   a quarter of the volume and one draw a frame. The volume all at once after a gap in time of
//   more than REFRESH_GAP (a reset, or the tests' jumps), a change of a fog setting, of the view
//   or of the screen's size; the shadow grid (fixed in the world, baked over the view) after a
//   gap, a setting's change or a change of the view; a strike's shadows after a setting's change
//   or a change of the view too.
// - Reading it (fogAt): trilinear, between the columns and between the slices' ends; before the
//   first slice's end, a share of it. It can also give the strikes' share of the light alone
//   (the emitters' light it scatters, which blooms: see Bloom), the sky's and the moon's left out.
// - The strikes' programs are drawn once at the start, over one pixel (the driver finishes a
//   program when it is first used: about 0.25 s, otherwise at the first strike).
// - The noise: a 3D texture of 128^3 random values, smoothed (a box of 5 along each axis, twice)
//   and spread to the whole range again, wrapping round; made on the GPU once, slice by slice.
//   Read at the mipmap level of the part of the world a sample stands for (textureLod: the
//   implicit level comes from derivatives, undefined in branches that differ between pixels): a
//   froxel's size, a grid cell's, or the spacing of a shadow ray's places.
// - Without float pictures to draw into: no clouds and no volume; the air alone, worked out.
// - The slices and layers a piece of the GPU guard's are the guard's to size, by each pass's time.
// With M.TEST, `marched` makes every baked shadow marched instead (the tests compare the two).
// Its GLSL: Fog.GLSL (the uniform block, the light around and the volumes' reading: for anything
// seen through it; BOLT, the strikes' color), Fog.MEDIUM_GLSL (the medium itself, the grid's
// places, the shadows marched), Fog.SHADE_GLSL (the baked shadows read, and the clouds' light),
// Fog.GATHER_GLSL (a stretch of a ray's light), Fog.TEST_GLSL (the tests' `marched`), and, for
// the tests' views only, Fog.MARCH_GLSL (a march along a pixel's own ray).
//
// - What nothing reads is not gathered (models/quality/fog.ts, the quality job "fog": the quality modes only): with the
//   water drawn, a pixel below the horizon stops at the still water, the water reading the eye's volume at its hit and the
//   characters, splashes and bolt before the plane CULL_BELOW under it; a column's direct slices that start past that
//   distance along the rays of the column and its neighbours are held (the program's `uCull`, set per slice from the
//   job's levels: under QUALITY_LEVELS where some column holds the slice), the sums carried on unchanged. The strikes'
//   stacks hold the same direct slices. The mirrored volume and every column of the sky are gathered as always.
//
// - Level of detail (the quality modes, Effect.lod; models/quality/fog.ts): a column also holds a direct slice where its own ray's
//   transmittance bound is under TAIL_T (the dense tail: the program's `uTail`, the same test as the water's cut, `uCull`);
//   the gather reads the noise's octaves whose period is within the froxel's footprint as their mean (`uFar`); by the slice's level (the largest
//   transmittance bound over the columns, `QualityFog.Lod`) more octaves are read as their mean (`uDrop`). With lod off none applies.
//
// - The volume's build (engine/fogaccum.ts, models/fogaccum.ts): the slices the plan owes each frame are blended into the held volume (a slice moves 1/N of the way each sweep, N = 8,
//   from reduced, jittered columns), so no slice is replaced at once; a change of the view, a setting or a gap in time builds the whole volume exactly (Froxels.build) and starts the average again.
//
// Changelog:
// 2026-11-24: story P10, the LOD of the front shade grid by distance on the pool path (shadeLod: the pool jobs, their inline twin and the band jobs bake the lattice of each layer's stride; shadeLodRefresh: the sweep's periods, the draws a band fill wrote cells of forced due; M.ShadeLod, QualityFogShade.bakeLod, Schedule periods and force); both default on, the GPU fallback bake stays full resolution.
// 2026-11-24: the sweep priority after a band fill removed (its urgent jobs for every delta draw held the pool's reserved worker for about 0.6 s and the sweep's own draws were baked by the GPU): the takeover is the plain sweep. Schedule.prioritize and expect were removed with it (Schedule.force, story P10, is the due-at-once).
// 2026-11-24: story P8d, the band worker as the default handler of view changes on the pool path (shadeViewBands default true, shadeViewBandsState, shadeVbAsk, shadeVbStart, shadeVbServe, shadeVbRelease, shadeVbFill, shadeVbGpu, shadeVbReset): at the lead the whole reduced grid is asked as bands over the shadeaccum tasks (one set in flight), the delta cells are filled from it at the release frame, and the draws holding them are the sweep's next; the order of handlers is the bands, the pool delta worker, today's whole-grid GPU bake.
// 2026-11-24: story P8d: a continuous band mode on the default path (shadePoolBands, its hysteresis and weight) was written and removed again for the on-demand view-change handler below.
// 2026-11-24: story P8c, the shipped path's view change as a delta (shadeViewWorker, default true: shadeViewAsk, shadeViewDue, shadeViewServe, uploadShadeRects, shadeMargin; viewBoxes(target) with the margin M.ShadeDelta.margin): a view change owes only the cells the new boxes add, served by the workers a lead ahead, one draw a frame inline, the rest to the GPU after a deadline; today's whole-grid GPU bake for a settings, jump, switch or size change, an over-budget delta and the delay 0.
// 2026-11-24: the pool's statics (the shade grid's and the strikes' noise levels) from the CPU noise (noiseLevels, M.NoiseField): the 31 + 31 readPixels of shadeStart and strikeStart are gone.
// 2026-11-24: story P8b, the banded cyclic worker: shadeBands (default 0), shadeCore, shadeLeads, shadePlans, state.bandCycles; with shadeBands over 0 each frame asks one band (M.ShadeBands) of one task, uploaded and blended for its held layers only (accumulateBand), and a view change restarts nothing on the worker path.
// 2026-11-23: the shade grid's asks: one in flight at a time (shadeFlight), an inline run asked again after twice its time, the blend's weight 1 - (7/8)^(frames since the last release): the cadence is the pool's own.
// 2026-11-23: story P8b: the shade grid's accumulation worker read-back-free and lead-driven (shadeStream: M.ShadeAccumLead.Stream; shadeTasks in bands; shadeWarm, shadeWarmed, shadeEvery, shadeStreamFrame replace forkShade, shadeNoise and shadeNoiseMips; the state's byWorker, gpuFrames, inlineRuns, dropped, inlineMs, workerMs and log).
// 2026-11-23: qualityLeadKey (the quality job's lead: the built lens, the columns and which strikes shine).
// 2026-11-23: baseLive (the tests' option, null by default): the front snapshot is read again and again while a change's jobs run, at that epoch, and the jobs ask while armed whatever the snapshot's age.
// 2026-11-23: baseSnapshot(time) and baseJobRun(options): the tests' hooks (the shade snapshot read back with real waits; the job run here for the live pose at a factor, jitter and rows) for the light's isolation.
// 2026-11-24: the front volume's job output is uploaded for the slices the frame blends and the frames until the next job (FrontVolumeJob.extents, sliceCount from the stream's nextReleaseMs), the bands laid out for those slices only (assembleParts).
// 2026-11-23: the front volume's jobs are made for the time of the middle of the sweep that blends them (the release frame's time + half the sweep): the GPU path builds each slice at its own frame's time, the jobs one time for all the slices of a sweep.
// 2026-11-23: frontTimeOffset (M.TEST only: seconds added to the jobs' time, 0 by default).
// 2026-11-23: frontFactor (M.TEST only: the jobs' column reduction, 0 the job's own FACTOR) and frontTimeMode / frontTimeHeld (M.TEST only: 1 holds the jobs' time at the first ask's).
// 2026-11-23: frontJitterMode (M.TEST only: 0 the job's own index; 1 the accumulation's frame counter, as the GPU's pass; 2 held at index 0) and frontJitters (the jitter each job was made with, used at its upload).
// 2026-11-23: story P8a: the front volume's accumulation on a worker: frontWorker (default false), frontTasks, frontStream, frontGrid (the front shade grid baked on the CPU by the baseshade tasks, M.FrontVolumeJob.GridPolicy), frontAccumState,
//   frontWorkerFrame / frontGridUpdate / frontJobInput / frontDispatch, the accumulation's builds fed by FogAccumulation.upload (one texSubImage3D a job).
// 2026-11-23: the handshake: the base mist task and the baseshade tasks are warmed (their workers generate the noise before the first job: JobTask.warmWith); no job or band is asked of a task that is not warmed, the GPU's fresh pass covers; baseAccumState.inlineMs and workerMs (M.TEST statistics: n, sum, max).
// 2026-11-23: story M7b: the base mist worker's data from the CPU: no read-back (the noise is generated in the job's thread from NOISE_STRETCH, the base shade grid baked by the 'baseshade' tasks in bands: baseGrid, baseGridUpdate; baseFrontShade, default false: the front term is the air's value, true: the front layers baked too), the hooks noiseBytesGpu, baseShadeGpu, baseCpuGrid; baseSnapshot waits for the CPU grid; baseLive and the front snapshot's epoch are inert.
// 2026-11-23: fog.baseWorker is ENABLED by default by the user's decision (workers preferred by design; ignored at Parallax delay 0): measured +0.6 ms in the base mist's pass and +2.5 ms over all passes in view-change windows, from the asynchronous read-backs of the shade grid and the noise; to reduce: see the TODO in the cost test (pages/scenetest viewchangecostlead).
// 2026-11-23: (superseded by the line above) fog.baseWorker is OFF by default again: the worker variant costs about +2.5 ms of GPU in the other passes during a change (the asynchronous read-backs of the shade grid and the noise) and +0.6 ms in the base mist's own pass; the path stays built and tested with the option set on.
// 2026-11-23: fog.baseWorker is ON by default (ignored at Parallax delay 0); the jobs of a change wait for a front shade snapshot begun within 0.25 s of it (the GPU's pass covers the frames meanwhile) and start late at the schedule's frame index (baseStart, baseArmed).
// 2026-11-23: the base mist's view-change columns on a worker (Feature P1, story P6 = M7): baseWorker (default false), baseTask, baseStream, baseFeed, baseAccumState, baseWorkerFrame (the asks a lead ahead, the release and the upload of the job's output; the GPU's fresh pass is the fallback and the path with no lead), baseJobInput; leadFrame carries the ask's `moved` and target; the base shade's snapshot is read back asynchronously (engine/basemistfeed.ts).
// 2026-11-23: the plan's view decision is for the pose of the release frame (Parallax delay as lead time): leadDelay, poseSource and viewLead (M.FogPlan.ViewLead) ask the pose the view shows a lead later and release the decision at that frame, planInput carries it as `ahead`, and the pose a rebuild is for is the plan's builtFor; no lead: the plan decides from the camera's offsets as before.
// 2026-11-23: the layers start from Fog intensity 1 (no longer the air alone): the Fog intensity's factor is layerIntensity / 101 (was (i - 1) / 99 of the halved intensity with a floor of 1), so Fog 1 and 2 have clouds and a base mist; only 0 and below are none; the layers' effective intensities are 101 x factor.
// 2026-11-22: the volume's build is the temporal accumulation (FogAccumulation) after the first view frame, no refresh periods (every, due), the page option fogAccum gone; Fog.accum starts at M.FogAccum.FRAMES.
// 2026-11-21: the shadow grid's boxes follow the mouse parallax's yaw and eye offset (viewBoxes: QualityFogShade.viewRays, boxesFor; lowestSlope removed, the drift taken by drifted rays).
// 2026-11-21: the shadow grid's boxes carry a first row (viewBoxes, lowestSlope): a view whose every ray rises bakes the rows from the lowest height it reads, not from the water (QualityFogShade.rowFrom).
// 2026-11-21: Fog.coverage (the tests' switch), the plan's `coverage`: the perceptual level of detail (QualityFog.Lod.fullLevel).
// 2026-11-18: the plan's input carries the camera's lens and the lens the volume was built for (builtLens, kept with builtFor): a lens step is a move of the view.
// 2026-11-23: the lens is no move of the view: the block's fLens (floats 28 to 31, FogPlan.lensShift) shifts the read by the delta from builtLens, which is re-based in every rebuild (the plan's `view`: a setting, a gap, a move, the shade's path), and the quality job's inputs carry builtLens: an OLED Pixel Shift step no longer rebuilds the volume.
// 2026-11-24: the front volume's accumulation worker (frontWorker) is on by default: with the Parallax delay over 0 the jobs' volume is the picture's (closer to the exact volume than the GPU's chain); at delay 0 and with the option off the GPU path is today's.
// 2026-11-12: compile time: skyShadeMarched one march loop for the sky and the moon (i = -1 the sky), moonThrough folded into it; gather one density call site (densityFar's `far` flag, false = density).
// 2026-11-12: planInput: no grid framebuffers (no float render targets) gives 0 draws instead of reading their length (the frame threw with the extensions missing).
// 2026-11-12: readMargin: the volume's margin as the mirrored picture's pixels read it (the picture larger than the view).
// 2026-11-10: the frame's plan (uniform block values, the view decisions, the shade draws owed, the slices' periods and runs of slices built) is models/fogplan.ts's pure function, run here or asked of its worker in Fog.fork.
// 2026-11-07: level of detail by the slice's physical level (QualityFog.Lod): the refresh period (to 32 sweeps) and the octaves read as their mean (uDrop) by level.
// 2026-11-12: the moon's disc: the shade bake's moon channel the mean over the penumbra kernel (medium.glsl: skyShadeMarched; the tests' count: setMoonKernel), the sky box's
//   skyIrradiance and the glyphs' glyphSkyMoonLight in Fog.GLSL, the disc's constants.
// 2026-11-07: level of detail: the dense tail, the refresh by distance and the far octaves (Effect.lod).
// 2026-11-06: the quality job "fog" (the slices are its units): slices past the water along a column's rays are held, not
//   gathered; SLICES, SLICE_NEAR and FOG_FAR owned by models/quality/fog.ts.
// 2026-11-20: the volumes' and the sums' alpha hold the optical depth, not the transmittance (a product of per-slice transmittances written as half floats rounded down lost 4.7% in clear air); fogAt reads exp(-a).
// 2026-11-22: Feature U3, story M4: tailShare and tailScale (the front cloud's two-scale profile), frontTail() and frontScale() (clamped), carried by the plan input (floats 7 and 27 of the block) and the shade jobs' params; setting either marks the fog stale.
// 2026-11-22: Feature U3, story M2: the base mist is its own volume (engine/basemist.ts: BaseMistVolume, layers SLICES.. of the front volume's textures; baseStrength(), the schedule's events in update); sigma() is the split's front (split()); the analytic mist, MistBeyondBuild and the closed form beyond 300 m are gone; the block's fSecond.w is the base-volume flag; the front cloud has no 20% floor.
// 2026-11-21: the mist, an exponential height layer of white scattering (Feature U1, story U4: materials/fog.ts MIST, MIST_HEIGHT, mistDepth): Fog.mist() = intensity x MIST goes into the plan's block (fMoonGain.w);
//   the test switch noClouds takes the clouds out (sigma() 0) with the mist kept.
// 2026-11-20: Fog intensity maps to (intensity - 1) / 99 of the full density (was intensity / 100): the slider's minimum 1 is the air alone, no clouds.
// 2026-11-20: the atmosphere's tables and the sky's picture built off the main thread (Feature S1, story A4): setLight moves the gains at once and starts a 100 ms debounce (M.Debounce),
//   its end asks the atmosphere's JobTask (models/quality/atmosphere.ts, workers/atmosphereworker.ts) and a later update uploads the answer; the first build, a flush (reset, the first
//   update, the tests' frames) and a missing task build here with the same function.
// 2026-11-22: the balance of the two colours' prominence (Feature U1, story U4): balanceMain and balanceSecond (rebalance, on a colour setting: models/mistalbedo.ts balanceScales) scale the rgb of the two colours the block
//   carries (lightMain, lightSecond): both contribute the same luminance, linear in the noise's weight at every level of detail; no shader change.
// 2026-11-20: the atmosphere is the only sky (Feature S1, stories A2 and A5): no flag (Fog.GLSL and Fog.SHADE_GLSL are built once, always with the Atmosphere block), no flat SKY
//   and no sky gain (the Fog block is 28 floats: fMoonGain at 24), the Air tone (p202_setting_AirTone, was Sky tone) into the atmosphere's tables.
// 2026-11-05: the sky's and the moon's light settable (Sky/Orb brightness, Sky tone, Orb tone):
//   SKY and MOON are SKY_BASE and MOON_BASE times the block's gains (models/skylight.ts), a change
//   restarting the whole volume.
// 2026-11-04: TypeScript, a module of src/effects/ (was effects/fog.js); the medium's and the
//   sky's physical parameters moved to materials/fog.ts and materials/sky.ts, values unchanged.
import { M } from "../engine/core";
import { fill } from "../engine/glsl";
import { BaseMist, BaseMistVolume, baseMistPrograms } from "../engine/basemist";
import { StaticMist } from "../models/staticmist";
import { FogPair } from "../models/fogpair";
import { BaseMistShade } from "../models/basemistshade";
import type { ShaderProgram, UniformBlock, Uniforms, Programs, ProgramSources } from "../engine/gl";
import type { EffectContext, SharedGlsl } from "../engine/effect";
import type { Capabilities } from "../engine/namespace";
import { Atmosphere } from "../models/atmosphere";
import { MistAlbedo } from "../models/mistalbedo";
import { MAIN_DEFAULT, SECONDARY_DEFAULT, AIR_SCATTER, AIR_EXTINCTION, MULTIPLE, PHASE_FORWARD_G, PHASE_BACKWARD_G, PHASE_FORWARD_W, phaseGlsl, NOISE_CONTRAST, noiseStretchText, COLOUR_LO, COLOUR_HI, NOISE_STRETCH } from "../materials/fog";
import { MOON, MOON_DIR, MoonDisc } from "../materials/sky";
import { QualityFog } from "../models/quality/fog";
import { QualityFogShade } from "../models/quality/fogshade";
import { QualityStrikeShade } from "../models/quality/strikeshade";
import type { QualityPool } from "../engine/qualitypool";
import { QUALITY_LEVELS } from "../models/quality/types";
import type { EffectQuality, QualityJob, QualityShared } from "../models/quality/types";
import type { QualityStatics, QualityParams } from "../models/quality/jobs";
import type { FogQualityView } from "../models/quality/fog";
import type { ParallaxOffsets } from "../models/mouseparallax";
import { FogPlan } from "../models/fogplan";
import { FogAccum } from "../models/fogaccum";
import { BaseMistLead } from "../models/basemistlead";
import { FrontVolumeJob } from "../models/frontvolumejob";
import { FrontVolumeLead } from "../models/frontvolumelead";
import type { Stream as FrontVolumeStream } from "../models/frontvolumelead";
import type { FrontVolumeInput } from "../models/frontvolumejob";
import { ShadeAccumLead } from "../models/shadeaccumlead";
import { ShadeBands } from "../models/shadebands";
import type { ShadeBand } from "../models/shadebands";
import { ShadeDelta } from "../models/shadedelta";
import { ShadeViewBands } from "../models/shadeviewbands";
import { ShadeLod } from "../models/shadelod";
import type { Stream as ShadeAccumStream } from "../models/shadeaccumlead";
import type { Stream as BaseMistStream } from "../models/basemistlead";
import { BaseMistFeed } from "../engine/basemistfeed";
import { FogAccumulation, fogAccumPrograms } from "../engine/fogaccum";
import { ShadeAccumulation, shadeAccumPrograms } from "../engine/shadeaccum";
import { ShadeAccumGpu } from "../models/shadeaccumgpu";
import { ReflectionFrame } from "../models/reflectionframe";
import type { ReflectionFrameOf } from "../models/reflectionframe";
import type { FogPlanInput, FogPlanOutput, ViewDecision } from "../models/fogplan";
import type { ParallaxPoseOffsets } from "../models/parallaxpose";
import type { JobTask } from "../platform/jobtask";
import type { ShadeFreshJob } from "../workers/shadeaccumworker";
import type { BaseMistInput } from "../models/basemistjob";
import type { BaseShadeJob } from "../workers/baseshadeworker";
import { BaseShadeGrid } from "../models/baseshadegrid";
import type { AtmosphereJob } from "../models/quality/atmosphere";
import type { Debounce } from "../models/debounce";
import SEED_FRAGMENT_SOURCE from "../shaders/fog/seed_fragment.glsl";
import BLUR_FRAGMENT_SOURCE from "../shaders/fog/blur_fragment.glsl";
import FINISH_FRAGMENT_SOURCE from "../shaders/fog/finish_fragment.glsl";
import FOG_SOURCE from "../shaders/fog/fog.glsl";
import ATMOSPHERE_SOURCE from "../shaders/fog/atmosphere.glsl";
import AERIAL_SOURCE from "../shaders/fog/aerial.glsl";
import MEDIUM_SOURCE from "../shaders/fog/medium.glsl";
import SHADE_SOURCE from "../shaders/fog/shade.glsl";
import TEST_SOURCE from "../shaders/fog/test.glsl";
import GATHER_SOURCE from "../shaders/fog/gather.glsl";
import SLICE_SOURCE from "../shaders/fog/slice.glsl";
import GRID_FRAGMENT_SOURCE from "../shaders/fog/grid_fragment.glsl";
import LAYER_OUTPUT_SOURCE from "../shaders/fog/layer_output.glsl";
import LAYER_WRITE_SOURCE from "../shaders/fog/layer_write.glsl";
import STRIKE_TERM_SOURCE from "../shaders/fog/strike_term.glsl";
import MOON_CONSTANT_SOURCE from "../shaders/fog/moon_constant.glsl";
import SHADE_FRAGMENT_SOURCE from "../shaders/fog/shade_fragment.glsl";
import STRIKE_SHADE_FRAGMENT_SOURCE from "../shaders/fog/strike_shade_fragment.glsl";
import VOLUME_FRAGMENT_SOURCE from "../shaders/fog/volume_fragment.glsl";
import STRIKES_FRAGMENT_SOURCE from "../shaders/fog/strikes_fragment.glsl";
import COPY_FRAGMENT_SOURCE from "../shaders/fog/copy_fragment.glsl";
import MARCH_SOURCE from "../shaders/fog/march.glsl";
import BASE_SHADE_HEAD_SOURCE from "../shaders/fog/basemist_shade_head.glsl";
import SHADE_READ_SOURCE from "../shaders/fog/shade_read_fragment.glsl";
import { QualityLead } from "../models/quality/lead";

const NOISE = 128;
// the slices a job computes past the last build's plan for a column (the view has moved since the plan was made; a read past a column's cut clamps to it)
const CUT_SLACK = 4;
// the front volume's jobs in flight at most (a burst after a change of the view asks every frame: the workers' queue is bounded)
const FRONT_PENDING_MOST = 4;
// a front volume job's answer: the whole output (an inline run) or the bands' outputs and their rows (laid out for the slices uploaded: FrontVolumeJob.assembleParts)
interface FrontResult {
  whole: Uint16Array | null;
  bands: Uint16Array[];
  ranges: number[][];
  input: FrontVolumeInput;
}
// the smoothed values' spread brought back to the whole range and raised by the contrast: 0.5 + (v - 0.5) * 12 C, C = NOISE_CONTRAST (materials/fog.ts: NOISE_STRETCH)
// (two boxes of 5 along each axis leave 0.0145 of the uniform values' 0.289)
const BLUR_PASSES = 6;
// the furthest the fog is gathered along a ray (m)
const FOG_FAR = QualityFog.FOG_FAR;
// the volume: its slices along a ray, the distance scale of their spacing (m), the most columns
// (each at least TILE_LEAST pixels across), and how far past each side of the screen they reach
// (a share of it)
const SLICES = QualityFog.SLICES;
const SLICE_NEAR = QualityFog.SLICE_NEAR;
const COLUMNS_MOST = 28800;
const TILE_LEAST = 8;
const MARGIN = 0.1;
// how far the view can drift from the one the shadow grid's boxes were made for before they are made again (the mouse parallax's tolerance, models/mouseparallax.ts: 0.004 rad of pitch and of yaw, 0.03 m of the eye, a tenth more)
const DRIFT_PITCH = 0.0045;
const DRIFT_YAW = 0.0045;
const DRIFT_EYE = 0.033;
// the wait after the last change of the Sky/Orb settings before the atmosphere's tables are built, and how many main-thread task times are kept
const ATMOSPHERE_DEBOUNCE_MS = 100;
const ATMOSPHERE_TASKS_KEPT = 256;
// the shadow grid (fixed in the world): its cells, its top (m: the densest medium there is
// 0.3 e^(-12) per metre) and its nearest distance (m)
const SHADE_ACROSS = 128;
const SHADE_UP = 64;
const SHADE_DEEP = 96;
const SHADE_TOP = 48;
const SHADE_NEAR = 0.5;
// the volume's slices and the shadow grid's draws refreshed a second (a quarter of the volume and
// one draw a frame at 24 frames a second); all of it after a gap in time of more than
// REFRESH_GAP (s)
const SHADE_RATE = 24;
const REFRESH_GAP = 0.5;
// the quality pool's id for the shade grid's static data (the noise's levels 3..7), apart from the jobs' effects' indices
const SHADE_EFFECT = 100;
// and the strikes' shadow grids' static data (the noise's levels 0..7)
const STRIKE_EFFECT = 101;
// a strike gathered before its light shows is gathered again after a change of the view while
// it may still play (s: the longest Lightning playing time)
const STRIKE_LONGEST = 5;
const SLOTS = M.STRIKES_MOST;
// the strikes' light stored per unit of light times STRIKE_SCALE (half floats keep faint light)
const STRIKE_SCALE = 64;
// a strike's bakes' stages, one a frame: the two halves of its shadows, its light on the water,
// the two halves of its light in the fog
const STAGES = 5;
// the tests' march along a pixel's own ray: its segments
const MARCH_SEGMENTS = 96;

// the texture units a pair of volumes and their sums stay on
interface FroxelUnits {
  direct: number;
  mirror: number;
  sum: number;
  sumMirror: number;
}

// the fog's programs drawn in the frames
interface FogPasses {
  shade: ShaderProgram;
  strikeShade: ShaderProgram;
  volume: ShaderProgram;
  strikes: ShaderProgram;
  copy: ShaderProgram;
  strikesCopy: ShaderProgram;
  baseShade: ShaderProgram;
}

// the shadow grid's cells a draw of layers covers: [first column, columns, rows, first row]
type ViewBox = [number, number, number, number];

// a pair of volumes along the camera's rays (direct and mirrored) and the columns' sums so far,
// built slice by slice: each slice gathered by one program into the volumes' layer, then copied
// by another into the sums. stacks: stacks of SLICES layers one after another (the strikes': a
// stack a slot), each built on its own
class Froxels {
  down: number;
  across: number;
  sums: WebGLTexture[];
  volumes: WebGLTexture[];
  slices: WebGLFramebuffer[];
  sumFramebuffer: WebGLFramebuffer;
  stacks: number;
  // the layers of the textures: the stacks of SLICES, then `extra` (the front volume's: the base mist's)
  layers: number;
  units: FroxelUnits;
  gl: WebGL2RenderingContext;
  effect: Fog;
  // units: { direct, mirror, sum, sumMirror }, the texture units they stay on
  constructor(effect: Fog, units: FroxelUnits, stacks = 1, extra = 0) {
    this.effect = effect;
    this.gl = effect.gl;
    this.units = units;
    this.stacks = stacks;
    this.layers = SLICES * stacks + extra;
    this.sumFramebuffer = effect.createFramebuffer();
    // a framebuffer for each slice, the volumes' layers attached
    this.slices = [];
    this.volumes = [];
    this.sums = [];
    this.across = 0;
    this.down = 0;
  }

  resize(across: number, down: number) {
    const gl = this.gl;
    this.drop();
    this.across = across;
    this.down = down;
    this.volumes = [0, 1].map(() => Fog.texture3D(gl, gl.RGBA16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, across, down, this.layers));
    this.sums = [0, 1].map(() => M.RenderTarget.storage(gl, gl.RGBA16F, across, down, gl.NEAREST));
    const both = [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sums[0], 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.sums[1], 0);
    gl.drawBuffers(both);
    for (let k = 0; k < this.layers; k++) {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.volumes[0], 0, k);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, this.volumes[1], 0, k);
      gl.drawBuffers(both);
      this.slices.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // (each on its own unit for good)
    const bind = (unit: number, target: GLenum, texture: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, texture);
    };
    bind(this.units.direct, gl.TEXTURE_3D, this.volumes[0]);
    bind(this.units.mirror, gl.TEXTURE_3D, this.volumes[1]);
    bind(this.units.sum, gl.TEXTURE_2D, this.sums[0]);
    bind(this.units.sumMirror, gl.TEXTURE_2D, this.sums[1]);
  }

  drop() {
    for (const texture of this.volumes.concat(this.sums)) {
      this.gl.deleteTexture(texture);
    }
    for (const framebuffer of this.slices) {
      this.gl.deleteFramebuffer(framebuffer);
    }
    this.volumes = [];
    this.sums = [];
    this.slices = [];
  }

  // slices from..to of a stack gathered (the sums of the slice before `from` copied first, when
  // there is one), as the guard's pass `name` (its slices a piece); the programs' other values
  // already set (the gather's uSlice is the slice in its stack)
  // held: per slice 1 where some column may hold its direct slice (the gather's uCull), or null
  build(name: string, gather: ShaderProgram, copy: ShaderProgram, from: number, to: number, stack = 0, held: Uint8Array | null = null, drops: Uint8Array | null = null) {
    const gl = this.gl;
    const guard = this.effect.guard;
    const each = guard.size(name, "slice");
    const offset = stack * SLICES;
    gl.viewport(0, 0, this.across, this.down);
    gl.uniform1i(copy.use().uOffset, offset);
    guard.begin(name, "slice");
    const lod = this.effect.lod ? 1 : 0;
    gl.uniform1f(gather.use().uTail, lod);
    gl.uniform1f(gather.use().uFar, lod);
    gl.uniform1f(gather.use().uTailFlat, this.effect.frontFlatNow());
    if (from > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
      gl.uniform1i(copy.use().uSlice, from - 1);
      this.effect.quad.drawFull();
    }
    for (let k = from; k < to; k++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.slices[offset + k]);
      const u = gather.use();
      gl.uniform1i(u.uSlice, k);
      gl.uniform1f(u.uCull, held !== null && held[k] === 1 ? 1 : 0);
      if (drops !== null) {
        gl.uniform1f(u.uDrop, drops[k]);
      }
      this.effect.quad.drawFull();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sumFramebuffer);
      gl.uniform1i(copy.use().uSlice, k);
      this.effect.quad.drawFull();
      if ((k - from) % each === each - 1 || k === to - 1) {
        guard.piece();
      }
    }
    guard.end();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

// a view change's delta: the boxes it leads to, and for each draw the rectangles it adds with their slabs (one per rectangle, `layers` layers) and the layers each still waits for
interface ShadeViewJob {
  releaseMs: number;
  servedAt: number;
  boxes: ViewBox[];
  fallback: boolean;
  draws: Map<number, { rects: number[][]; slabs: Uint16Array[]; pending: number[] }>;
  // 'delta' (the pool workers' exact rectangles) or 'bands' (filled from the whole reduced grid of `set`); delta: the rectangles per draw
  kind: string;
  delta: number[][][];
  set: ShadeVbSet | null;
}

// a set of bands: the whole reduced grid asked as bands of the tasks, one set in flight; outputs by band, grid the joined whole once complete
interface ShadeVbSet {
  plans: ShadeBand[];
  inputs: ShadeFreshJob[];
  outputs: (Uint16Array | undefined)[];
  releaseMs: number;
  done: boolean;
  failed: boolean;
  grid: Uint16Array | null;
}

export class Fog extends M.Effect {
  static STAGES: number;
  static MARCH_GLSL: string;
  static GATHER_GLSL: string;
  static TEST_GLSL: string;
  static SHADE_GLSL: string;
  static MEDIUM_GLSL: string;
  static GLSL: string;
  static COPY_FRAGMENT: string;
  static FINISH_FRAGMENT: string;
  static BLUR_FRAGMENT: string;
  static SEED_FRAGMENT: string;
  static shadeFragment: (n: number) => string;
  static baseShadeFragment: (n: number) => string;
  static shadeReadFragment: () => string;
  static strikeShadeFragment: (glsl: SharedGlsl, n: number) => string;
  static volumeFragment: (test: boolean) => string;
  static strikesFragment: (glsl: SharedGlsl, test: boolean) => string;
  onShaded: ((slot: number) => void) | null;
  emitter: WebGLTexture | null;
  // (made only with float pictures: caps.floats)
  strikeDraws!: WebGLFramebuffer[][];
  shadeDraws!: WebGLFramebuffer[];
  strikeShade!: WebGLTexture;
  shade!: WebGLTexture;
  strikeLight!: Froxels;
  light!: Froxels;
  refreshed: { shadeLayers: number; volumeSlices: number; volumeBuilt: number; sliceFrom: number; strikeSlots: number; };
  marched: boolean;
  // the tests' count of the moon kernel's directions the GPU's bake takes (0: MoonDisc.KERNEL, as shipped)
  moonKernel: number;
  warmed: boolean;
  stale: boolean;
  boxes: ViewBox[];
  // the rays viewBoxes makes its boxes from (QualityFogShade.viewRays), kept: no allocation when the view moves
  viewRayBuffer: Float64Array;
  shadeCredit: number;
  shadePart: number;
  // the shade grid baked by the quality workers (Effect.lod on, with the pool: models/quality/fogshade.ts): the pool, the schedule (null until the noise's
  // levels went out), whether this frame is on that path, the version of the view the jobs are for, each draw's job number, layers still owed, box and
  // the slab its layers arrive in (and its view, when whole)
  shadePool: QualityPool | null;
  shadeSched: InstanceType<typeof QualityFogShade.Schedule> | null;
  shadeCpu: boolean;
  shadeVersion: number;
  shadeJob: Int32Array;
  shadePending: Int32Array;
  shadeBox: Int32Array;
  shadeSlab: Uint16Array[];
  shadeSlabView: (Uint16Array | null)[];
  // the strikes' shadow grids baked ahead by the workers (Effect.lod on, with the pool: models/quality/strikeshade.ts): the schedule (null until the noise's
  // levels 0..7 went out), the shadow points of each planned strike by its number, the staging sets of a strike's draws (its slabs, boxes, the strike
  // they are for, the slot that took them, the upload plan), each slot's strike number, whether its first stage is still to ask for the CPU's grid, and
  // whether its stages upload it
  strikeSched: InstanceType<typeof QualityStrikeShade.Schedule> | null;
  strikePoints: Map<number, Float32Array>;
  strikeSets: { uid: number; slot: number; slabs: Uint16Array[]; box: Int32Array; plan: { from: number; to: number }[] }[];
  strikeUid: Int32Array;
  strikeTry: Uint8Array;
  strikeCpu: Uint8Array;
  sliceCredit: number;
  sliceNext: number;
  cameraVersion: number;
  // the camera's base version and parallax offsets the volume and the shade were last built for (the view moved: a base change, or the offsets past MouseParallax.TOLERANCE)
  baseSeen: number;
  builtFor: ParallaxOffsets;
  // the camera's lens the volume was last built for (its rays; the read is shifted by the delta to the camera's lens, fLens), and the shade
  builtLens: { x: number; y: number };
  lastTime: number;
  gatheredAt: Float64Array;
  // the quality job's result: the slices some column holds (1), whether any, the camera version it was made for, and what
  // the frame's builds use (null: gather everything); the job's view object and whether its statics went out
  held: Uint8Array;
  heldAny: boolean;
  heldVersion: number;
  heldNow: Uint8Array | null;
  // the sweeps done, and the view the octaves dropped are taken from (version and columns)
  // per slice: how many of the noise's octaves (finest first) the gather reads as their mean (QualityFog.Lod.levelOctaves; the volume's uDrop)
  drop: Uint8Array;
  everyVersion: number;
  everyAcross: number;
  sweep: number;
  // the plan task (src/index.ts gives it; null: the plan is made inline) and the answer its fork got for the frame: the input it was asked with and the plan
  planTask: JobTask<FogPlanInput, FogPlanOutput> | null;
  // the Parallax delay (0 to 1; the lead in seconds), where the pose the view shows a given number of ms ahead comes from (src/index.ts gives it: Rain's poseAt; null: no pose known, the camera's own
  // offsets are asked) and the schedule of the view's decision; at the delay 0 the schedule is not used and the plan decides from the camera's offsets as before
  leadDelay: number;
  poseSource: ((msAhead: number) => ParallaxPoseOffsets | null) | null;
  viewLead: InstanceType<typeof FogPlan.ViewLead>;
  // the frame's release of the schedule (asked and released once a frame, shared by the fork and the update of the same time)
  leadFrame: { time: number; ahead: ViewDecision; askMoved: boolean; target: ParallaxOffsets } | null;
  answer: { input: FogPlanInput; output: FogPlanOutput } | null;
  qualityView: FogQualityView | null;
  // the shared inputs with the lens the volume is built for (the job's rays are the volume's: builtLens), a copy kept between frames
  qualityInputs: QualityShared["inputs"] | null;
  sentBounds: boolean;
  ready: Uint8Array;
  stage: Uint8Array;
  boltColor: Float32Array;
  levels: Float32Array;
  layers: number;
  columns: number[];
  passes: FogPasses | null;
  noise: WebGLTexture | null;
  ubo: UniformBlock;
  colorSecondary: Float32Array;
  colorMain: Float32Array;
  // the balance of the two colours' prominence (models/mistalbedo.ts balanceScales), recomputed when either colour setting is applied (rebalance): the factors a and b of the main and the secondary colour, and the
  // colours as the block carries them (rgb times a and b): the plan input's colours, so fMain and fSecond are the scaled colours wherever the shaders read them
  balanceMain: number;
  balanceSecond: number;
  lightMain: Float32Array;
  lightSecond: Float32Array;
  intensity: number;
  // Distance fog (p215): off removes every aspect of the fog: no volume or bake is drawn, and every reader finds the air clear (fParams.z -1)
  on: boolean;
  // the Orb's gain per channel (linear), as the uniform block holds it, and the Air tone (linear), as the atmosphere's tables are built with it
  moonGain: Float32Array;
  airTone: Float32Array;
  // the settings behind them
  skyMoonBrightness: number;
  airToneSetting: string;
  moonTone: string;
  // the atmosphere's tables' uniform block (aSH, aInfo, aOrb: 11 vec4), the water programs' picture (Atmosphere.picture: the seen sky's rows and the aerial span's table, SKY_W x PICTURE_H RGBA16F, read as uSkyTable), and the
  // milliseconds the last build took
  atmosphereMs: number;
  // the tables built off the main thread: the task (src/index.ts gives it; null: built here), the wait that follows the settings (100 ms after the last change), whether tables are owed
  // for the values held, the id of the request whose answer is awaited (0: none), the requests made, the main-thread tasks' ms (the last ATMOSPHERE_TASKS_KEPT), whether an update has
  // run (the first applies a pending change at once) and whether every update does (the tests' build)
  atmosphereTask: JobTask<AtmosphereJob, Float32Array> | null;
  atmosphereDebounce: Debounce;
  atmosphereOwed: boolean;
  atmosphereWanted: number;
  atmosphereRequests: number;
  atmosphereTasks: number[];
  atmosphereUpdated: boolean;
  settleAtmosphere: boolean;
  // M.TEST only: the factor of the volume's and the shade grids' refresh rates (1 as shipped; the cost tests set it near 0 for a static density)
  rateScale: number;
  // M.TEST only: the clouds taken out (sigma() 0) with the mist kept (the mist is the slider's factor times MIST, not tied to sigma)
  noClouds: boolean;
  // the front cloud's two-scale profile (Feature U3, story M4): the tail's share and scale (the tests' options; M6 binds them to settings): setting either marks the fog stale, so the volumes and the shade grid are rebuilt
  // the headed pair's temporary overrides of the layers' own Fog intensities (null: follow the single Fog intensity; M.TEST options; a change marks the fog stale)
  private baseIntensityValue: number | null;
  private frontIntensityValue: number | null;
  private tailShareValue: number;
  private tailScaleValue: number;
  // culling and level of detail of the two layers (Feature U3, story M5): the base layer's cull and flat slices apply with lod on when baseLodOn (M.TEST option); the front's tail flat threshold per metre (M.TEST option;
  // frontFlatNow() is 0 with lod off); whether the water is drawn (set by Rain3D: the base volume's mirror half is read only then)
  baseLodOn: boolean;
  tailFlat: number;
  waterDrawn: boolean;
  // the tests' switch of the perceptual level of detail (QualityFog.Lod.fullLevel; false: the physical level alone); shipped, always on
  coverage: boolean;
  // the tests' switch of the shadow grid's culling (rows under the lowest height the view reads are not baked; false: from row 0, as before the story; M.TEST only, shipped always true)
  cull: boolean;
  // the volume's temporal accumulation (Feature U1, story U6): the frames N of the average (M.FogAccum.FRAMES; M.TEST only: the tests set 0 for the committed all-exact build), the frames blended since the last reset, the N the volume is held for, the GL half
  accum: number;
  accumFrames: number;
  accumLast: number;
  accumulator: FogAccumulation | null;
  // the front shade grid's accumulation on the GPU (Feature U2, story V2): shadeAccum (default false) replaces the refresh by parts of the front grid with an exact bake on a start, a setting, a size, a view or a jump and
  // an accumulating frame (a reduced jittered bake blended in at 1 / 8) on every other; it applies only on the GPU path (Effect.lod off: with lod on, the workers' path owns the grid and the option is ignored, never an error;
  // switching either way makes the next frame an exact bake). shadeAccumulation: its passes (null without float pictures); shadeAccumSchedule: the decision (M.ShadeAccumGpu.Schedule); shadeAccumWas: whether the last frame
  // used it; shadeAccumState: what it did (the exact bakes since it was switched on, the accumulating frames since the last exact bake and in all, the last fresh bake's jitter index and time); shadeFresh: the fresh
  // reduced grid's texture (the tests read it back)
  private shadeAccumOn: boolean;
  // setting it (also to true when it is true) makes the next frame an exact bake and restarts the state's counters
  get shadeAccum(): boolean {
    return this.shadeAccumOn;
  }
  set shadeAccum(on: boolean) {
    this.shadeAccumOn = on;
    if (on) {
      this.shadeAccumWas = false;
    }
  }
  // the window's size the last resize saw, and whether it changed since the accumulation's last frame (the grid is fixed in the world, but a size change restarts the average as the model's rule says: M.ShadeAccum.resets)
  shadeSeenSize: number[];
  shadeAccumResize: boolean;
  shadeAccumulation: ShadeAccumulation | null;
  shadeAccumSchedule: InstanceType<typeof ShadeAccumGpu.Schedule>;
  shadeAccumWas: boolean;
  shadeAccumState: { exactBakes: number; frames: number; accumulations: number; jitterFrame: number; time: number; asks: number; uploads: number; freshBy: string; bandCycles: number; askedUnwarmed: number; byWorker: number; gpuFrames: number; inlineRuns: number; dropped: number; inlineMs: { n: number; sum: number; max: number }; workerMs: { n: number; sum: number; max: number }; log: { k: number; by: string }[] };
  shadeFresh: WebGLTexture | null;
  // the fresh reduced grid from the quality workers (Feature U2, story V3): shadeWorker (default false) with shadeAccum on, Effect.lod off and shadeTask there makes the grid of an accumulating frame the task's, asked in fork
  // (M.ShadeAccumWorker.leads decides: never the exact bake's frames) and uploaded into shadeFresh (asks and uploads count them, freshBy says whose the last grid was: "gpu" or "task").
  // Feature P1, story P8b: with the Parallax delay over 0 and the tasks warmed, one job (in bands, shadeTasks) is asked every shadeEvery-th frame a lead ahead (shadeStream: M.ShadeAccumLead.Stream) for the time and the jitter
  // index (shadeAskK, restarting at every exact bake) the frame will show at its release, and released at that frame (ONE texSubImage3D, blended at alphaFor(shadeEvery)); a late or lost answer is the same pure job run inline
  // (ThreadedTask rule: 25 to 40 ms for the whole grid); the noise is the CPU's (M.NoiseField, generated by the workers at the warm message): no GL read-back. Before the tasks were first warmed the GPU's own pass accumulates.
  // shadeEverWarmed: the tasks have been warmed once (a lost worker is answered inline from then on); shadeSkipped: frames waiting for the first release (nothing accumulated)
  // (the tests' timing of a volume build's kinds of draw: M.TEST only; 0 shipped. N above 0: the builds of the front volume (engine/fogaccum.ts) and of the base mist (engine/basemist.ts) time each draw of every Nth
  // slice (the fresh bake, the blend, the store) as a pass of its own named "<pass> fresh|blend|store <slice>", instead of the one pass of the whole build; a pass is a timer query and queries cannot nest, so no whole-build
  // pass is timed then. The draws and the picture are the same.)
  timeSplit: number;
  shadeWorker: boolean;
  shadeTask: JobTask<ShadeFreshJob, Uint16Array> | null;
  shadeTasks: JobTask<ShadeFreshJob, Uint16Array>[];
  shadeStream: ShadeAccumStream<ShadeFreshJob[], Uint16Array> | null;
  shadeReady: Map<number, Uint16Array>;
  shadeLive: Set<number>;
  shadeEvery: number;
  shadeEverWarmed: boolean;
  shadeWarmKey: string;
  shadeAskK: number;
  shadeAskFrames: number;
  // (the tests' deterministic ask rule: true asks every cadence frame whatever is in flight and blends at the weight of one frame, so that the grids do not depend on the wall clock; default false)
  shadeAskEveryFrame: boolean;
  // the banded cyclic worker (Feature P1, story P8b): shadeBands 0 (default) asks the whole fresh grid a job (bands across the tasks); B over 0 asks one band of B core layers of the 48 reduced layers a frame (M.ShadeBands),
  // rounded up to a multiple of the draws' layers over 2, uploaded in one texSubImage3D and blended into the held layers of its core only; on the worker path a view change restarts nothing (M.ShadeBands.resets). shadePlans: the band of each ask
  shadeBands: number;
  shadeBandsSeen: number;
  shadePlans: Map<number, ShadeBand>;
  // the view change on the pool path as a DELTA (Feature P1, story P8c; M.ShadeDelta): shadeViewWorker (default true) with the Parallax delay over 0 bakes each draw's box with a margin around it and asks, at the lead, only the cells a larger
  // move adds (shadeViewAsk, from the target pose), served at the release frame (shadeViewServe: the worker's answers uploaded per rectangle, one draw a frame inline, the rest to the GPU after a deadline); settings, jump, switch and size
  // changes, a delta over the workers' budget and the delay 0 are today's whole-grid GPU bake. shadeViewQueue: the asked jobs by release; shadeViewJob: the job the frame's boxes come from; shadeViewActive: the jobs being served;
  // shadeNoisePacked: the pool's noise (the inline run's)
  shadeViewWorker: boolean;
  shadeViewQueue: ShadeViewJob[];
  shadeViewJob: ShadeViewJob[] | null;
  shadeViewActive: ShadeViewJob[];
  shadeNoisePacked: Float32Array | null;
  shadeMarginKey: string;
  // the band worker as the default handler of VIEW CHANGES on the pool path (Feature P1, story P8d; M.ShadeViewBands): shadeViewBands (default true) with the Parallax delay over 0 asks, at the lead, the whole reduced grid as bands over the
  // 'shadeaccum' tasks (one set in flight: shadeVbCoalescer, shadeVbSet), and the delta cells of a view change are filled from it at the release frame (fillDelta, shadeVbRelease); the draws holding filled cells are then forced due in the sweep when the periods are on (Schedule.
  // force); the order of handlers is the bands, the pool delta worker (shadeViewWorker), today's whole-grid GPU bake. shadeVbWaiting: jobs whose set is not whole yet; shadeViewBandsState: the tests' counters
  shadeViewBands: boolean;
  // the LOD of the shade grid on the pool path (Feature P1, story P10; M.ShadeLod): shadeLod (default true) bakes each layer's lattice of its stride (the pool jobs, their inline twin, the band jobs); shadeLodRefresh (default true) gives the sweep's draws their
  // periods (shadePeriods: every N sweeps by distance) and forces the draws a band fill wrote cells of; shadePeriodsOn: the periods the schedule has now
  shadeLod: boolean;
  shadeLodRefresh: boolean;
  shadePeriods: number[];
  shadePeriodsOn: boolean;
  shadeViewBandsState: { changes: number; sets: number; asks: number; fills: number; coalesced: number; inlineBands: number; maxSetsInFlight: number; lastRects: number[][][] };
  shadeVbCoalescer: { ask(pose: ParallaxOffsets): string; released(): ParallaxOffsets | null; maxInFlight: number };
  shadeVbSet: ShadeVbSet | null;
  shadeVbWaiting: ShadeViewJob[];
  // the draws of the shade grid the GPU really baked (a non-empty box), since the start (the tests' count: the schedule's own gpuDraws counts the draws owed)
  shadeBaked: number;
  shadeMarginDirty: boolean;
  shadeViewState: { changes: number; contained: number; asks: number; deltaCells: number; fits: boolean; fallbacks: number; byWorker: number; inlineDraws: number; maxInlinePerFrame: number; gpuDraws: number; whole: number; last: { base: number[][]; target: number[][]; margin: number[] } | null };
  shadeFlight: number;
  // (the generation of the asks in flight: an answer that lands after the accumulation was started again must not count against the new run's flight)
  shadeGeneration: number;
  shadeLastRelease: number;
  shadeInlineAt: number;
  shadeInlineMs: number;
  shadeSkipped: number;
  // the base mist's volume (the layers of the front volume's textures after its own): null without float pictures
  baseMist: BaseMistVolume | null;
  // the base mist's view-change columns on a worker (Feature P1, story P6 = M7): baseWorker (default false) with the Parallax delay over 0 and baseTask there makes the fresh columns of an accumulating frame the task's, asked a
  // lead ahead for the pose the view shows at the release frame (baseStream, models/basemistlead.ts) and uploaded at that frame (BaseMistVolume.frame's job); the exact build and every frame with no lead are the GPU's. Default true (the user's decision). baseFeed reads
  // the noise and the shade grid back without blocking a frame; baseReady the answers by ask id; baseAccumState counts: asks (jobs asked), uploads (accumulating frames fed by a job: byWorker + byInline), dropped (obsolete
  // asks), gpuFrames (accumulating frames drawn by the GPU's fresh pass)
  baseWorker: boolean;
  baseTask: JobTask<BaseMistInput, Uint16Array> | null;
  baseStream: BaseMistStream<BaseMistInput, Uint16Array> | null;
  baseFeed: BaseMistFeed | null;
  baseReady: Map<number, Uint16Array>;
  baseShipGen: string;
  // the view change whose jobs are being started: when it was asked and whether the schedule has restarted for it (a late start continues at the schedule's frames), and whether the stream is armed for it
  baseStart: { time: number; released: boolean } | null;
  baseArmed: boolean;
  // the tests' live mode (seconds, null: off): while armed, every frame notes a change at that epoch so the front snapshot is read again as soon as it is older, and the jobs use the newest completed one
  baseLive: number | null;
  // the base mist worker's CPU data (story M7b): the shade grid's tasks (the bands are asked of them), the switch for the front cloud's shade (false, the default: the front term is the air's value and the front grid is not baked; true: the front
  // layers are baked as well, at the time of the bake), and the grid's controller: its version rule (start, strength, size), what it was baked for, the halves being filled, the bands still to ask and the tasks busy
  baseShadeTasks: JobTask<BaseShadeJob, Uint16Array>[];
  baseFrontShade: boolean;
  // the key of the warm message given to the tasks (the noise's stretch and version)
  baseWarmed: string;
  baseGridVersion: InstanceType<typeof BaseShadeGrid.Version>;
  baseGrid: { version: number; started: boolean; strength: number; front: boolean; size: boolean; halves: Uint16Array | null; queue: number[]; total: number; done: number; busy: boolean[]; time: number };
  baseAccumState: { asks: number; uploads: number; dropped: number; byWorker: number; byInline: number; gpuFrames: number; why: Record<string, number>; inlineMs: { n: number; sum: number; max: number }; workerMs: { n: number; sum: number; max: number } };
  // the front volume's accumulation on a worker (Feature P1, story P8a = V6): frontWorker (default false) with the Parallax delay over 0 and the frontTasks (a band of rows each, started when it is first on) makes the accumulating frames' fresh
  // columns the tasks', asked ahead by frontStream for the pose the view shows at the release frame and uploaded at it (FogAccumulation.upload); the exact builds and every frame with no lead are the GPU's. frontGrid is the front's shade grid
  // on the CPU (policy: M.FrontVolumeJob.GridPolicy; halves: the 192 layers in use; version: the shipped version; building: the bake in progress; seen: the settings it was baked for); frontAnswers the assembled outputs by ask id;
  // frontGridLag (M.TEST only): seconds the grid's bake time is put back; frontAccumState counts (asks, early: asks made while not warmed, uploads, dropped, superseded, byWorker, byInline, gpuSweeps: accumulating frames the GPU's fresh pass
  // drew, blends and skipped: the accumulation's, gridBakes, gpuReads: GPU read-backs made by this path, always 0)
  frontWorker: boolean;
  frontTasks: JobTask<FrontVolumeInput, Uint16Array>[];
  frontStream: FrontVolumeStream<FrontVolumeInput, FrontResult | null> | null;
  frontAnswers: Map<number, FrontResult>;
  frontShippers: InstanceType<typeof FrontVolumeJob.Shipper>[];
  frontShipGen: string[];
  frontStarted: boolean;
  frontWarmed: string;
  frontMoved: boolean;
  frontGridLag: number;
  // (the tests' switch of the jitter the jobs are made with: 0 the job's own index k, 1 the accumulation's frame counter at the ask (the GPU's per-frame index), 2 held at index 0; frontJitters: the jitter of each job in flight, by ask id)
  frontJitterMode: number;
  // (the tests' switches: the jobs' column reduction (0: M.FrontVolumeJob.FACTOR), and the jobs' time held at the first ask's (frontTimeMode 1; frontTimeHeld the time held, null until the first ask))
  frontFactor: number;
  frontTimeMode: number;
  // (the tests' offset: seconds added to the time the jobs are made for)
  frontTimeOffset: number;
  frontTimeHeld: number | null;
  frontJitters: Map<number, number[]>;
  frontGrid: { policy: InstanceType<typeof FrontVolumeJob.GridPolicy>; started: boolean; halves: Uint16Array | null; version: number; building: { front: Uint16Array; queue: number[]; total: number; done: number; busy: boolean[]; time: number; sigma: number; tail: number; scale: number } | null; seen: { sigma: number; tail: number; scale: number; base: number } };
  frontAccumState: { asks: number; early: number; uploads: number; dropped: number; superseded: number; byWorker: number; byInline: number; gpuSweeps: number; blends: number; skipped: number; gridBakes: number; gpuReads: number; why: Record<string, number>; inlineMs: { n: number; sum: number; max: number }; workerMs: { n: number; sum: number; max: number } };
  // the base mist's shade (Feature U3, story M3): its grid is the layers SHADE_DEEP.. of the shade texture, baked once (BaseMistShade.Schedule decides) by the GPU; bakes counts the grids baked since the start and strength is the one the
  // grid holds (the tests read both); baseShadeDraws are the framebuffers of its layers
  baseShade: { bakes: number; strength: number | null };
  shadeSchedule: InstanceType<typeof BaseMistShade.Schedule>;
  baseShadeDraws: WebGLFramebuffer[];
  // M.TEST only: false leaves the base mist's shade out of every read of the shade (it reads as 1) and the volumes built again
  baseShadeOn: boolean;
  baseShadeSeen: boolean;
  // (the tests' one-pixel picture of skyShade at a point: its target)
  shadeReadTarget: { texture: WebGLTexture; framebuffer: WebGLFramebuffer } | null;
  shadeReadProgram: ShaderProgram | null;
  atmosphereBlock: UniformBlock;
  skyTexture: WebGLTexture;
  constructor(context: EffectContext) {
    super(context);
    const gl = this.gl;
    this.intensity = 0.1;
    this.on = true;
    this.skyMoonBrightness = M.SkyLight.DEFAULT_BRIGHTNESS;
    this.airToneSetting = M.SkyLight.DEFAULT_AIR_TONE;
    this.moonTone = M.SkyLight.DEFAULT_MOON_TONE;
    this.moonGain = new Float32Array(3);
    this.airTone = new Float32Array([1, 1, 1]);
    this.atmosphereMs = 0;
    this.atmosphereTask = null;
    this.atmosphereOwed = false;
    this.atmosphereWanted = 0;
    this.atmosphereRequests = 0;
    this.atmosphereTasks = [];
    this.atmosphereUpdated = false;
    this.settleAtmosphere = !!M.TEST;
    this.rateScale = 1;
    this.noClouds = false;
    this.tailShareValue = StaticMist.TAIL_SHARE;
    this.tailScaleValue = StaticMist.TAIL_SCALE;
    this.baseIntensityValue = null;
    this.frontIntensityValue = null;
    this.baseLodOn = true;
    this.tailFlat = StaticMist.TAIL_FLAT;
    this.waterDrawn = true;
    this.coverage = true;
    this.cull = true;
    this.accum = FogAccum.FRAMES;
    this.accumFrames = 0;
    this.accumLast = 0;
    this.accumulator = null;
    this.shadeAccumOn = false;
    this.shadeSeenSize = [0, 0];
    this.shadeAccumResize = false;
    this.shadeAccumulation = null;
    this.shadeAccumSchedule = new ShadeAccumGpu.Schedule();
    this.shadeAccumWas = false;
    this.shadeAccumState = { exactBakes: 0, frames: 0, accumulations: 0, jitterFrame: 0, time: 0, asks: 0, uploads: 0, freshBy: "gpu", bandCycles: 0, askedUnwarmed: 0, byWorker: 0, gpuFrames: 0, inlineRuns: 0, dropped: 0, inlineMs: { n: 0, sum: 0, max: 0 }, workerMs: { n: 0, sum: 0, max: 0 }, log: [] };
    this.shadeFresh = null;
    this.shadeWorker = false;
    this.timeSplit = 0;
    this.shadeTask = null;
    this.shadeTasks = [];
    this.shadeStream = null;
    this.shadeReady = new Map();
    this.shadeLive = new Set();
    this.shadeEvery = 1;
    this.shadeEverWarmed = false;
    this.shadeWarmKey = "";
    this.shadeAskK = 0;
    this.shadeAskFrames = 0;
    this.shadeAskEveryFrame = false;
    this.shadeBands = 0;
    this.shadeBandsSeen = 0;
    this.shadePlans = new Map();
    this.shadeViewWorker = true;
    this.shadeViewQueue = [];
    this.shadeViewJob = null;
    this.shadeViewActive = [];
    this.shadeNoisePacked = null;
    this.shadeMarginKey = "0,0";
    this.shadeViewBands = true;
    this.shadeLod = true;
    this.shadeLodRefresh = true;
    this.shadePeriods = [];
    this.shadePeriodsOn = false;
    this.shadeViewBandsState = { changes: 0, sets: 0, asks: 0, fills: 0, coalesced: 0, inlineBands: 0, maxSetsInFlight: 0, lastRects: [] };
    this.shadeVbCoalescer = new ShadeViewBands.Coalescer<ParallaxOffsets>((a, b) => !M.MouseParallax.farFrom(a, b));
    this.shadeVbSet = null;
    this.shadeVbWaiting = [];
    this.shadeBaked = 0;
    this.shadeMarginDirty = false;
    this.shadeViewState = { changes: 0, contained: 0, asks: 0, deltaCells: 0, fits: true, fallbacks: 0, byWorker: 0, inlineDraws: 0, maxInlinePerFrame: 0, gpuDraws: 0, whole: 0, last: null };
    this.shadeFlight = 0;
    this.shadeGeneration = 0;
    this.shadeLastRelease = -1;
    this.shadeInlineAt = 0;
    this.shadeInlineMs = 0;
    this.shadeSkipped = 0;
    this.baseMist = null;
    this.baseWorker = true;
    this.baseTask = null;
    this.baseStream = null;
    this.baseFeed = null;
    this.baseReady = new Map();
    this.baseShipGen = "";
    this.baseStart = null;
    this.baseArmed = false;
    this.baseLive = null;
    this.baseShadeTasks = [];
    this.baseFrontShade = false;
    this.baseGridVersion = new BaseShadeGrid.Version();
    this.baseWarmed = "";
    this.baseGrid = { version: 0, started: false, strength: NaN, front: false, size: false, halves: null, queue: [], total: 0, done: 0, busy: [], time: 0 };
    this.baseAccumState = { asks: 0, uploads: 0, dropped: 0, byWorker: 0, byInline: 0, gpuFrames: 0, why: {}, inlineMs: { n: 0, sum: 0, max: 0 }, workerMs: { n: 0, sum: 0, max: 0 } };
    this.frontWorker = true;
    this.frontTasks = [];
    this.frontStream = null;
    this.frontAnswers = new Map();
    this.frontShippers = [];
    this.frontShipGen = [];
    this.frontStarted = false;
    this.frontWarmed = "";
    this.frontMoved = true;
    this.frontGridLag = 0;
    this.frontJitterMode = 0;
    this.frontFactor = 0;
    this.frontTimeMode = 0;
    this.frontTimeOffset = 0;
    this.frontTimeHeld = null;
    this.frontJitters = new Map();
    this.frontGrid = { policy: new FrontVolumeJob.GridPolicy(), started: false, halves: null, version: 1, building: null, seen: { sigma: NaN, tail: NaN, scale: NaN, base: -1 } };
    this.frontAccumState = { asks: 0, early: 0, uploads: 0, dropped: 0, superseded: 0, byWorker: 0, byInline: 0, gpuSweeps: 0, blends: 0, skipped: 0, gridBakes: 0, gpuReads: 0, why: {}, inlineMs: { n: 0, sum: 0, max: 0 }, workerMs: { n: 0, sum: 0, max: 0 } };
    this.baseShade = { bakes: 0, strength: null };
    this.shadeSchedule = new BaseMistShade.Schedule();
    this.baseShadeDraws = [];
    this.baseShadeOn = true;
    this.baseShadeSeen = true;
    this.shadeReadTarget = null;
    this.shadeReadProgram = null;
    this.viewRayBuffer = new Float64Array(QualityFogShade.VIEW_RAYS * 3);
    this.atmosphereDebounce = new M.Debounce(ATMOSPHERE_DEBOUNCE_MS, () => this.requestAtmosphere());
    this.atmosphereBlock = this.block("Atmosphere", ATMOSPHERE_FLOATS);
    // (the picture's storage made once on its own unit: the builds only fill it)
    this.skyTexture = this.createTexture();
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.sky);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTexture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, M.Atmosphere.SKY_W, M.Atmosphere.PICTURE_H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // (the first build, at once and here: the defaults' tables are there from the first frame; the settings of the start follow through setLight, flushed by the first update)
    const g = M.SkyLight.gains({ brightness: this.skyMoonBrightness, airTone: this.airToneSetting, moonTone: this.moonTone });
    this.moonGain.set(g.moon);
    this.airTone.set(g.air);
    this.buildAtmosphere();
    this.colorMain = M.color(MAIN_DEFAULT);
    this.colorSecondary = M.color(SECONDARY_DEFAULT);
    this.balanceMain = 1;
    this.balanceSecond = 1;
    this.lightMain = new Float32Array(3);
    this.lightSecond = new Float32Array(3);
    this.rebalance();
    // (std140: the density's scale, the time, whether the volume is there, whether the strikes'
    // light is; the two colors; the volume's columns across and down, a column's width in
    // pixels, its margin; each slot's light over STRIKE_SCALE; the strikes' color; the Orb's
    // gain: 7 vec4, 28 floats)
    this.ubo = this.block("Fog", FogPlan.FOG_UBO_LENGTH);
    this.noise = null;
    this.passes = null;
    this.columns = [0, 0, 0];
    // the layers a bake draws at once
    this.layers = this.caps.drawBuffers;
    // each slot's light now (setStrikes); each slot's bakes' stage (0: none waiting; 1 and 2 the
    // halves of its shadows, 3 its light on the water, 4 and 5 the halves of its light in the fog:
    // one stage a frame, so no frame bakes a whole strike), whether its bakes are done (its light
    // shown: the water reads it too, src/index.ts), and when its light in the fog was last gathered
    this.levels = new Float32Array(SLOTS);
    this.boltColor = Float32Array.from(M.BOLT);
    this.stage = new Uint8Array(SLOTS);
    this.ready = new Uint8Array(SLOTS);
    this.gatheredAt = new Float64Array(SLOTS).fill(-Infinity);
    this.held = new Uint8Array(SLICES);
    this.heldAny = false;
    this.heldVersion = -1;
    this.heldNow = null;
    this.drop = new Uint8Array(SLICES);
    this.everyVersion = -1;
    this.everyAcross = -1;
    this.sweep = 0;
    this.planTask = null;
    this.leadDelay = 0;
    this.poseSource = null;
    this.viewLead = new FogPlan.ViewLead(0);
    this.leadFrame = null;
    this.answer = null;
    this.qualityView = null;
    this.qualityInputs = null;
    this.sentBounds = false;
    // the last refresh: its time, the view's version, where the next starts and the work owed
    // by the time passed (slices, draws); all of it next (stale)
    this.lastTime = 0;
    this.cameraVersion = -1;
    this.baseSeen = -1;
    this.builtFor = { yaw: 0, pitchShift: 0, eyeX: 0, eyeShift: 0 };
    this.builtLens = { x: 0, y: 0 };
    this.sliceNext = 0;
    this.sliceCredit = 0;
    this.shadePart = 0;
    this.shadeCredit = 0;
    this.shadePool = null;
    this.shadeSched = null;
    this.shadeCpu = false;
    this.shadeVersion = 0;
    this.shadeJob = new Int32Array(0);
    this.shadePending = new Int32Array(0);
    this.shadeBox = new Int32Array(0);
    this.shadeSlab = [];
    this.shadeSlabView = [];
    this.strikeSched = null;
    this.strikePoints = new Map();
    this.strikeSets = [];
    this.strikeUid = new Int32Array(SLOTS).fill(-1);
    this.strikeTry = new Uint8Array(SLOTS);
    this.strikeCpu = new Uint8Array(SLOTS);
    // the shadow grid's cells the view reads, per draw of layers: [first column, columns, rows, first row]
    this.boxes = [];
    this.stale = true;
    this.warmed = false;
    // (the tests: every shadow marched; what the last frame refreshed)
    this.marched = false;
    this.moonKernel = 0;
    this.refreshed = { shadeLayers: 0, volumeSlices: 0, volumeBuilt: 0, sliceFrom: 0, strikeSlots: 0 };
    if (this.caps.floats) {
      this.light = new Froxels(this, { direct: M.UNITS.fogDirect, mirror: M.UNITS.fogMirror, sum: M.UNITS.fogSum, sumMirror: M.UNITS.fogSumMirror }, 1, BaseMist.TOTAL_LAYERS - SLICES);
      this.strikeLight = new Froxels(this, { direct: M.UNITS.strikeDirect, mirror: M.UNITS.strikeMirror, sum: M.UNITS.strikeSum, sumMirror: M.UNITS.strikeSumMirror }, SLOTS);
      this.shade = this.own(Fog.texture3D(gl, gl.RG16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, SHADE_ACROSS, SHADE_UP, SHADE_DEEP * 2), (t: WebGLTexture) => gl.deleteTexture(t));
      this.strikeShade = this.own(Fog.texture3D(gl, gl.RGBA16F, 1, gl.LINEAR, gl.CLAMP_TO_EDGE, SHADE_ACROSS, SHADE_UP, SHADE_DEEP * SLOTS), (t: WebGLTexture) => gl.deleteTexture(t));
      // (the grids' framebuffers, made once: each with `layers` layers attached; the sky's, then
      // each slot's)
      this.shadeDraws = this.layerFramebuffers(this.shade, 0);
      this.baseShadeDraws = this.layerFramebuffers(this.shade, SHADE_DEEP);
      this.strikeDraws = [];
      for (let slot = 0; slot < SLOTS; slot++) {
        this.strikeDraws.push(this.layerFramebuffers(this.strikeShade, slot * SHADE_DEEP));
      }
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.shade);
      gl.bindTexture(gl.TEXTURE_3D, this.shade);
    }
    // the strikes' emitter (Lightning's emitterTexture, given by src/index.ts: setEmitter), and
    // what is told when a slot's shadows were baked (src/index.ts: the water bakes its light then, with
    // the emitter and these shadows still bound)
    this.emitter = null;
    this.onShaded = null;
  }

  // the strikes' emitter's texture (Lightning.emitterTexture)
  setEmitter(texture: WebGLTexture | null) {
    this.emitter = texture;
  }

  // the strikes' bakes' inputs bound: the emitter on M.UNITS.work, the strikes' shadow grid on
  // M.UNITS.bloomFrom (both units shared: bound before each bake that reads them; Bloom binds
  // its own input there before each of its passes)
  bindStrikeInputs() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_2D, this.emitter);
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_3D, this.strikeShade);
  }

  // framebuffers for SHADE_DEEP layers of a grid from `offset` on, `layers` a framebuffer
  layerFramebuffers(texture: WebGLTexture, offset: number) {
    const gl = this.gl;
    const outputs: GLenum[] = [];
    for (let i = 0; i < this.layers; i++) {
      outputs.push(gl.COLOR_ATTACHMENT0 + i);
    }
    const framebuffers: WebGLFramebuffer[] = [];
    for (let k = 0; k < SHADE_DEEP; k += this.layers) {
      const framebuffer = this.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let i = 0; i < this.layers; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, outputs[i], texture, 0, offset + k + i);
      }
      gl.drawBuffers(outputs);
      framebuffers.push(framebuffer);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return framebuffers;
  }

  static QUALITY_UNIT = "slices";

  // the frame's quality: the slices some column of the volume holds (level under the full one); the levels are for the camera
  // as it was when the job was made, and used only while it is the same version
  setQuality(q: EffectQuality) {
    super.setQuality(q);
    const levels = q.levels;
    let any = false;
    if (levels && levels.length === SLICES) {
      for (let k = 0; k < SLICES; k++) {
        const holds = levels[k] < QUALITY_LEVELS ? 1 : 0;
        this.held[k] = holds;
        any = any || holds === 1;
      }
    }
    this.heldAny = any;
    this.heldVersion = this.camera.dirty ? -1 : this.camera.version;
  }

  // what the job reads at the release frame besides the view (the pool's lead): the lens the volume is built for and its columns (the job reads those, not the camera's lens), and which strikes
  // shine (the slots whose level is above 0: a strike lights the volume's slices, so one starting or ending between the ask and the release is another job)
  qualityLeadKey(): number {
    const built = this.builtLens as { x: number; y: number } | undefined;
    const columns = this.columns as ArrayLike<number> | undefined;
    const keys = [built ? built.x : 0, built ? built.y : 0, columns ? columns[0]! : 0, columns ? columns[1]! : 0];
    const levels = this.levels as ArrayLike<number> | undefined;
    if (levels) {
      let mask = 0;
      for (let k = 0; k < levels.length; k++) {
        if (levels[k]! > 0) {
          mask |= 1 << k;
        }
      }
      keys.push(mask);
    }
    return QualityLead.fold(keys);
  }

  qualityKind(): string {
    return "fog";
  }

  // the slices' starts, once (the job reads them)
  qualityStatics(): QualityStatics | null {
    if (this.sentBounds) {
      return null;
    }
    this.sentBounds = true;
    return { bounds: QualityFog.bounds() };
  }

  // the view the slices are held for: the camera, the water, the volume's columns
  qualityParams(shared: QualityShared): QualityParams {
    let p = this.qualityView;
    // (the volume's columns are built along the rays of the lens it was built for, whatever the camera's lens is now: the job's levels read that lens; the other effects' jobs read the camera's)
    const inputs = this.qualityInputs = Object.assign(this.qualityInputs || ({} as QualityShared["inputs"]), shared.inputs);
    inputs.lensX = this.builtLens.x;
    inputs.lensY = this.builtLens.y;
    if (!p) {
      p = this.qualityView = { inputs, pitch: 0, margin: MARGIN, across: 0, down: 0 };
    }
    p.inputs = inputs;
    p.pitch = shared.tilt !== undefined ? shared.tilt : this.camera.tilt();
    p.across = this.columns[0];
    p.down = this.columns[1];
    return p as unknown as QualityParams;
  }

  // the job: the volume's slices (made only with a volume to hold: float pictures and the columns)
  qualityJobs(): QualityJob[] {
    return this.caps.floats && this.on && this.columns[0] > 0 && this.qualityIndex >= 0 ? [{ effect: this.qualityIndex, units: SLICES, minChunk: SLICES }] : [];
  }

  static properties() {
    return {
      p215_setting_DistanceFog: (fog: Fog, v: boolean) => {
        fog.on = !!v;
        fog.stale = true;
      },
      p218_setting_FogIntensity: (fog: Fog, v: number) => {
        // the single intensity reaches the layers halved (M.StaticMist.layerIntensity: v / 2), then i / 101 of the full density: Fog intensity 1 is already a faint cloud and mist, 100 is the layer intensity 50; a value of 0 or below (a test's) clamps to none
        fog.intensity = Math.max(0, StaticMist.layerIntensity(v) / 101);
        fog.stale = true;
      },
      p216_setting_FogColorMain: (fog: Fog, v: string) => {
        fog.colorMain = M.color(v);
        fog.rebalance();
        fog.stale = true;
      },
      p217_setting_FogColorSecondary: (fog: Fog, v: string) => {
        fog.colorSecondary = M.color(v);
        fog.rebalance();
        fog.stale = true;
      },
      p201_setting_SkyOrbBrightness: (fog: Fog, v: number) => {
        fog.skyMoonBrightness = v;
        fog.setLight();
      },
      p202_setting_AirTone: (fog: Fog, v: string) => {
        fog.airToneSetting = v;
        fog.setLight();
      },
      p203_setting_MoonTone: (fog: Fog, v: string) => {
        fog.moonTone = v;
        fog.setLight();
      },
    };
  }

  // the Orb's gain and the air's tone from their settings, at once (the uniform values are cheap), and the atmosphere's tables built with them after the settings stop moving: the
  // build waits ATMOSPHERE_DEBOUNCE_MS after the last change (the tables are asked of the atmosphere's task, or built here with no task) and the volume is gathered again when they
  // land (atmosphereOwed: they are owed until then; the first update, a reset and the tests' frames flush them: flushAtmosphere)
  setLight() {
    const g = M.SkyLight.gains({ brightness: this.skyMoonBrightness, airTone: this.airToneSetting, moonTone: this.moonTone });
    this.moonGain.set(g.moon);
    this.airTone.set(g.air);
    this.atmosphereOwed = true;
    this.atmosphereDebounce.touch();
  }

  // the seen sky's picture bound on its unit (M.UNITS.sky, shared with the pass inputs that bind before they read): the coordinator calls it before the water is drawn
  bindSky() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.sky);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTexture);
  }

  // the atmosphere's tables and the seen sky's picture for the Orb and the Air tone the fog holds now, built HERE (models/quality/atmosphere.ts: the same function the worker runs,
  // so the array is the worker's bit for bit) and uploaded: the constructor's first build, a flush (a clean start, the tests' frames, the first frame) and the fallback of a wait that
  // ends with no task. The time it took (build and upload) is `atmosphereMs` and one main-thread task of `atmosphereTasks`
  buildAtmosphere() {
    const start = performance.now();
    this.uploadAtmosphere(M.QualityAtmosphere.run(this.atmosphereInput()));
    this.atmosphereMs = performance.now() - start;
    this.logAtmosphereTask(this.atmosphereMs);
  }

  // the function's input for the gains the fog holds now
  atmosphereInput(): AtmosphereJob {
    return M.QualityAtmosphere.inputOf(this.moonGain, this.airTone);
  }

  // the sky ambient the shaders' atmosAmbient() returns: the atmosphere block's aInfo.xyz (the upper hemisphere's mean radiance), as uploaded
  ambient(): number[] {
    const d = this.atmosphereBlock.data;
    return [d[36]!, d[37]!, d[38]!];
  }

  // the array of M.QualityAtmosphere.run into the block (aSH, aInfo, aOrb: std140, uploaded) and the picture (RGBA16F from the floats); the volume is gathered again (it holds the
  // tables' ambient light); the tables are still owed while a change waits in the debounce or a request is in flight
  uploadAtmosphere(tables: Float32Array) {
    const block = this.atmosphereBlock;
    block.data.set(tables.subarray(0, M.QualityAtmosphere.BLOCK_FLOATS));
    block.upload();
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.sky);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, M.Atmosphere.SKY_W, M.Atmosphere.PICTURE_H, gl.RGBA, gl.FLOAT, tables.subarray(M.QualityAtmosphere.BLOCK_FLOATS));
    this.stale = true;
    this.atmosphereOwed = this.atmosphereDebounce.pending || this.atmosphereWanted !== 0;
  }

  // one main-thread task of the atmosphere (ms): the last ATMOSPHERE_TASKS_KEPT are kept
  logAtmosphereTask(ms: number) {
    this.atmosphereTasks.push(ms);
    if (this.atmosphereTasks.length > ATMOSPHERE_TASKS_KEPT) {
      this.atmosphereTasks.shift();
    }
  }

  // the debounce's end: the tables for the values now asked of the task (a worker answers at a later update), or built here when there is no task
  requestAtmosphere() {
    const task = this.atmosphereTask;
    this.atmosphereRequests++;
    if (!task) {
      this.buildAtmosphere();
      return;
    }
    const start = performance.now();
    this.atmosphereWanted = task.request(this.atmosphereInput());
    this.logAtmosphereTask(performance.now() - start);
    // (no worker alive: the task ran the function in the request and the answer is there)
    this.pollAtmosphere();
  }

  // the answer to the newest request applied (an older request's answer is dropped), a request lost with its worker asked again; every update, before anything reads the tables
  pollAtmosphere() {
    const task = this.atmosphereTask;
    if (!task) {
      return;
    }
    const answer = task.take();
    if (this.atmosphereWanted === 0) {
      return;
    }
    if (answer && answer.id === this.atmosphereWanted) {
      this.atmosphereWanted = 0;
      const start = performance.now();
      this.uploadAtmosphere(answer.output);
      this.logAtmosphereTask(performance.now() - start);
      return;
    }
    if (!task.pending().includes(this.atmosphereWanted)) {
      this.atmosphereRequests++;
      this.atmosphereWanted = task.request(this.atmosphereInput());
    }
  }

  // the tables owed built here at once for the values now: the wait cancelled and a request in flight forgotten (its answer is dropped)
  flushAtmosphere() {
    if (!this.atmosphereOwed) {
      return;
    }
    this.atmosphereDebounce.cancel();
    this.atmosphereWanted = 0;
    if (this.atmosphereTask) {
      this.atmosphereTask.take();
    }
    this.buildAtmosphere();
  }

  // the balance of the two colours' prominence from the current colours (models/mistalbedo.ts): the factors a and b on the CPU when a colour changes (no per-frame cost), and the scaled colours the block carries
  rebalance() {
    const { a, b } = MistAlbedo.balanceScales(this.colorMain, this.colorSecondary);
    this.balanceMain = a;
    this.balanceSecond = b;
    for (let c = 0; c < 3; c++) {
      this.lightMain[c] = this.colorMain[c]! * a;
      this.lightSecond[c] = this.colorSecondary[c]! * b;
    }
  }

  get tailShare(): number {
    return this.tailShareValue;
  }

  set tailShare(v: number) {
    if (v !== this.tailShareValue) this.stale = true;
    this.tailShareValue = v;
  }

  get tailScale(): number {
    return this.tailScaleValue;
  }

  set tailScale(v: number) {
    if (v !== this.tailScaleValue) this.stale = true;
    this.tailScaleValue = v;
  }

  get baseIntensity(): number | null {
    return this.baseIntensityValue;
  }

  set baseIntensity(v: number | null) {
    if (v !== this.baseIntensityValue) this.stale = true;
    this.baseIntensityValue = v;
  }

  get frontIntensity(): number | null {
    return this.frontIntensityValue;
  }

  set frontIntensity(v: number | null) {
    if (v !== this.frontIntensityValue) this.stale = true;
    this.frontIntensityValue = v;
  }

  // the layers' effective Fog intensities (1 to 100): the override's tenths, or the single Fog intensity (101 x the normalised one)
  baseIntensityNow() {
    const o = this.baseIntensityValue;
    return o === null || o === undefined ? 101 * this.intensity : FogPair.tenths(o);
  }

  frontIntensityNow() {
    const o = this.frontIntensityValue;
    return o === null || o === undefined ? 101 * this.intensity : FogPair.tenths(o);
  }

  // the tail's share and scale as the shaders, the plan and the CPU twins take them (clamped to 0..1 and 4..130 m; a missing or NaN option is the default)
  frontTail() {
    return StaticMist.clampTail(this.tailShare);
  }

  frontScale() {
    return StaticMist.clampScale(this.tailScale);
  }

  // whether the base layer's culling and flat slices apply
  baseLodActive() {
    return !!(this.lod && this.baseLodOn);
  }

  // the front's tail flat threshold per metre as the shaders take it: 0 (none) with the level of detail off
  frontFlatNow() {
    return this.lod ? Math.max(this.tailFlat, 0) : 0;
  }

  // the water's state: the base volume's reads and cull depend on whether the water is drawn, so a change owes an exact build
  setWaterDrawn(drawn: boolean) {
    if (drawn !== this.waterDrawn) {
      this.waterDrawn = drawn;
      if (this.baseMist) this.baseMist.rebuildExact();
    }
  }

  // the medium's density per metre at its densest (none without float pictures for its noise)
  sigma() {
    // (from the fields alone, no call of another method: the tests call this on stand-in objects; an override that is missing or null follows the single Fog intensity)
    const own = this.frontIntensityValue, i = own === null || own === undefined ? 101 * this.intensity : FogPair.tenths(own);
    return this.caps.floats && !(M.TEST && this.noClouds) ? FogPair.frontSigma(i) : 0;
  }

  // the equal split of today's extinction between the base mist and the front cloud at the Fog intensity (M.StaticMist.splitStrengths): the Fog intensity's factor is the layer intensity / 101
  split() {
    return StaticMist.splitStrengths(101 * this.intensity, BaseMist.SHARE);
  }

  // the base mist's extinction per metre at the water and at its densest (0 at Fog intensity 0, a test's, and without float pictures: no volume)
  baseStrength() {
    const own = this.baseIntensityValue, i = own === null || own === undefined ? 101 * this.intensity : FogPair.tenths(own);
    return this.caps.floats ? FogPair.baseStrength(i) : 0;
  }

  static programs(glsl: SharedGlsl, caps: Capabilities): ProgramSources {
    return {
      noiseSeed: [M.FULL_VERTEX, Fog.SEED_FRAGMENT],
      noiseBlur: [M.FULL_VERTEX, Fog.BLUR_FRAGMENT],
      noiseFinish: [M.FULL_VERTEX, Fog.FINISH_FRAGMENT],
      fogShade: [M.FULL_VERTEX, Fog.shadeFragment(caps.drawBuffers)],
      fogStrikeShade: [M.FULL_VERTEX, Fog.strikeShadeFragment(glsl, caps.drawBuffers)],
      fogVolume: [M.FULL_VERTEX, Fog.volumeFragment(M.TEST)],
      fogStrikes: [M.FULL_VERTEX, Fog.strikesFragment(glsl, M.TEST)],
      fogCopy: [M.FULL_VERTEX, Fog.COPY_FRAGMENT],
      fogStrikesCopy: [M.FULL_VERTEX, Fog.COPY_FRAGMENT],
      baseMistShade: [M.FULL_VERTEX, Fog.baseShadeFragment(caps.drawBuffers)],
      ...(M.TEST ? { fogShadeRead: [M.FULL_VERTEX, Fog.shadeReadFragment()] } : {}),
      ...fogAccumPrograms(),
      ...shadeAccumPrograms(caps.drawBuffers),
      ...baseMistPrograms(),
    };
  }

  // makes the noise (once a context)
  init(programs: Programs) {
    const gl = this.gl;
    const names = ["noiseSeed", "noiseBlur", "noiseFinish", "fogShade", "fogStrikeShade", "fogVolume", "fogStrikes", "fogCopy", "fogStrikesCopy"];
    const [seed, blur, finish, shade, strikeShade, volume, strikes, copy, strikesCopy] = this.ownPrograms(programs, names);
    const baseShade = this.ownPrograms(programs, ["baseMistShade"])[0]!;
    this.passes = { shade, strikeShade, volume, strikes, copy, strikesCopy, baseShade };
    baseShade.samplers({ uNoise: M.UNITS.noise });
    if (M.TEST) {
      this.shadeReadProgram = this.ownPrograms(programs, ["fogShadeRead"])[0]!;
      this.shadeReadProgram.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade });
    }
    this.accumulator = this.caps.floats ? new FogAccumulation(this, programs, SLICES) : null;
    this.shadeAccumulation = this.caps.floats ? new ShadeAccumulation(this, programs, this.layers) : null;
    this.shadeFresh = this.shadeAccumulation ? this.shadeAccumulation.freshTexture : null;
    this.baseMist = this.accumulator ? new BaseMistVolume(this, programs, this.accumulator.blend, this.accumulator.store) : null;
    this.baseFeed = this.baseMist ? new BaseMistFeed(this) : null;
    if (this.baseFeed) {
      this.baseFeed.setNoiseStretch(NOISE_STRETCH);
    }
    this.baseGrid.started = false;
    this.baseStream = this.baseMist ? new BaseMistLead.Stream<BaseMistInput, Uint16Array>((input) => M.BaseMistWorker.job(input), this.leadDelay) : null;
    this.baseReady.clear();
    shade.samplers({ uNoise: M.UNITS.noise });
    strikeShade.samplers({ uNoise: M.UNITS.noise, uEmitter: M.UNITS.work });
    volume.samplers({ uNoise: M.UNITS.noise, uShade: M.UNITS.shade, uSumDirect: M.UNITS.fogSum, uSumMirror: M.UNITS.fogSumMirror });
    strikes.samplers({
      uNoise: M.UNITS.noise,
      uStrikeShade: M.UNITS.bloomFrom,
      uEmitter: M.UNITS.work,
      uFogDirect: M.UNITS.fogDirect,
      uFogMirror: M.UNITS.fogMirror,
      uSumDirect: M.UNITS.strikeSum,
      uSumMirror: M.UNITS.strikeSumMirror,
    });
    copy.samplers({ uFrom: M.UNITS.fogDirect, uFromMirror: M.UNITS.fogMirror });
    strikesCopy.samplers({ uFrom: M.UNITS.strikeDirect, uFromMirror: M.UNITS.strikeMirror });
    this.noise = this.own(Fog.texture3D(gl, gl.R8, Math.log2(NOISE) + 1, gl.LINEAR_MIPMAP_LINEAR, gl.REPEAT, NOISE), (t: WebGLTexture) => gl.deleteTexture(t));
    if (this.caps.floats) {
      // (R32F: a half-float target is written rounded down through ANGLE, and the seven writes of the seed and the six blurs, stretched by 12, made the field 3.4 of 255 levels darker, its mean albedo weight 0.470 instead of 0.498)
      const work = [0, 1].map(() => Fog.texture3D(gl, gl.R32F, 1, gl.NEAREST, gl.REPEAT, NOISE));
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, NOISE, NOISE);
      gl.disable(gl.BLEND);
      const slices = (program: ShaderProgram, target: WebGLTexture | null, set: (u: Uniforms) => void) => {
        const u = program.use();
        for (let layer = 0; layer < NOISE; layer++) {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, 0, layer);
          gl.uniform1i(u.uLayer, layer);
          set(u);
          this.quad.drawFull();
          if (layer % 16 === 15) {
            this.guard.piece();
          }
        }
      };
      slices(seed, work[0], () => {});
      let from = 0;
      blur.samplers({ uFrom: M.UNITS.work });
      for (let pass = 0; pass < BLUR_PASSES; pass++) {
        gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
        gl.bindTexture(gl.TEXTURE_3D, work[from]);
        slices(blur, work[1 - from], (u: Uniforms) => gl.uniform1i(u.uAxis, pass % 3));
        from = 1 - from;
      }
      finish.samplers({ uFrom: M.UNITS.work });
      gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
      gl.bindTexture(gl.TEXTURE_3D, work[from]);
      slices(finish, this.noise, () => {});
      gl.bindTexture(gl.TEXTURE_3D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      work.forEach((t) => gl.deleteTexture(t));
    }
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.noise);
    gl.bindTexture(gl.TEXTURE_3D, this.noise);
    gl.generateMipmap(gl.TEXTURE_3D);
    this.stale = true;
    this.shadeStart();
  }

  // the quality pool, once it is there: the shade grid's baking in its workers can start (with the noise made)
  setShadePool(pool: QualityPool): void {
    this.shadePool = pool;
    this.shadeStart();
    this.strikeStart();
  }

  // the noise's levels `from`..`last` as bytes (x fastest, then y, then z): the CPU's own (M.NoiseField, the GPU generator's twin: level 0 the same bytes, the other levels within a byte of the GPU's mip chain), so that no level is
  // read back from the GPU; the pool's statics (the shade grid's, the strikes') are made from them
  noiseLevels(from: number, last: number): Uint8Array[] {
    const bytes = M.NoiseField.bytes(NOISE_STRETCH), levels: Uint8Array[] = [];
    let at = 0;
    for (let level = 0; level <= last; level++) {
      const n = Math.pow(NOISE >> level, 3);
      if (level >= from) {
        levels.push(bytes.subarray(at, at + n));
      }
      at += n;
    }
    return levels;
  }

  // the noise's levels 0..7 (the CPU's now, no read-back), sent to the workers as the strikes' static data, the staging sets and
  // the schedule made
  strikeStart(): void {
    const pool = this.shadePool;
    if (!pool || this.strikeSched || !this.passes || !this.noise || !this.caps.floats) {
      return;
    }
    const Q = QualityStrikeShade;
    if (Q.SPAN !== M.Camera.SPAN || Q.ACROSS !== SHADE_ACROSS || Q.UP !== SHADE_UP || Q.DEEP !== SHADE_DEEP || Q.TOP !== SHADE_TOP || Q.NEAR !== SHADE_NEAR || Q.FAR !== FOG_FAR || Q.GROUPS !== M.Flash.REGIONS || Q.POINTS !== M.Flash.SHADOW_POINTS) {
      return;
    }
    const levels = this.noiseLevels(Q.MIP_FROM, Q.MIP_LAST);
    pool.setStatic(STRIKE_EFFECT, { noise: Q.packMips(levels) as unknown as Float32Array }, "strikeshade");
    const draws = this.shadeDraws.length;
    this.strikeSets = [];
    for (let k = 0; k < Q.MOST_HELD; k++) {
      this.strikeSets.push({ uid: -1, slot: -1, slabs: Array.from({ length: draws }, () => new Uint16Array(this.layers * SHADE_UP * SHADE_ACROSS * 4)), box: new Int32Array(draws * 4), plan: [] });
    }
    this.strikeSched = new Q.Schedule(draws);
  }

  // a planned strike's flash is known (Lightning's onPlanned): its shadow points kept and its bake scheduled (Effect.lod on only)
  announceStrike(uid: number, start: number, flash: Float32Array): void {
    if (!this.lod || !this.strikeSched) {
      return;
    }
    if (this.strikePoints.size > 32) {
      this.strikePoints.forEach((v, key) => {
        if (this.strikeSched!.find(key) < 0) {
          this.strikePoints.delete(key);
        }
      });
    }
    this.strikePoints.set(uid, QualityStrikeShade.pointsOf(flash));
    this.strikeSched.announce(uid, start, this.camera.baseVersion);
  }

  // the jobs the strikes' schedule posted this frame: one message a draw, to the reserved bake worker as urgent (ahead of the sky shade's layers)
  postStrikes(): void {
    const sched = this.strikeSched!;
    const pool = this.shadePool!;
    const sigma = this.sigma();
    const version = this.camera.baseVersion;
    for (let i = 0; i < sched.postCount; i++) {
      const uid = sched.postId[i];
      const part = sched.postPart[i];
      const time = sched.postTime[i];
      let set = this.strikeSets.find((x) => x.uid === uid);
      if (!set) {
        set = this.strikeSets.find((x) => x.uid < 0);
        if (!set) {
          continue;
        }
        set.uid = uid;
        set.slot = -1;
      }
      const box = this.boxes[part];
      const points = this.strikePoints.get(uid);
      if (!box || !points) {
        continue;
      }
      set.box[part * 4] = box[0];
      set.box[part * 4 + 1] = box[1];
      set.box[part * 4 + 2] = box[2];
      set.box[part * 4 + 3] = box[3];
      const message = { params: { sigma, time, points, tail: this.frontTail(), tailScale: this.frontScale() }, layerFrom: part * this.layers, layerTo: (part + 1) * this.layers, x0: box[0], nx: box[1], rows: box[2], y0: box[3] };
      pool.bake(STRIKE_EFFECT, message, (reply) => this.strikeReply(uid, part, version, time, reply));
    }
  }

  // a draw's reply: into its slab, kept by the schedule when it is still the one wanted
  strikeReply(uid: number, part: number, version: number, time: number, reply: Record<string, unknown>): void {
    const data = reply.data as Uint16Array | undefined;
    const sched = this.strikeSched;
    const set = this.strikeSets.find((x) => x.uid === uid);
    if (!data || !sched || !set || version !== this.camera.baseVersion) {
      return;
    }
    if (sched.reply(uid, part, version, time)) {
      set.slabs[part].set(data);
    }
  }

  // the staging sets of strikes the schedule no longer holds (and no slot took) given back
  releaseStrikes(): void {
    const sched = this.strikeSched!;
    for (const set of this.strikeSets) {
      if (set.uid >= 0 && set.slot < 0 && !sched.has(set.uid)) {
        set.uid = -1;
      }
    }
  }

  // a slot's CPU grid given up (its stages bake on the GPU)
  strikeDrop(slot: number): void {
    this.strikeTry[slot] = 0;
    this.strikeCpu[slot] = 0;
    for (const set of this.strikeSets) {
      if (set.slot === slot) {
        set.slot = -1;
        set.uid = -1;
      }
    }
  }

  // the slot's strike asks for its CPU grid at its first stage: its upload plan made when the grid is whole and valid (else the stages bake on the GPU)
  strikeClaim(slot: number, time: number): void {
    this.strikeTry[slot] = 0;
    this.strikeCpu[slot] = 0;
    const uid = this.strikeUid[slot];
    const sched = this.strikeSched;
    if (!this.lod || !sched || uid < 0) {
      return;
    }
    const set = this.strikeSets.find((x) => x.uid === uid && x.slot < 0);
    if (sched.begin(uid, time, this.camera.baseVersion) && set) {
      set.slot = slot;
      set.plan = QualityStrikeShade.uploadPlan(Array.from({ length: this.boxes.length }, (v, k) => [set.box[k * 4], set.box[k * 4 + 1], set.box[k * 4 + 2]]), this.layers, QualityStrikeShade.UPLOAD_FRAMES);
      this.strikeCpu[slot] = 1;
    } else if (set) {
      set.uid = -1;
    }
  }

  // a stage of the CPU grid's upload: its draws' layers into the slot's layers of the strikes' grid, over the box they were baked for
  uploadStrike(slot: number, stage: number): void {
    const gl = this.gl;
    const set = this.strikeSets.find((x) => x.slot === slot)!;
    const range = set.plan[stage - 1];
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.bloomFrom);
    gl.bindTexture(gl.TEXTURE_3D, this.strikeShade);
    for (let k = range.from; k < range.to; k++) {
      const nx = set.box[k * 4 + 1];
      const rows = set.box[k * 4 + 2];
      gl.texSubImage3D(gl.TEXTURE_3D, 0, set.box[k * 4], set.box[k * 4 + 3], slot * SHADE_DEEP + k * this.layers, nx, rows, this.layers, gl.RGBA, gl.HALF_FLOAT, set.slabs[k].subarray(0, this.layers * rows * nx * 4));
    }
    if (stage === QualityStrikeShade.UPLOAD_FRAMES) {
      set.slot = -1;
      set.uid = -1;
      this.strikeCpu[slot] = 0;
    }
  }

  // the noise's levels 3..7 (the CPU's: noiseLevels, no read-back), sent to the workers as the shade's static data, and the schedule made
  shadeStart(): void {
    const pool = this.shadePool;
    if (!pool || this.shadeSched || !this.passes || !this.noise || !this.caps.floats) {
      return;
    }
    const Q = QualityFogShade;
    // (the model's constants are the shader's: another camera span or grid and the CPU's grid would differ)
    if (Q.SPAN !== M.Camera.SPAN || Q.ACROSS !== SHADE_ACROSS || Q.UP !== SHADE_UP || Q.DEEP !== SHADE_DEEP || Q.TOP !== SHADE_TOP || Q.NEAR !== SHADE_NEAR || Q.FAR !== FOG_FAR) {
      return;
    }
    const levels = this.noiseLevels(Q.MIP_FROM, Q.MIP_LAST);
    this.shadeNoisePacked = Q.packMips(levels);
    pool.setStatic(SHADE_EFFECT, { noise: this.shadeNoisePacked }, "fogshade");
    const draws = this.shadeDraws.length;
    this.shadeJob = new Int32Array(draws);
    this.shadePending = new Int32Array(draws);
    this.shadeBox = new Int32Array(draws * 4);
    this.shadeSlab = Array.from({ length: draws }, () => new Uint16Array(this.layers * SHADE_UP * SHADE_ACROSS * 2));
    this.shadeSlabView = new Array(draws).fill(null);
    this.shadePeriods = Array.from({ length: draws }, (_v, k) => ShadeLod.drawPeriod(k, this.layers, draws / SHADE_RATE));
    this.shadeSched = new Q.Schedule(draws, SHADE_RATE);
  }

  // the jobs the schedule posted this frame: for each draw, one message a layer to the workers (a layer is a few ms of a worker: no message holds one
  // for long), the slab filled as they come
  postShade(): void {
    // (the tests' kernel is not the workers': the GPU bakes every draw)
    if (this.moonKernel !== 0) {
      return;
    }
    const sched = this.shadeSched!;
    for (let i = 0; i < sched.postCount; i++) {
      this.postShadeDraw(sched.postDraw[i], sched.postTime[i], this.boxes[sched.postDraw[i]], true);
    }
  }

  // the job of draw k over `box` for the frame `time`, one message a layer (the sweep's: low priority; a view change's priority draws: urgent, posted at the ask)
  postShadeDraw(k: number, time: number, box: number[], low: boolean): void {
    const pool = this.shadePool!;
    const sigma = this.sigma();
    const version = this.shadeVersion;
    {
      const job = ++this.shadeJob[k];
      this.shadePending[k] = this.layers;
      this.shadeSlabView[k] = null;
      this.shadeBox[k * 4] = box[0];
      this.shadeBox[k * 4 + 1] = box[1];
      this.shadeBox[k * 4 + 2] = box[2];
      this.shadeBox[k * 4 + 3] = box[3];
      const first = k * this.layers;
      for (let l = 0; l < this.layers; l++) {
        const message = { params: { sigma, time, tail: this.frontTail(), tailScale: this.frontScale(), lod: this.shadeLod }, layerFrom: first + l, layerTo: first + l + 1, x0: box[0], nx: box[1], rows: box[2], y0: box[3] };
        const sent = pool.bake(SHADE_EFFECT, message, (reply) => this.shadeReply(k, job, version, time, reply), low);
        if (!sent) {
          // (no worker: the draw stays a job nobody answers, and the GPU bakes it at its turn)
          break;
        }
      }
    }
  }

  // a layer's reply: into the draw's slab; the draw's last one makes its reply whole, kept by the schedule when it is still the one wanted
  shadeReply(k: number, job: number, version: number, time: number, reply: Record<string, unknown>): void {
    const data = reply.data as Uint16Array | undefined;
    if (!data || job !== this.shadeJob[k] || version !== this.shadeVersion || !this.shadeSched) {
      return;
    }
    const nx = this.shadeBox[k * 4 + 1];
    const rows = this.shadeBox[k * 4 + 2];
    this.shadeSlab[k].set(data, ((reply.layerFrom as number) - k * this.layers) * rows * nx * 2);
    if (--this.shadePending[k] === 0) {
      this.shadeSlabView[k] = this.shadeSlab[k].subarray(0, this.layers * rows * nx * 2);
      this.shadeSched.reply(k, version, time);
    }
  }

  // the delta of a view change ordered for the pose `target` (called once a frame by leadDecision when a view change is asked, the pool path with the flag on): the boxes the pose will read (with the margin) against the boxes baked (or the
  // last ordered), the rectangles added per draw asked of the pool's reserved worker a lead ahead (a message a layer a rectangle, urgent: the low-priority queue drops the oldest); nothing for a move inside the margin, today's
  // whole-grid bake (fallback) for a delta over the workers' budget
  shadeViewAsk(target: ParallaxOffsets, time: number): void {
    const pool = this.shadePool, st = this.shadeViewState, vb = this.shadeViewBandsState;
    if (!(this.shadeViewWorker || this.shadeViewBands) || !pool || !this.shadeSched || !this.shadeCpu || !this.lod || this.moonKernel !== 0 || !(this.leadDelay > 0) || this.boxes.length === 0) {
      return;
    }
    st.changes++;
    vb.changes++;
    const lead = M.ParallaxLead.lead(this.leadDelay), boxes = this.viewBoxes(target);
    const queue = this.shadeViewQueue, base = queue.length > 0 ? queue[queue.length - 1]!.boxes : this.boxes;
    // (the tests' report: three draws' baked box and target box, and the margin)
    const mg = this.shadeMargin();
    st.last = { base: [0, 4, 8].map((i) => (base[i] ? base[i]!.slice() : [])), target: [0, 4, 8].map((i) => (boxes[i] ? boxes[i]!.slice() : [])), margin: [mg.columns, mg.rows] };
    const delta = ShadeDelta.deltaOf(base, boxes), cells = ShadeDelta.cellsIn(delta, this.layers), workers = pool.alive >= 2 ? 1 : pool.alive;
    const job: ShadeViewJob = { releaseMs: (time + lead) * 1000, servedAt: -1, boxes, fallback: false, draws: new Map(), kind: "delta", delta, set: null };
    st.deltaCells += cells;
    if (cells === 0) {
      st.contained++;
      queue.push(job);
      return;
    }
    // (the order of handlers: the bands over the tasks, the pool's delta worker, today's whole-grid GPU bake)
    const tasks = this.shadeTasks.length, core = this.shadeCore(4), leadMs = lead * 1000;
    const fitsDelta = ShadeDelta.fits(cells, leadMs, workers), fitsBands = tasks > 0 && ShadeViewBands.fits(leadMs, tasks, M.ShadeAccumWorker.LAYERS, core, this.shadeLod);
    const choice = ShadeViewBands.choose({ bands: this.shadeViewBands, warmed: this.shadeWarmed(), fitsBands, delta: this.shadeViewWorker, fitsDelta, delay: this.leadDelay, moved: true, settings: false, jump: false, switched: false, size: false });
    st.fits = choice !== "gpu";
    if (choice === "bands") {
      job.kind = "bands";
      job.set = this.shadeVbAsk(target, time, core);
      queue.push(job);
      return;
    }
    if (choice === "gpu") {
      st.fallbacks++;
      job.fallback = true;
      queue.push(job);
      return;
    }
    const sigma = this.sigma(), when = time + lead, tail = this.frontTail(), scale = this.frontScale(), layers = this.layers, lod = this.shadeLod;
    delta.forEach((rects, k) => {
      if (rects.length === 0) {
        return;
      }
      const entry = { rects, slabs: rects.map((r) => new Uint16Array(layers * r[2]! * r[1]! * 2)), pending: rects.map(() => layers) };
      job.draws.set(k, entry);
      st.asks++;
      rects.forEach((r, ri) => {
        for (let l = 0; l < layers; l++) {
          const message = { params: { sigma, time: when, tail, tailScale: scale, lod }, layerFrom: k * layers + l, layerTo: k * layers + l + 1, x0: r[0], nx: r[1], rows: r[2], y0: r[3] };
          pool.bake(SHADE_EFFECT, message, (reply) => this.shadeViewReply(entry, k, ri, reply), false);
        }
      });
    });
    queue.push(job);
  }

  // the set of bands a bands job waits for: the in-flight set when the view change coalesces with it (the same pose: reuse; another: it waits, and a set for the newest pose starts when the set in flight is whole), else a new set; one set in flight at a time
  shadeVbAsk(target: ParallaxOffsets, time: number, core: number): ShadeVbSet | null {
    const vb = this.shadeViewBandsState;
    if (this.shadeVbCoalescer.ask(target) === "start") {
      this.shadeVbStart(time, core);
    } else {
      vb.coalesced++;
    }
    vb.maxSetsInFlight = Math.max(vb.maxSetsInFlight, this.shadeVbCoalescer.maxInFlight);
    return this.shadeVbSet;
  }

  // a set of bands asked: the whole reduced grid (the 48 layers) as the bands of M.ShadeViewBands.assign over the tasks (band i on task i mod tasks), each band baked at the jitter 0 for the time of the release; a task with no warmed worker is not
  // asked: its bands run inline when the release comes (one a frame)
  shadeVbStart(time: number, core: number): void {
    const vb = this.shadeViewBandsState, tasks = this.shadeTasks, lead = M.ParallaxLead.lead(this.leadDelay), at = time + lead;
    const plans: ShadeBand[] = [], inputs: ShadeFreshJob[] = [], owners: number[] = [];
    ShadeViewBands.assign(M.ShadeAccumWorker.LAYERS, core, tasks.length).forEach((list, ti) => {
      for (const plan of list) {
        plans.push(plan);
        inputs.push(this.shadeFreshInput(at, 0, [plan.from, plan.to], this.shadeLod));
        owners.push(ti);
      }
    });
    const set: ShadeVbSet = { plans, inputs, outputs: new Array(plans.length).fill(undefined), releaseMs: at * 1000, done: false, failed: false, grid: null };
    this.shadeVbSet = set;
    vb.sets++;
    inputs.forEach((input, i) => {
      const task = tasks[owners[i]!]!;
      if (task.inline || !task.warmed) {
        return;
      }
      vb.asks++;
      task.ask(input, lead * 1000).then((output) => {
        if (!set.done && !set.failed) {
          set.outputs[i] = output;
        }
      }, () => undefined);
    });
  }

  // every frame: the set in flight whole when its release has come (the bands the workers did not answer run inline, ONE a frame; past the deadline the set has failed and the jobs waiting for it go to the GPU bake), the whole grid joined and kept, the next
  // pending set started; and the jobs waiting for their set filled when it is whole
  shadeVbServe(time: number, program: ShaderProgram): void {
    const vb = this.shadeViewBandsState, ms = time * 1000, deadline = Math.max(100, 2 * M.ParallaxLead.lead(this.leadDelay) * 1000);
    const set = this.shadeVbSet;
    if (set && !set.done && !set.failed && ms >= set.releaseMs - 1e-3) {
      const missing: number[] = [];
      set.outputs.forEach((o, i) => {
        if (o === undefined) {
          missing.push(i);
        }
      });
      if (missing.length > 0) {
        const step = ShadeDelta.inlineStep(missing, ms, set.releaseMs, deadline);
        if (step.inline !== null) {
          set.outputs[step.inline] = M.ShadeAccumWorker.job(set.inputs[step.inline]!);
          vb.inlineBands++;
        } else if (step.gpu.length > 0) {
          set.failed = true;
        }
      }
      if (!set.failed && set.outputs.every((o) => o !== undefined)) {
        const whole = new Uint16Array(M.ShadeAccumWorker.LENGTH);
        ShadeViewBands.joinBands(set.outputs as Uint16Array[], set.plans, M.ShadeAccumWorker.LAYER, whole);
        set.grid = whole;
        set.done = true;
      }
      if (set.done || set.failed) {
        this.shadeVbSet = null;
        if (this.shadeVbCoalescer.released() !== null) {
          this.shadeVbStart(time, this.shadeCore(4));
        }
      }
    }
    for (const job of this.shadeVbWaiting.slice()) {
      if (job.set && job.set.done) {
        this.shadeVbFill(job);
        this.shadeVbWaiting.splice(this.shadeVbWaiting.indexOf(job), 1);
      } else if (!job.set || job.set.failed || ms > job.servedAt + deadline) {
        this.shadeVbGpu(job, program);
        this.shadeVbWaiting.splice(this.shadeVbWaiting.indexOf(job), 1);
      }
    }
  }

  // a bands job released with this frame's view change: its delta cells filled from its set's grid when whole, else it waits for it
  shadeVbRelease(job: ShadeViewJob, time: number): void {
    if (job.set && job.set.done) {
      this.shadeVbFill(job);
    } else {
      job.servedAt = time * 1000;
      this.shadeVbWaiting.push(job);
    }
  }

  // the delta cells written from the set's whole reduced grid (the blend at weight 1 and the store under a scissor of each rectangle); the sweep then refreshes them in its own turns (within one sweep, about half a second; with the periods on the draws that hold them are
  // forced due: Schedule.force posts their jobs two at a time, low priority like the sweep's own)
  shadeVbFill(job: ShadeViewJob): void {
    const vb = this.shadeViewBandsState;
    const plan = ShadeViewBands.fillPlan(job.delta);
    if (plan.length === 0 || !job.set || !job.set.grid) {
      return;
    }
    this.shadeAccumulation!.fillDelta(M.FogAccum.jitter(0), job.set.grid, plan);
    vb.fills++;
    vb.lastRects = job.delta.map((r) => r.map((x) => x.slice()));
    // (the cells are the reduced grid's look: the draws that hold them are due in the sweep at once, whatever their period)
    if (this.shadeSched && this.shadeSched.scaled) {
      this.shadeSched.force(plan.map((e) => e.draw));
    }
  }

  // the deadline passed with no grid: the draws holding delta cells baked by the GPU over their boxes, as today's bake does
  shadeVbGpu(job: ShadeViewJob, program: ShaderProgram): void {
    job.delta.forEach((rects, k) => {
      if (rects.length > 0) {
        this.bake("fog shade", program, this.shadeDraws, k, k + 1, -1);
        this.shadeViewState.gpuDraws++;
      }
    });
  }

  // the bands' state dropped (a whole new bake owed): no set in flight, no job waiting
  shadeVbReset(): void {
    this.shadeVbSet = null;
    this.shadeVbWaiting.length = 0;
    this.shadeVbCoalescer = new ShadeViewBands.Coalescer<ParallaxOffsets>((a, b) => !M.MouseParallax.farFrom(a, b));
  }

  // a layer's reply of a delta's rectangle: into the rectangle's slab
  shadeViewReply(entry: { rects: number[][]; slabs: Uint16Array[]; pending: number[] }, k: number, ri: number, reply: Record<string, unknown>): void {
    const data = reply.data as Uint16Array | undefined;
    if (!data) {
      return;
    }
    const r = entry.rects[ri]!;
    entry.slabs[ri]!.set(data, ((reply.layerFrom as number) - k * this.layers) * r[2]! * r[1]! * 2);
    entry.pending[ri]!--;
  }

  // the jobs of the delta released by this frame's view change (every ask whose release time has come, in order), or null when the frame is not a delta's: not a view change alone, a fallback among them, or none asked (today's path)
  shadeViewDue(time: number, other: boolean): ShadeViewJob[] | null {
    if (!(this.shadeViewWorker || this.shadeViewBands) || other || this.shadeViewQueue.length === 0) {
      if (this.shadeViewQueue.length > 0 && other) {
        this.shadeViewQueue.length = 0;
      }
      return null;
    }
    // (the jobs whose release time has come, within a thousandth of a millisecond; a move the view lead released with none due (its own clock and ours differ by a rounding) takes the first asked job: the asks and the releases are in the same order)
    const due: ShadeViewJob[] = [], ms = time * 1000;
    while (this.shadeViewQueue.length > 0 && this.shadeViewQueue[0]!.releaseMs <= ms + 1e-3) {
      due.push(this.shadeViewQueue.shift()!);
    }
    if (due.length === 0) {
      due.push(this.shadeViewQueue.shift()!);
    }
    if (due.some((j) => j.fallback)) {
      return null;
    }
    return due;
  }

  // the deltas released and not yet whole in the grid, each frame: the draws the workers answered uploaded per rectangle, then at most ONE draw run inline (the same pure job as the worker's, QualityFogShade.bake over the rectangles), and from the
  // deadline on the draws still waiting baked by the GPU (over the draw's whole box) as today
  shadeViewServe(time: number, program: ShaderProgram): void {
    if (this.shadeViewActive.length === 0) {
      return;
    }
    const st = this.shadeViewState, ms = time * 1000, deadline = Math.max(100, 2 * M.ParallaxLead.lead(this.leadDelay) * 1000), layers = this.layers;
    let inline = 0;
    for (const job of this.shadeViewActive) {
      for (const [k, d] of Array.from(job.draws.entries())) {
        if (d.pending.every((n) => n <= 0)) {
          this.uploadShadeRects(k, d.rects, d.slabs);
          st.byWorker++;
          job.draws.delete(k);
        }
      }
      const todo = Array.from(job.draws.keys()).sort((a, b) => a - b);
      if (todo.length === 0) {
        continue;
      }
      const step = ShadeDelta.inlineStep(todo, ms, job.servedAt, deadline);
      if (step.inline !== null && inline === 0) {
        const k = step.inline, d = job.draws.get(k)!;
        if (this.shadeNoisePacked) {
          const sigma = this.sigma(), front = { tail: this.frontTail(), scale: this.frontScale() };
          const slabs = d.rects.map((r) => {
            const out = new Uint16Array(layers * r[2]! * r[1]! * 2);
            this.bakeRect(out, k, r, sigma, time, front);
            return out;
          });
          this.uploadShadeRects(k, d.rects, slabs);
          st.inlineDraws++;
        } else {
          this.bake("fog shade", program, this.shadeDraws, k, k + 1, -1);
          st.gpuDraws++;
        }
        job.draws.delete(k);
        inline++;
      }
      for (const k of step.gpu) {
        this.bake("fog shade", program, this.shadeDraws, k, k + 1, -1);
        st.gpuDraws++;
        job.draws.delete(k);
      }
    }
    st.maxInlinePerFrame = Math.max(st.maxInlinePerFrame, inline);
    this.shadeViewActive = this.shadeViewActive.filter((job) => job.draws.size > 0);
  }

  // the cells of draw k's layers over the rectangle r = [first column, columns, rows, first row] into out (the worker's job, run here): QualityFogShade.bake, or with shadeLod the lattice of each layer's stride (bakeLod)
  bakeRect(out: Uint16Array, k: number, r: number[], sigma: number, time: number, front: { tail: number; scale: number }): void {
    const layers = this.layers;
    if (!this.shadeLod) {
      QualityFogShade.bake(this.shadeNoisePacked!, sigma, time, out, k * layers, (k + 1) * layers, r[0]!, r[1]!, r[2]!, undefined, r[3]!, front);
      return;
    }
    const per = r[2]! * r[1]! * 2;
    for (let l = 0; l < layers; l++) {
      QualityFogShade.bakeLod(this.shadeNoisePacked!, sigma, time, out.subarray(l * per, (l + 1) * per), k * layers + l, r[0]!, r[1]!, r[2]!, r[3]!, 0, 0, front);
    }
  }

  // whether the pool's workers and the shade schedule are there: the delta can be asked
  shadeViewReady(): boolean {
    return this.shadePool !== null && this.shadeSched !== null;
  }

  // a draw's delta rectangles from their slabs into the grid: one texSubImage3D a rectangle, at its column, its row and the draw's first layer
  uploadShadeRects(k: number, rects: number[][], slabs: Uint16Array[]): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_3D, this.shade);
    rects.forEach((r, i) => {
      gl.texSubImage3D(gl.TEXTURE_3D, 0, r[0]!, r[3]!, k * this.layers, r[1]!, r[2]!, this.layers, gl.RG, gl.HALF_FLOAT, slabs[i]!);
    });
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  // draw k's layers from its worker's reply into the grid, over the box the reply was baked for
  uploadShade(k: number): void {
    const gl = this.gl;
    const data = this.shadeSlabView[k]!;
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    gl.bindTexture(gl.TEXTURE_3D, this.shade);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, this.shadeBox[k * 4], this.shadeBox[k * 4 + 3], k * this.layers, this.shadeBox[k * 4 + 1], this.shadeBox[k * 4 + 2], this.layers, gl.RG, gl.HALF_FLOAT, data);
    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  // a 3D texture (wrap: how it is read past its sides)
  static texture3D(gl: WebGL2RenderingContext, format: GLenum, levels: number, filter: GLenum, wrap: GLenum, width: number, height = width, depth = width): WebGLTexture {
    gl.activeTexture(gl.TEXTURE0 + M.UNITS.work);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texStorage3D(gl.TEXTURE_3D, levels, format, width, height, depth);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, filter === gl.NEAREST ? gl.NEAREST : gl.LINEAR);
    for (const axis of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, axis, wrap);
    }
    gl.bindTexture(gl.TEXTURE_3D, null);
    return texture;
  }

  // the volumes' columns for the screen's size and its margins: made again only when their
  // number changes
  resize(width: number, height: number) {
    if (width !== this.shadeSeenSize[0] || height !== this.shadeSeenSize[1]) {
      this.shadeSeenSize = [width, height];
      this.shadeAccumResize = true;
    }
    if (!this.caps.floats) {
      return;
    }
    const wide = width * (1 + 2 * MARGIN);
    const high = height * (1 + 2 * MARGIN);
    const tile = Math.max(TILE_LEAST, Math.ceil(Math.sqrt((wide * high) / COLUMNS_MOST)));
    const across = Math.ceil(wide / tile);
    const down = Math.ceil(high / tile);
    if (across !== this.columns[0] || down !== this.columns[1]) {
      this.light.resize(across, down);
      if (this.baseMist) {
        this.baseMist.release();
        this.baseMist.schedule.event("size");
      }
      this.shadeSchedule.event("size");
      this.baseGrid.size = true;
      this.strikeLight.resize(across, down);
      this.stale = true;
    }
    this.columns = [across, down, wide / across];
  }

  destroy() {
    this.atmosphereDebounce.cancel();
    this.atmosphereWanted = 0;
    if (this.accumulator) {
      this.accumulator.releaseFresh();
    }
    if (this.frontStarted) {
      for (const task of this.frontTasks) {
        task.stop();
      }
      this.frontStarted = false;
    }
    if (this.baseMist) {
      this.baseMist.release();
    }
    if (this.baseFeed) {
      this.baseFeed.release();
      this.baseFeed = null;
    }
    if (this.light) {
      this.light.drop();
      this.strikeLight.drop();
    }
    super.destroy();
  }

  // a strike started in a slot: its bakes from the next update, one stage a frame (STAGES), its
  // light shown once they are done
  strikeAt(slot: number, uid = -1) {
    this.strikeDrop(slot);
    this.strikeUid[slot] = uid;
    this.strikeTry[slot] = uid >= 0 ? 1 : 0;
    this.stage[slot] = 1;
    this.ready[slot] = 0;
  }

  // whether a slot's light shows in this frame: its bakes done, or done in this frame (its last
  // stage, the frame's active slot)
  shows(slot: number) {
    return this.ready[slot] === 1 || (this.stage[slot] === STAGES && this.activeSlot() === slot);
  }

  // the slot whose bakes go on this frame: the first waiting (-1: none)
  activeSlot() {
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.stage[slot] > 0) {
        return slot;
      }
    }
    return -1;
  }

  // a clean start: no strike's bakes waiting, none shown
  reset() {
    // (the tables owed built now: a clean start has the tables of its settings)
    this.atmosphereDebounce.cancel();
    this.flushAtmosphere();
    for (let slot = 0; slot < SLOTS; slot++) {
      this.strikeDrop(slot);
    }
    this.strikeSets.forEach((set) => (set.uid = set.slot = -1));
    this.stage.fill(0);
    this.ready.fill(0);
    this.gatheredAt.fill(-Infinity);
    // (a clean start has the base mist built exactly)
    if (this.baseMist) {
      this.baseMist.rebuildExact();
    }
  }

  // each slot's light now (0: none), and the strikes' color (applied when the fog is read: the
  // strikes' light gathered has none)
  setStrikes(levels: ArrayLike<number>, color: ArrayLike<number>) {
    this.levels.set(levels);
    this.boltColor.set(color);
  }

  // all of it refreshed in the next update
  refreshAll() {
    this.stale = true;
  }

  // (the tests: the kernel of the moon's penumbra the shade bake takes, 1 to MoonDisc.KERNEL_MAX, 0 for the shipped one; the whole grid baked again on the GPU)
  setMoonKernel(n: number) {
    this.moonKernel = M.TEST ? Math.min(Math.max(Math.floor(n), 0), MoonDisc.KERNEL_MAX) : 0;
    this.refreshAll();
  }

  // the volume's margin (the uniform block's fVolume.w) for the pixels of the mirrored picture, which is larger than the view (models/reflectionframe.ts fogMargin), or the view's own
  // with null; the block's other values are the frame's
  readMargin(frame: ReflectionFrameOf | null) {
    this.ubo.data[15] = frame ? ReflectionFrame.fogMargin(MARGIN, frame) : MARGIN;
    this.ubo.upload();
  }

  // its values for this frame, and its pictures refreshed (after the camera's values)
  update(time: number) {
    const gl = this.gl;
    // (the atmosphere's tables: an answer landed, or owed tables built here at once at the first update and in the tests' build; before anything reads them)
    this.pollAtmosphere();
    if (this.atmosphereOwed && (this.settleAtmosphere || !this.atmosphereUpdated)) {
      this.flushAtmosphere();
    }
    this.atmosphereUpdated = true;
    // (the tests' switch of the base mist's shade: a change of it is a setting's, every volume reads the shade)
    if (this.baseShadeOn !== this.baseShadeSeen) {
      this.baseShadeSeen = this.baseShadeOn;
      this.stale = true;
    }
    // (the margin baked around the boxes: when it changes (the pool ready, the Parallax delay set) the boxes are made again with it and the whole grid is baked once, so that the margin's cells are baked too)
    const margin = this.shadeMargin(), marginKey = margin.columns + "," + margin.rows;
    if (marginKey !== this.shadeMarginKey) {
      this.shadeMarginKey = marginKey;
      this.shadeMarginDirty = true;
      if (this.boxes.length > 0) {
        this.stale = true;
      }
    }
    // the frame's plan (models/fogplan.ts): the answer its fork asked of the worker when it is for exactly these values, else the function run here
    const input = this.planInput(time, false);
    const leadNow = this.leadFrame;
    this.leadFrame = null;
    const answered = this.answer;
    this.answer = null;
    const plan = answered && FogPlan.same(answered.input, input) ? answered.output : FogPlan.plan(input);
    const built = input.built;
    this.ubo.data.set(plan.ubo);
    // (the base mist's volume is read where there is one: its strength over 0 and Distance fog on: fSecond.w, the second colour's fourth float)
    const baseOn = this.baseMist !== null && this.on && this.baseStrength() > 0;
    // (the base shade's bake owed this frame is decided here, so that the flag the volumes read is the frame's, its draw coming before every volume's: the flag is 0 without the base volume, 1 with it and no shade (not baked yet, or the tests' switch off), 2 with its shade)
    const shadeOwed = built && this.baseMist !== null && this.shadeSchedule.frame(this.baseStrength(), this.on);
    this.ubo.data[11] = !baseOn ? 0 : this.shadeSchedule.bakes >= 1 && (!M.TEST || this.baseShadeOn) ? 2 : 1;
    this.ubo.upload();
    if (!built) {
      return;
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    if (!this.warmed) {
      this.warm();
    }
    // (the plan's decisions: a setting's change, a gap in time, the view moved (its base changed, or the mouse parallax's offsets drifted past the tolerance of the view the volume
    // and the shade were built for; a smaller drift only goes on with the slices' own refresh, which reads the view as it is then), the shade grid baked by the workers or by the
    // GPU alone (a change of that path is a whole new bake, as a setting's change is))
    const settings = plan.settings;
    const jump = plan.jump;
    const camera = this.camera;
    const moved = plan.moved;
    const cpu = plan.cpu;
    this.shadeCpu = cpu;
    const view = plan.view;
    this.stale = false;
    this.lastTime = time;
    this.cameraVersion = this.camera.version;
    if (moved) {
      this.baseSeen = camera.baseVersion;
      // (the pose the build was ordered for: the camera's own offsets without a lead, the target pose the lead ordered it for with one)
      this.builtFor.yaw = plan.builtFor.yaw;
      this.builtFor.pitchShift = plan.builtFor.pitchShift;
      this.builtFor.eyeX = plan.builtFor.eyeX;
      this.builtFor.eyeShift = plan.builtFor.eyeShift;
    }
    // (any rebuild, whatever its cause (a setting, a gap, a move, the shade's path), is built for the camera's lens now: the plan's block carries no delta in it)
    if (view) {
      this.builtLens.x = camera.lens ? camera.lens.x : 0;
      this.builtLens.y = camera.lens ? camera.lens.y : 0;
    }
    this.shadeViewJob = null;
    if (moved || this.shadeMarginDirty || this.boxes.length === 0) {
      this.shadeMarginDirty = false;
      const jobs = moved ? this.shadeViewDue(time, settings || jump || plan.switched || !cpu) : null;
      if (jobs) {
        this.shadeViewJob = jobs;
        this.boxes = jobs[jobs.length - 1]!.boxes;
      } else {
        this.boxes = this.viewBoxes();
      }
    }
    // (built: the passes are made)
    const passes = this.passes!;
    // (the slices the job's levels say some column holds: only for the view they were made for)
    this.heldNow = this.heldAny && this.heldVersion === this.camera.version && !this.camera.dirty ? this.held : null;
    // the clouds' shadow of the sky and the moon (fixed in the world, baked over the view): the
    // draws of its layers the time passed owes, all of them after a gap, a setting's change or a
    // change of the view
    let owed: number;
    if (cpu) {
      // Effect.lod on with the workers: the draws the schedule owes, uploaded from their worker's reply when it is whole and current, baked by the GPU
      // (runs of draws in one bake) when it is not; all of them on the GPU after a change of the view, a setting or a gap; the jobs for their next turn posted
      const sched = this.shadeSched!;
      // (the band tasks generate their noise once the lead is on)
      if (this.shadeViewBands && this.leadDelay > 0 && this.shadeTasks.length > 0) {
        this.shadeWarm();
      }
      // (a view change served by the delta owes the schedule nothing: the sweep goes on, its version kept; any other change is a whole new bake, and drops the deltas)
      const viewOnly = this.shadeViewJob !== null;
      if (view && !viewOnly) {
        this.shadeViewState.whole++;
        this.shadeVersion++;
        this.shadeViewQueue.length = 0;
        this.shadeViewActive.length = 0;
        this.shadeVbReset();
      }
      sched.rate = SHADE_RATE * (M.TEST ? this.rateScale : 1);
      if (this.shadeLodRefresh !== this.shadePeriodsOn) {
        this.shadePeriodsOn = this.shadeLodRefresh;
        sched.usePeriods(this.shadePeriodsOn ? this.shadePeriods : null);
      }
      sched.frame(time, view && !viewOnly, this.shadeVersion);
      owed = sched.owedCount;
      for (let i = 0; i < owed; ) {
        const k = sched.drawOf[i];
        if (sched.uploaded[i]) {
          this.uploadShade(k);
          i++;
          continue;
        }
        let j = i + 1;
        while (j < owed && !sched.uploaded[j] && sched.drawOf[j] === sched.drawOf[j - 1] + 1) {
          j++;
        }
        this.bake("fog shade", passes.shade, this.shadeDraws, k, sched.drawOf[j - 1] + 1, -1);
        i = j;
      }
      this.postShade();
      // (the sets of bands completed, the view changes they serve filled; the delta worker's jobs served as before)
      this.shadeVbServe(time, passes.shade);
      if (this.shadeViewJob) {
        for (const job of this.shadeViewJob) {
          if (job.kind === "bands") {
            this.shadeVbRelease(job, time);
          } else {
            job.servedAt = time * 1000;
            this.shadeViewActive.push(job);
          }
        }
      }
      this.shadeViewServe(time, passes.shade);
      // (the earlier path's state, when it takes over again: from draw 0 with no credit)
      this.shadeCredit = plan.shadeCredit;
      this.shadePart = plan.shadePart;
    } else {
      // (the runs of draws the plan owes)
      owed = plan.owed;
      // (Fog.shadeAccum: the front grid by an exact bake or an accumulating frame instead of the runs of draws)
      if (!this.shadeAccumFrame(plan, passes.shade)) {
        for (let i = 0; i < plan.shadeBakes.length; i += 2) {
          this.bake("fog shade", passes.shade, this.shadeDraws, plan.shadeBakes[i], plan.shadeBakes[i + 1], -1);
        }
      }
      this.shadeCredit = plan.shadeCredit;
      this.shadePart = plan.shadePart;
    }
    // the base mist's shade, baked once (on the start, a base strength change, a size change: shadeSchedule) before any volume reads it
    if (shadeOwed) {
      this.bakeBaseShade();
    }
    // the strikes' grids baked ahead: the schedule's view of the frame (a setting's change drops them all), its jobs posted
    if (this.strikeSched && this.lod) {
      if (settings) {
        this.strikeSched.settingsChanged();
      }
      this.strikeSched.frame(time, this.camera.baseVersion);
      this.postStrikes();
      this.releaseStrikes();
    }
    // after a setting's or the view's change, the strikes playing or gathered lately (their light
    // kept shown meanwhile): their bakes from the first stage again; after a gap in time only
    // those not baking already (the grids are fixed in the world)
    for (let slot = 0; slot < SLOTS; slot++) {
      const recent = time - this.gatheredAt[slot] < STRIKE_LONGEST && time >= this.gatheredAt[slot];
      const again = settings || moved ? this.levels[slot] > 0 || recent || this.stage[slot] > 0 : jump && this.stage[slot] === 0 && (this.levels[slot] > 0 || recent);
      if (again) {
        this.strikeDrop(slot);
        this.stage[slot] = 1;
      }
    }
    // (one slot's stage a frame, the first waiting: no frame bakes two strikes' stages)
    const active = this.activeSlot();
    // (stages 1 and 2: the halves of its shadows' draws; stage 3: its light on the water, from
    // them: src/index.ts)
    if (active >= 0) {
      const draws = this.strikeDraws[active].length;
      const half = Math.ceil(draws / 2);
      const stage = this.stage[active];
      if (stage === 1 && this.strikeTry[active]) {
        this.strikeClaim(active, time);
      }
      if ((stage === 1 || stage === 2) && this.strikeCpu[active]) {
        this.uploadStrike(active, stage);
      } else if (stage === 1 || stage === 2) {
        this.bindStrikeInputs();
        this.bake("strike shade", passes.strikeShade, this.strikeDraws[active], stage === 1 ? 0 : half, stage === 1 ? half : draws, active);
      } else if (stage === 3 && this.onShaded) {
        this.bindStrikeInputs();
        this.onShaded(active);
      }
    }
    // the fog's volume: the slices the time passed owes (from where the last frame stopped), all
    // of them when the view changed
    // (the plan's slices: the periods made again when the view's numbers changed, the runs of slices due built, a sweep done counted)
    const slices = plan.slices;
    const sliceFrom = plan.sliceFrom;
    this.sliceCredit = plan.sliceCredit;
    this.drop.set(plan.drop);
    this.everyVersion = plan.everyVersion;
    this.everyAcross = plan.everyAcross;
    this.testValues(passes.volume);
    // (the temporal accumulation: the slices owed are blended from reduced, jittered ones, except in the frame of a change of the view, a setting or the gap, which builds exactly and starts the average again; accum 0, the tests' control, builds exactly always)
    const accumulating = this.accumulator !== null && this.accum > 0 && !view && this.accumLast === this.accum;
    if (this.accumulator !== null && this.accumLast !== this.accum) {
      this.accumLast = this.accum;
      this.refreshAll();
    }
    // (the front volume's job: the released jobs uploaded before the builds; an exact build's frame drops the output of the old view)
    const fresh = this.frontWorkerFrame(time, settings, jump, view, leadNow, plan.sliceFrom);
    if (accumulating) {
      this.accumulator!.begin();
      for (let i = 0; i < plan.runs.length; i += 2) {
        this.accumulator!.build(this.light, plan.runs[i], plan.runs[i + 1], this.heldNow, this.lod ? this.drop : null, this.accum, fresh);
      }
      if (!fresh) {
        this.frontAccumState.gpuSweeps++;
      }
      this.accumFrames = this.accumulator!.frames;
    } else {
      for (let i = 0; i < plan.runs.length; i += 2) {
        this.light.build("fog volume", passes.volume, passes.copy, plan.runs[i], plan.runs[i + 1], 0, this.heldNow, this.lod ? this.drop : null);
      }
      this.accumFrames = 0;
      if (this.accumulator !== null) {
        this.accumulator.reset(this.accum);
      }
    }
    // the base mist: an exact build on a setting's or a size change, an accumulation on a change of the view, nothing once converged and still (no time input; a strike does not touch it); no draw where it is not read
    if (this.baseMist !== null) {
      if (settings) {
        this.baseMist.schedule.event("settings");
      } else if (moved) {
        this.baseMist.schedule.event("view");
      }
      if (baseOn) {
        // (the base shade grid on the CPU: baked in bands while it is owed; the job's frame: asked a lead ahead and released here when baseWorker is on and there is a lead; otherwise, or when no job is due, the GPU's own)
        if (this.baseWorker) {
          this.baseGridUpdate(time);
        }
        if (!this.baseWorkerFrame(time, settings, leadNow)) {
          const index = this.baseMist.schedule.frames;
          const decision = this.baseMist.schedule.next();
          if (decision.draw) {
            this.baseMist.frame(decision, index, this.baseStrength());
            if (!decision.exact) {
              this.baseAccumState.gpuFrames++;
            }
          }
        }
      } else if (this.baseStream !== null) {
        this.baseDrop();
      }
    }
    const drawn = plan.drawn;
    this.sweep = plan.sweep;
    this.sliceNext = plan.sliceNext;
    // (stages 4 and 5: its light in the fog, a half of its slices each; then done)
    let gatheredNow = 0;
    if (active >= 0) {
      const stage = this.stage[active];
      if (stage === STAGES - 1) {
        this.gatherStrike(active, 0, SLICES / 2);
      } else if (stage === STAGES) {
        this.gatherStrike(active, SLICES / 2, SLICES);
        this.gatheredAt[active] = time;
        this.ready[active] = 1;
        gatheredNow++;
      }
      this.stage[active] = stage < STAGES ? stage + 1 : 0;
    }
    this.refreshed.shadeLayers = owed * this.layers;
    this.refreshed.volumeSlices = slices;
    this.refreshed.volumeBuilt = drawn;
    this.refreshed.sliceFrom = sliceFrom;
    this.refreshed.strikeSlots = gatheredNow;
  }

  // the front volume's job (Feature P1, story P8a = V6): the accumulating frames' fresh columns computed on the frontTasks' workers (a band of rows each) from the CPU twin over the CPU noise and the CPU shade grid, asked ahead for the
  // pose the view shows at the release frame (frontStream, models/frontvolumelead.ts: every sweep in the steady state, every frame for FogAccum.FRAMES jobs after a change of the view), uploaded in one texSubImage3D at the release
  // frame (FogAccumulation.upload) and blended and stored once per upload by the accumulation (build with fresh). Returns whether the accumulating frame's builds are the job's. The exact builds stay the GPU's; a frame with no lead, the
  // option off, no usable front grid or a worker not warmed is the GPU's fresh pass (today's path); a late or lost answer is the stream's own fn run inline (the ThreadedTask rule)
  frontWorkerFrame(time: number, settings: boolean, jump: boolean, view: boolean, lead: { time: number; ahead: ViewDecision; askMoved: boolean; target: ParallaxOffsets } | null, sliceFrom: number): boolean {
    const acc = this.accumulator, state = this.frontAccumState, tasks = this.frontTasks, feed = this.baseFeed;
    if (!this.frontWorker || acc === null || !(this.accum > 0) || tasks.length === 0 || !lead || !(this.leadDelay > 0) || feed === null) {
      if (M.TEST) {
        this.frontWhy(!this.frontWorker ? "optionOff" : acc === null || tasks.length === 0 || feed === null ? "noTask" : !(this.accum > 0) ? "exactOnly" : !lead ? "noLead" : "noDelay");
      }
      if (this.frontStream !== null) {
        this.frontDrop();
      }
      if (acc !== null) {
        acc.dropFresh();
      }
      return false;
    }
    if (!this.frontStarted) {
      this.frontStarted = true;
      for (const task of tasks) {
        task.start();
      }
    }
    while (this.frontShippers.length < tasks.length) {
      this.frontShippers.push(new FrontVolumeJob.Shipper());
    }
    feed.setNoiseStretch(NOISE_STRETCH);
    this.frontWarm();
    this.frontGridUpdate(time);
    if (settings || jump) {
      this.frontDrop();
      acc.dropFresh();
    } else if (view) {
      acc.dropFresh();
    }
    if (this.frontStream === null) {
      this.frontStream = new FrontVolumeLead.Stream((input: FrontVolumeInput): FrontResult | null => {
        try {
          return { whole: FrontVolumeJob.columns(input), bands: [], ranges: [], input };
        } catch {
          return null;
        }
      }, this.leadDelay);
    }
    const stream = this.frontStream;
    stream.delay = this.leadDelay;
    if (lead.askMoved) {
      this.frontMoved = true;
    }
    const ms = time * 1000;
    if (!settings && stream.pending() < FRONT_PENDING_MOST && this.frontReady()) {
      let made: FrontVolumeInput | null = null;
      const shaded = this.ubo.data[11]! > 1.5, ahead = M.ParallaxLead.lead(this.leadDelay) + FrontVolumeJob.PERIOD_SECONDS / 2;
      const id = stream.ask(ms, lead.target, this.frontMoved, (k) => (made = this.frontJobInput(k, lead.target, time + ahead, shaded)));
      const input = made as FrontVolumeInput | null;
      if (id !== null && input !== null) {
        this.frontMoved = false;
        state.asks++;
        this.frontDispatch(id, input);
      }
    }
    const c = this.camera, live: ParallaxOffsets = { yaw: c.yaw, pitchShift: c.pitchShift, eyeX: c.eyeX, eyeShift: c.eyeShift };
    for (const t of stream.take(ms, live, (id) => this.frontAnswers.get(id))) {
      this.frontAnswers.delete(t.id);
      if (!t.apply) {
        state.dropped++;
        continue;
      }
      if (t.superseded) {
        state.superseded++;
        continue;
      }
      if (!t.output) {
        continue;
      }
      // (the slices the frame blends and those of the frames until the next job's release: the whole output when the next one is a sweep away)
      const next = stream.nextReleaseMs(), jitter = this.frontJitters.get(t.id) || FogAccum.jitter(t.k), result = t.output;
      const ranges = FrontVolumeJob.extents(sliceFrom, FrontVolumeJob.sliceCount(next === null ? FrontVolumeJob.PERIOD_SECONDS : Math.max(0, next - ms) / 1000));
      const parts = result.whole ? ranges.map((r) => result.whole!.subarray(r[0]! * 2 * this.frontPlane(), r[1]! * 2 * this.frontPlane())) : FrontVolumeJob.assembleParts(result.bands, result.ranges, result.input, ranges);
      ranges.forEach((r, i) => acc.upload(parts[i]!, { factor: this.frontFactorNow(), covered: SLICES, jitter, first: r[0]! }, [r]));
      this.frontJitters.delete(t.id);
      state.uploads++;
      if (t.by === "worker") {
        state.byWorker++;
      } else {
        state.byInline++;
        if (M.TEST) {
          this.baseTime(state.inlineMs, t.inlineMs);
        }
      }
    }
    state.blends = acc.blends;
    state.skipped = acc.skipped;
    return acc.freshValid;
  }

  // the halves of one layer of a job's output (the reduced columns x 4)
  frontPlane(): number {
    return FogAccum.reduced(this.columns[0]!, this.frontFactorNow()) * this.frontRows() * 4;
  }

  // the rows of the reduced columns of a job (the volume's rows divided by the job's factor)
  frontRows(): number {
    return FogAccum.reduced(this.columns[1]!, this.frontFactorNow());
  }

  // the jobs' column reduction: the job's own, or the tests' (M.TEST only)
  frontFactorNow(): number {
    return M.TEST && this.frontFactor > 0 ? this.frontFactor : FrontVolumeJob.FACTOR;
  }

  // nothing in flight is applied, the next jobs start a burst (a settings change, a jump in time, or the option turned off)
  frontDrop(): void {
    if (this.frontStream !== null) {
      this.frontStream.reset();
    }
    this.frontAnswers.clear();
    this.frontJitters.clear();
    this.frontMoved = true;
  }

  // the tests' count of why a frame was or was not the job's (M.TEST only)
  frontWhy(key: string): void {
    this.frontAccumState.why[key] = (this.frontAccumState.why[key] || 0) + 1;
  }

  get frontTask(): JobTask<FrontVolumeInput, Uint16Array> | null {
    return this.frontTasks.length > 0 ? this.frontTasks[0]! : null;
  }

  // whether a job can be asked: every task's worker warmed, the noise's stretch known, the front grid held at the current settings and no older than its bound, an exact build made
  frontReady(): boolean {
    const acc = this.accumulator, feed = this.baseFeed, g = this.frontGrid;
    return this.frontTasks.length > 0 && this.frontTasks.every((t) => t.warmed) && acc !== null && acc.made && feed !== null && feed.noiseStretch !== null && g.halves !== null && g.policy.usable(this.lastTime);
  }

  // the warm message of the tasks (the noise's stretch and version): given once, again if either changes
  frontWarm(): void {
    const feed = this.baseFeed;
    if (!feed || feed.noiseStretch === null) {
      return;
    }
    const key = feed.noiseStretch + ":" + feed.noiseVersion;
    if (key !== this.frontWarmed) {
      this.frontWarmed = key;
      for (const task of this.frontTasks) {
        task.warmWith({ stretch: feed.noiseStretch, version: feed.noiseVersion });
      }
    }
  }

  // the front's shade grid on the CPU for the jobs: the layers 0..95 baked in bands by the 'baseshade' tasks for a time (M.FrontVolumeJob.GridPolicy decides: at the start, on a front setting's or the base's strength change, and again at half
  // the age bound), put together with the base's 96 layers (M.BaseShadeGrid) into the 192 the job reads; nothing is read back from the GPU
  frontGridUpdate(time: number): void {
    const g = this.frontGrid, bg = this.baseGrid, state = this.frontAccumState, J = FrontVolumeJob;
    if (!this.baseWorker) {
      this.baseGridUpdate(time);
    }
    const seen = g.seen, sigma = this.sigma(), tail = this.frontTail(), scale = this.frontScale();
    if (!g.started) {
      g.started = true;
      g.policy.event("start");
    }
    if (sigma !== seen.sigma) {
      seen.sigma = sigma;
      g.policy.event("sigma");
    }
    if (tail !== seen.tail) {
      seen.tail = tail;
      g.policy.event("tail");
    }
    if (scale !== seen.scale) {
      seen.scale = scale;
      g.policy.event("tailscale");
    }
    if (this.baseGridVersion.version !== seen.base) {
      seen.base = this.baseGridVersion.version;
      g.policy.event("strength");
    }
    if (!bg.halves || bg.total === 0 || bg.done !== bg.total) {
      return;
    }
    const per = BaseShadeGrid.LAYERS / M.BaseShadeWorker.BAND, band = M.BaseShadeWorker.BAND;
    if (g.building === null && g.policy.due(time)) {
      g.policy.begin(time);
      g.building = { front: new Uint16Array(BaseShadeGrid.LENGTH), queue: Array.from({ length: per }, (_v, i) => i), total: per, done: 0, busy: this.baseShadeTasks.map(() => false), time: time - (M.TEST ? this.frontGridLag : 0), sigma, tail, scale };
    }
    const b = g.building;
    if (b === null) {
      return;
    }
    this.baseShadeTasks.forEach((task, ti) => {
      if (b.busy[ti] || b.queue.length === 0 || !task.warmed) {
        return;
      }
      const index = b.queue.shift()!, from = index * band;
      const input: BaseShadeJob = { ...BaseShadeGrid.inputOf(NOISE_STRETCH, bg.strength, { sigma: b.sigma, time: b.time, tail: b.tail, tailScale: b.scale }), layers: [from, from + band], part: "front" };
      b.busy[ti] = true;
      task.ask(input, 600000).then(
        (out) => {
          b.busy[ti] = false;
          if (g.building !== b) {
            return;
          }
          b.front.set(out, from * BaseShadeGrid.PLANE);
          b.done++;
          if (b.done === b.total) {
            g.building = null;
            if (g.policy.complete() && bg.halves) {
              g.halves = J.assembleGrid(b.front, bg.front ? bg.halves.subarray(BaseShadeGrid.LENGTH) : bg.halves);
              g.version++;
              state.gridBakes++;
            }
          }
        },
        () => {
          b.busy[ti] = false;
          if (g.building === b) {
            b.queue.unshift(index);
          }
        }
      );
    });
  }

  // the job's input for the accumulation's index k and the target pose: the volume's columns' rays for the pose and the lens the volume is built for, the eye, the front's settings and colours, the light (the atmosphere's
  // ambient, the Orb's irradiance, the front grid whole: the band's task gets it once per version), the jitter of the index, the octaves dropped and the water's cut as the GPU's pass reads them
  frontJobInput(k: number, target: ParallaxOffsets, time: number, shaded: boolean): FrontVolumeInput {
    const J = FrontVolumeJob, c = this.camera, feed = this.baseFeed!, g = this.frontGrid;
    if (M.TEST && this.frontTimeMode === 1) {
      if (this.frontTimeHeld === null) {
        this.frontTimeHeld = time;
      }
      time = this.frontTimeHeld;
    }
    if (M.TEST) {
      time += this.frontTimeOffset;
    }
    const frame = M.Frame.atPose(c.frameInput(), { yaw: target.yaw, pitch: target.pitchShift, eyeX: target.eyeX, eyeY: target.eyeShift });
    frame.lensX = this.builtLens.x;
    frame.lensY = this.builtLens.y;
    const moon = M.QualityFogVolume.MOON_BASE;
    const params = {
      sigma: this.sigma(),
      time,
      tail: this.frontTail(),
      tailScale: this.frontScale(),
      flat: this.frontFlatNow(),
      far: this.lod,
      focal: c.focal(),
      columnWidth: this.columns[2]!,
      main: Array.from(this.lightMain),
      second: Array.from(this.lightSecond),
      noiseVersion: feed.noiseVersion,
      noiseStretch: NOISE_STRETCH,
      light: { version: g.version, grid: g.halves, sky: this.ambient(), moon: [moon[0]! * this.moonGain[0]!, moon[1]! * this.moonGain[1]!, moon[2]! * this.moonGain[2]!], shaded },
    };
    return J.inputOf(null, M.BaseMistJob.viewOf(frame, this.columns[0]!, this.columns[1]!, this.ubo.data[15]!), M.BaseMistJob.eyeOf(frame), params, this.frontFactorNow(), FogAccum.jitter(M.TEST && this.frontJitterMode === 1 && this.accumulator ? this.accumulator.frames : M.TEST && this.frontJitterMode === 2 ? 0 : k), { slices: SLICES, cull: this.heldNow !== null, drop: this.lod ? this.drop.slice() : undefined });
  }

  // the job asked of the tasks, a band of rows each (each task is sent the grid once per version: M.FrontVolumeJob.Shipper), the bands laid into one output when all have answered (kept by the ask's id for the stream's release)
  frontDispatch(id: number, whole: FrontVolumeInput): void {
    this.frontJitters.set(id, whole.jitter);
    const tasks = this.frontTasks, g = this.frontGrid, ranges = M.FrontVolumeWorker.bandsOf(this.frontRows(), tasks.length), deadline = Math.max(50, M.ParallaxLead.lead(this.leadDelay) * 1000);
    const t0 = performance.now(), bands = ranges.map((range, i) => {
      const task = tasks[i]!, gen = task.alive + ":" + task.restarts + ":" + (task.inline ? 1 : 0);
      if (this.frontShipGen[i] !== gen) {
        this.frontShipGen[i] = gen;
        this.frontShippers[i]!.reset();
      }
      const grid = this.frontShippers[i]!.ship(g.version, g.halves!);
      return task.ask({ ...whole, rows: range, params: { ...whole.params, light: { ...whole.params.light, grid } } }, deadline);
    });
    Promise.all(bands).then(
      (outs) => {
        this.frontAnswers.set(id, { whole: null, bands: outs, ranges, input: whole });
        if (M.TEST) {
          this.baseTime(this.frontAccumState.workerMs, performance.now() - t0);
        }
      },
      () => undefined
    );
  }

  // the tests' statistics of a time: n, sum and largest
  baseTime(s: { n: number; sum: number; max: number }, ms: number): void {
    s.n++;
    s.sum += ms;
    if (ms > s.max) {
      s.max = ms;
    }
  }

  // the tasks' warm message: the noise's stretch (and the base mist task's version): given once, and again if the stretch changes; the workers generate the noise before the first job
  baseWarm(): void {
    const feed = this.baseFeed;
    if (!feed || feed.noiseStretch === null) {
      return;
    }
    const key = feed.noiseStretch + ":" + feed.noiseVersion;
    if (key === this.baseWarmed) {
      return;
    }
    if (this.baseTask) {
      this.baseTask.warmWith({ stretch: feed.noiseStretch, version: feed.noiseVersion });
    }
    for (const task of this.baseShadeTasks) {
      task.warmWith({ stretch: feed.noiseStretch });
    }
    this.baseWarmed = key;
  }

  // the tests' count of why a frame was or was not the job's (M.TEST only: Fog.baseAccumState.why)
  baseWhy(key: string): void {
    this.baseAccumState.why[key] = (this.baseAccumState.why[key] || 0) + 1;
  }

  // whether the job's data is read back (the noise, the front's shade and, with its shade on, the base's): the tests wait for it before a view change, since a change asked before it is the GPU's
  baseFeedReady(): boolean {
    return this.baseFeed !== null && this.baseMist !== null && this.baseFeed.ready(this.shadeSchedule.bakes, this.ubo.data[11]! > 1.5);
  }

  // the tests' hook: the job's data read back (the noise, the base's and the front's shade, the front's begun now) with real waits between steps; true when it is ready
  async baseSnapshot(time: number): Promise<boolean> {
    const feed = this.baseFeed;
    if (!feed || !this.baseMist) {
      return false;
    }
    for (let i = 0; i < 1200; i++) {
      const bakes = this.shadeSchedule.bakes, shaded = this.ubo.data[11]! > 1.5;
      this.baseGridUpdate(time);
      if (feed.ready(bakes, shaded)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  // the base shade grid on the CPU, owed at the start, on a change of the base's strength (or of the front switch) and on a size change: baked once per event by the 'baseshade' tasks in bands of BAND layers (one band a free task a
  // frame; a band is never run inline unless its worker is lost), installed in the feed when whole; until then the feed is not ready and the GPU's fresh pass makes the change
  baseGridUpdate(time: number): void {
    const feed = this.baseFeed, g = this.baseGrid, strength = this.baseStrength();
    if (!feed || !this.baseMist || !this.caps.floats || !(strength > 0)) {
      return;
    }
    feed.setNoiseStretch(NOISE_STRETCH);
    this.baseWarm();
    let begin = false;
    if (!g.started) {
      g.started = true;
      this.baseGridVersion.event("start");
      begin = true;
    } else if (strength !== g.strength || this.baseFrontShade !== g.front) {
      this.baseGridVersion.event("strength");
      begin = true;
    } else if (g.size) {
      this.baseGridVersion.event("size");
      begin = true;
    }
    g.size = false;
    if (begin) {
      const per = BaseShadeGrid.LAYERS / M.BaseShadeWorker.BAND;
      g.version = this.baseGridVersion.version;
      g.strength = strength;
      g.front = this.baseFrontShade;
      g.time = time;
      g.halves = new Uint16Array(BaseShadeGrid.LENGTH * (g.front ? 2 : 1));
      g.total = per * (g.front ? 2 : 1);
      g.done = 0;
      g.queue = Array.from({ length: g.total }, (_v, i) => i);
      g.busy = this.baseShadeTasks.map(() => false);
      feed.clearGrid();
    }
    const per = BaseShadeGrid.LAYERS / M.BaseShadeWorker.BAND, band = M.BaseShadeWorker.BAND;
    this.baseShadeTasks.forEach((task, ti) => {
      if (g.busy[ti] || g.queue.length === 0 || !task.warmed) {
        return;
      }
      const b = g.queue.shift()!, version = g.version, front = g.front && b < per, from = (b % per) * band;
      const input: BaseShadeJob = { ...BaseShadeGrid.inputOf(NOISE_STRETCH, g.strength, g.front ? { sigma: this.sigma(), time: g.time, tail: this.frontTail(), tailScale: this.frontScale() } : undefined), layers: [from, from + band], part: front ? "front" : "base" };
      g.busy[ti] = true;
      task.ask(input, 600000).then(
        (out) => {
          g.busy[ti] = false;
          if (version !== g.version || !g.halves) {
            return;
          }
          g.halves.set(out, (front || !g.front ? 0 : BaseShadeGrid.LENGTH) + from * BaseShadeGrid.PLANE);
          g.done++;
          if (g.done === g.total) {
            feed.setGrid(version, g.halves);
          }
        },
        () => {
          g.busy[ti] = false;
          if (version === g.version) {
            g.queue.unshift(b);
          }
        }
      );
    });
  }

  // the tests' hook: the noise's 8 levels read back from the GPU's texture whole and packed (the layout of M.BaseMistJob.packNoise); never read by the base worker
  noiseBytesGpu(): Uint8Array {
    const gl = this.gl;
    let total = 0;
    for (let level = 0; level < 8; level++) {
      total += Math.pow(NOISE >> level, 3);
    }
    const out = new Uint8Array(total);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    let at = 0;
    for (let level = 0; level < 8; level++) {
      const n = NOISE >> level, row = new Uint8Array(n * n * 4);
      for (let z = 0; z < n; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.noise, level, z);
        gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, row);
        for (let i = 0; i < n * n; i++) {
          out[at + z * n * n + i] = row[i * 4]!;
        }
      }
      at += n * n * n;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    return out;
  }

  // the tests' hook: the GPU's base shade layers (the shade texture's layers 96..191) read back whole as halves in the order of M.BaseShadeGrid; never read by the base worker
  baseShadeGpu(): Uint16Array {
    const gl = this.gl, across = 128, up = 64, deep = 96;
    const out = new Uint16Array(across * up * deep * 2), row = new Float32Array(across * up * 4);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    for (let z = 0; z < deep; z++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.shade, 0, deep + z);
      gl.readPixels(0, 0, across, up, gl.RGBA, gl.FLOAT, row);
      for (let i = 0; i < across * up; i++) {
        out[(z * across * up + i) * 2] = M.BaseMistJob.halfOf(row[i * 4]!);
        out[(z * across * up + i) * 2 + 1] = M.BaseMistJob.halfOf(row[i * 4 + 1]!);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    return out;
  }

  // the tests' hook: the base shade grid the worker path holds (the base's 96 layers), once the tasks have baked it
  baseCpuGrid(): Promise<Uint16Array> {
    return new Promise((resolve, reject) => {
      const tick = (n: number): void => {
        this.baseGridUpdate(this.lastTime);
        const g = this.baseGrid;
        if (g.halves && g.total > 0 && g.done === g.total) {
          resolve(g.halves.subarray(g.front ? BaseShadeGrid.LENGTH : 0));
        } else if (n > 2400) {
          reject(new Error("the base shade grid was not baked"));
        } else {
          setTimeout(() => tick(n + 1), 50);
        }
      };
      tick(0);
    });
  }

  // the tests' hook: the job for the live pose run here at a factor, jitter and rows (the cut of the last build's plan only at the job's own factor), after baseSnapshot
  baseJobRun(options: { factor: number; jitter: number[]; cut: boolean; rows: number[] }): { out: Uint16Array; across: number; down: number; ra: number; rd: number } {
    const c = this.camera, J = M.BaseMistJob, g = this.baseMist!.geometry();
    const input = this.baseJobInput(0, { yaw: c.yaw, pitchShift: c.pitchShift, eyeX: c.eyeX, eyeShift: c.eyeShift }, this.ubo.data[11]! > 1.5);
    const run: BaseMistInput = { ...input, factor: options.factor, jitter: options.jitter, rows: options.rows };
    if (!options.cut || options.factor !== J.FACTOR) {
      delete run.cut;
    }
    const [ra, rd] = J.reducedOf(g.across, g.down, options.factor) as [number, number];
    return { out: J.columns(run), across: g.across, down: g.down, ra, rd };
  }

  // the asks and the answers dropped (the exact build is owed, the option is off, there is no lead, or the base is not drawn)
  baseDrop(): void {
    this.baseStart = null;
    this.baseArmed = false;
    if (this.baseStream !== null) {
      this.baseStream.reset();
    }
    this.baseReady.clear();
  }

  // the base mist's accumulating frame with the job (Feature P1, story P6 = M7): the jobs of a view change are asked a lead ahead (one a frame, the accumulation's index k: M.BaseMistLead.Stream) for the pose the view shows at
  // their release frame, each answered by the worker (the JobTask's deadline is the lead: a late worker is replaced by the same pure job run inline) and released at that frame, where its output is uploaded
  // (BaseMistVolume.frame's job) and blended and stored as the GPU's fresh pass would be; an ask for a pose the live view does not show is dropped. The accumulation advances per released job. Returns whether it made this
  // frame's build (the GPU's fresh pass is then not run); false: no lead, the option off, an exact build owed, no job due and none in flight (the GPU's pass completes the change: today's path)
  baseWorkerFrame(time: number, settings: boolean, lead: { time: number; ahead: ViewDecision; askMoved: boolean; target: ParallaxOffsets } | null): boolean {
    const bm = this.baseMist!, feed = this.baseFeed, stream = this.baseStream, task = this.baseTask, state = this.baseAccumState;
    if (!this.baseWorker || !feed || !stream || !task || !lead || !(this.leadDelay > 0) || settings || bm.schedule.mode === "exact") {
      if (M.TEST) {
        this.baseWhy(!this.baseWorker ? "optionOff" : !feed || !stream ? "noFeed" : !task ? "noTask" : !lead ? "noLead" : !(this.leadDelay > 0) ? "noDelay" : settings ? "settings" : "exactOwed");
      }
      this.baseDrop();
      return false;
    }
    const mode = bm.schedule.mode, bakes = this.shadeSchedule.bakes, shaded = this.ubo.data[11]! > 1.5;
    // a view change asked now: its jobs need a front snapshot begun within FRESH_SECONDS of it (or after it), and wait for it; the GPU's pass covers the frames meanwhile
    if (lead.askMoved) {
      this.baseStart = { time, released: false };
      this.baseArmed = false;
    } else if (this.baseStart !== null && !this.baseStart.released && lead.ahead.moved && time > this.baseStart.time) {
      this.baseStart.released = true;
    }
    const ms = time * 1000, c = this.camera;
    stream.delay = this.leadDelay;
    const ready = bm.exactBuilds > 0 && feed.ready(bakes, shaded) && task.warmed;
    if (M.TEST) {
      if (lead.askMoved) {
        this.baseWhy("askMoved");
        this.baseWhy(ready ? "askMovedReady" : "askMovedNotReady");
      }
      if (lead.ahead.moved) {
        this.baseWhy("releasedMoved");
      }
    }
    // (the schedule's index: 0 for a start before the schedule restarts for this change, the schedule's frames for a late start, after the GPU drew the first frames)
    const start = this.baseStart;
    if (start !== null && !this.baseArmed && start.released && mode === "idle") {
      this.baseStart = null;
    } else if ((ready || this.baseArmed) && start !== null && M.BaseMistWorker.asks({ option: this.baseWorker, worker: true, delay: this.leadDelay, started: true, settings: false, size: false, accumulating: true })) {
      let made: BaseMistInput | null = null;
      const arming = !this.baseArmed;
      const id = stream.ask(ms, lead.target, arming, (k) => (made = this.baseJobInput(k, lead.target, shaded)), start.released && mode === "accumulating" ? bm.schedule.frames : 0);
      if (id === null) {
        this.baseStart = null;
      } else if (made !== null) {
        this.baseArmed = true;
        state.asks++;
        // (with no worker alive the job is run at its release, inline, by the stream: the same output, once)
        if (!task.inline) {
          const t0 = performance.now();
          task.ask(made, this.leadDelay * 1000).then((output) => {
            this.baseReady.set(id, output);
            if (M.TEST) {
              this.baseTime(state.workerMs, performance.now() - t0);
            }
          }, () => undefined);
        }
      }
    }
    const live: ParallaxOffsets = { yaw: c.yaw, pitchShift: c.pitchShift, eyeX: c.eyeX, eyeShift: c.eyeShift };
    let drawn = 0;
    for (const t of stream.take(ms, live, (id) => this.baseReady.get(id))) {
      this.baseReady.delete(t.id);
      if (!t.apply) {
        state.dropped++;
        continue;
      }
      const index = bm.schedule.frames, decision = bm.schedule.next();
      if (decision.draw && !decision.exact) {
        bm.frame(decision, index, this.baseStrength(), { factor: M.BaseMistJob.FACTOR, output: t.output! });
        state.uploads++;
        if (t.by === "worker") {
          state.byWorker++;
        } else {
          state.byInline++;
          if (M.TEST) {
            this.baseTime(state.inlineMs, t.inlineMs);
          }
        }
        drawn++;
      }
    }
    const took = drawn > 0 || (bm.schedule.mode === "accumulating" && stream.pending() > 0);
    if (M.TEST && !took && bm.schedule.mode === "accumulating") {
      this.baseWhy(ready ? "fallbackReady" : "fallbackNotReady");
    }
    return took;
  }

  // the job's input for the accumulation's index k and the target pose: the volume's columns' rays for the pose and the lens the volume is built for, the eye, the light (the atmosphere's ambient, the Orb's irradiance, the clouds'
  // colours, the shade grid's snapshot: each version sent to the worker once), the jitter of the index, and the columns the last build's plan reads (a few slices more: the view moved since)
  baseJobInput(k: number, target: ParallaxOffsets, shaded: boolean): BaseMistInput {
    const J = M.BaseMistJob, c = this.camera, bm = this.baseMist!, feed = this.baseFeed!, task = this.baseTask!;
    const gen = task.alive + ":" + task.restarts + ":" + (task.inline ? 1 : 0);
    if (gen !== this.baseShipGen) {
      this.baseShipGen = gen;
      feed.forgetWorker();
    }
    const frame = M.Frame.atPose(c.frameInput(), { yaw: target.yaw, pitch: target.pitchShift, eyeX: target.eyeX, eyeY: target.eyeShift });
    frame.lensX = this.builtLens.x;
    frame.lensY = this.builtLens.y;
    const g = bm.geometry(), [ra, rd] = J.reducedOf(g.across, g.down, J.FACTOR) as [number, number];
    let cut: Uint16Array | undefined;
    if (bm.slicesNeeded.length === g.across * g.down) {
      const counts = new Uint16Array(bm.slicesNeeded.length);
      for (let i = 0; i < counts.length; i++) {
        counts[i] = Math.min(BaseMist.SLICES, bm.slicesNeeded[i]! + CUT_SLACK);
      }
      cut = J.cutOf(counts, g.across, g.down, ra, rd);
    }
    const sent = feed.ship();
    const moon = M.QualityFogVolume.MOON_BASE;
    const params = {
      hb: BaseMist.HB,
      base: this.baseStrength(),
      focal: bm.focal,
      main: Array.from(this.lightMain),
      second: Array.from(this.lightSecond),
      noiseVersion: feed.noiseVersion,
      noiseStretch: NOISE_STRETCH,
      light: { version: feed.gridVersion, grid: sent.grid, front: this.baseGrid.front, sky: this.ambient(), moon: [moon[0]! * this.moonGain[0]!, moon[1]! * this.moonGain[1]!, moon[2]! * this.moonGain[2]!], shaded },
    };
    return J.inputOf(sent.noise, J.viewOf(frame, g.across, g.down, this.ubo.data[15]!), J.eyeOf(frame), params, J.FACTOR, FogAccum.jitter(k), cut);
  }

  // the view's decision the lead releases at this frame (null without a lead: the plan decides from the camera's offsets): the pose the view shows `lead` later is asked of poseSource (the camera's own offsets
  // without one) and the decision made for it at once (the build is ordered for that pose), released at the frame the camera shows it. The clock is the update's time (the page's seconds) x 1000: only the differences
  // between its readings are used, and poseSource's msAhead is relative to the frame the coordinator last ticked, so the two clocks are never mixed. Once a frame: the fork and the update of the same time share it
  leadDecision(time: number): ViewDecision | null {
    if (!(this.leadDelay > 0)) {
      return null;
    }
    if (this.leadFrame && this.leadFrame.time === time) {
      return this.leadFrame.ahead;
    }
    const c = this.camera;
    const live: ParallaxOffsets = { yaw: c.yaw, pitchShift: c.pitchShift, eyeX: c.eyeX, eyeShift: c.eyeShift };
    const baseChanged = c.baseVersion !== this.baseSeen;
    const lead = this.viewLead;
    lead.delay = this.leadDelay;
    const pose = this.poseSource ? this.poseSource(this.leadDelay * 1000) : null;
    const ms = time * 1000;
    const target = pose ? FogPlan.offsetsOfPose(pose) : live;
    lead.ask(ms, target, baseChanged);
    const askMoved = lead.asked.moved;
    const released = lead.release(ms, live, baseChanged);
    const ahead: ViewDecision = { moved: released.moved, builtFor: released.builtFor };
    this.leadFrame = { time, ahead, askMoved, target };
    if (askMoved) {
      this.shadeViewAsk(target, time);
    }
    return ahead;
  }

  // the frame's values and the state the plan (models/fogplan.ts) works from; `copy`: the arrays and objects copied, for an input kept to be compared (the fork's)
  planInput(time: number, copy: boolean): FogPlanInput {
    const c = this.camera;
    const ahead = this.leadDecision(time);
    const built = this.caps.floats && this.on && this.columns[0] > 0 && !!this.passes;
    const strike: number[] = [];
    let shining = false;
    for (let slot = 0; slot < SLOTS; slot++) {
      const shown = this.shows(slot);
      shining = shining || (this.levels[slot] > 0 && shown);
      strike.push(shown ? this.levels[slot] : 0);
    }
    const arrays = <T extends ArrayLike<number>>(a: T): T => (copy ? ((a as unknown as { slice(): T }).slice()) : a);
    const offsets = (o: ParallaxOffsets): ParallaxOffsets => ({ yaw: o.yaw, pitchShift: o.pitchShift, eyeX: o.eyeX, eyeShift: o.eyeShift });
    return {
      time,
      lastTime: this.lastTime,
      stale: this.stale,
      built,
      sigma: this.sigma(),
      mist: this.baseStrength(),
      tail: this.frontTail(),
      tailScale: this.frontScale(),
      on: this.on,
      shining,
      colorMain: arrays(this.lightMain),
      colorSecondary: arrays(this.lightSecond),
      columns: this.columns.slice(),
      margin: MARGIN,
      strike,
      strikeScale: STRIKE_SCALE,
      boltColor: arrays(this.boltColor),
      // (the tests' march's segments, given at run time: a loop of a constant count is unrolled by Direct3D's compiler through ANGLE)
      marchSegments: MARCH_SEGMENTS,
      moonGain: arrays(this.moonGain),
      lod: this.lod,
      coverage: M.TEST ? this.coverage : true,
      hasSched: this.shadeSched !== null,
      shadeCpu: this.shadeCpu,
      baseChanged: c.baseVersion !== this.baseSeen,
      offsets: offsets(c),
      builtFor: offsets(this.builtFor),
      ...(ahead ? { ahead: { moved: ahead.moved, builtFor: offsets(ahead.builtFor) } } : {}),
      // (a camera without a lens, as a stand-in's, counts as lens 0)
      lensX: c.lens ? c.lens.x : 0,
      lensY: c.lens ? c.lens.y : 0,
      builtLensX: this.builtLens.x,
      builtLensY: this.builtLens.y,
      gap: REFRESH_GAP,
      // (the grids' framebuffers exist only with float pictures: none, the plan is not built)
      draws: this.shadeDraws ? this.shadeDraws.length : 0,
      shadeRate: SHADE_RATE * (M.TEST ? this.rateScale : 1),
      volumeScale: M.TEST ? this.rateScale : undefined,
      shadeCredit: this.shadeCredit,
      shadePart: this.shadePart,
      sliceCredit: this.sliceCredit,
      sliceNext: this.sliceNext,
      sweep: this.sweep,
      drop: arrays(this.drop),
      everyVersion: this.everyVersion,
      everyAcross: this.everyAcross,
      cameraVersion: c.version,
      eyeY: c.eyeY(),
      focal: c.focal(),
      width: c.width,
      height: c.height,
      tilt: c.tilt(),
      air: AIR_EXTINCTION,
      waterDrawn: false,
    };
  }

  // the frame's plan asked of its worker with the frame's exact values (after the frame's advance, before the draw: Effect.fork), the draw waiting for the answer; update takes it when
  // the values it gathers then are the same (the camera's size, a setting or a strike's light changed in between: it plans here instead)
  fork(time: number): Promise<void> | null {
    const task = this.planTask;
    if (!task) {
      return null;
    }
    const input = this.planInput(time, true);
    const planned = task.ask(input).then((output) => {
      this.answer = { input, output };
    });
    return planned;
  }

  // the shade grid's fresh reduced grid for the time and the jitter index k, as a job of the tasks' bands (M.ShadeAccumWorker.layersOf over the reduced grid's 48 layers, one band a task): the noise is not carried (the workers
  // prepared it at the warm message; `stretch` lets the main thread's inline run generate it), the front's sigma and profile and the time (as the shader's float) are
  shadeFreshInput(time: number, k: number, layers?: number[], lod?: boolean): ShadeFreshJob {
    return M.ShadeAccumWorker.inputOf(null, this.sigma(), Math.fround(time), k, { tail: this.frontTail(), scale: this.frontScale() }, { version: 1, stretch: NOISE_STRETCH, layers, lod });
  }

  // the bands of one ask: one input a task (all the bands but at least one)
  shadeBandInputs(time: number, k: number): ShadeFreshJob[] {
    const bands = M.ShadeAccumWorker.layersOf(0, M.ShadeAccumWorker.LAYERS, Math.max(1, this.shadeTasks.length));
    return bands.map((layers) => this.shadeFreshInput(time, k, layers));
  }

  // whether every task's worker has generated its noise (JobTask.warmed): nothing is asked before it
  shadeWarmed(): boolean {
    return this.shadeTasks.length > 0 && this.shadeTasks.every((task) => task.warmed);
  }

  // the tasks' warm message (the noise's stretch and version), once; the workers generate the noise before their first job
  shadeWarm(): void {
    const key = String(NOISE_STRETCH) + ":1";
    if (key !== this.shadeWarmKey && this.shadeTasks.length > 0) {
      for (const task of this.shadeTasks) {
        task.warmWith({ stretch: NOISE_STRETCH, version: 1 });
      }
      this.shadeWarmKey = key;
    }
    if (!this.shadeEverWarmed && this.shadeWarmed()) {
      this.shadeEverWarmed = true;
    }
  }

  // the joined fresh grid of the bands' outputs (the whole job's layout)
  static shadeJoin(inputs: ShadeFreshJob[]): Uint16Array {
    const out = new Uint16Array(M.ShadeAccumWorker.LENGTH);
    for (const input of inputs) {
      out.set(M.ShadeAccumWorker.job(input), input.layers![0]! * M.ShadeAccumWorker.LAYER);
    }
    return out;
  }

  // one accumulating frame of the lead path (Feature P1, story P8b): the job of the frame a lead ahead asked (every shadeEvery-th frame, in bands, each band of its own task with the lead as its deadline: a late worker is replaced by the
  // same pure job run inline; with a task inline the stream runs the whole job at the release), and the answers whose release time has come uploaded and blended. Returns whether the frame is the stream's (false: the GPU's own pass)
  shadeLeads(): boolean {
    return this.shadeTasks.length > 0 && M.ShadeAccumWorker.leads({ option: this.shadeAccumOn, worker: this.shadeWorker, lod: this.lod, started: true, stale: false, moved: false, switched: false, size: false, passed: 0, delay: this.leadDelay, warmed: this.shadeEverWarmed });
  }

  // the core layers of a band: shadeBands rounded up to a multiple of (the draws' layers over the held layers a reduced layer covers), so that the blend's draws cover the core's held layers exactly
  shadeCore(bands: number = this.shadeBands): number {
    const per = ShadeAccumGpu.FRONT_LAYERS / ShadeAccumGpu.FRESH[2]!, unit = this.layers > per ? Math.ceil(this.layers / per) : 1;
    return Math.max(1, Math.ceil(bands / unit) * unit);
  }

  shadeStreamFrame(d: { jitter: number }): boolean {
    const state = this.shadeAccumState;
    const lead = this.shadeLeads();
    if (!lead) {
      if (this.shadeStream !== null) {
        this.shadeStream.reset();
        this.shadeReady.clear();
        this.shadeLive.clear();
      }
      return false;
    }
    if (this.shadeStream === null) {
      this.shadeStream = new ShadeAccumLead.Stream<ShadeFreshJob[], Uint16Array>((inputs) => (this.shadeBands > 0 ? M.ShadeAccumWorker.job(inputs[0]!) : Fog.shadeJoin(inputs)), this.leadDelay);
    }
    if (this.shadeBands !== this.shadeBandsSeen) {
      this.shadeBandsSeen = this.shadeBands;
      this.shadeStream.reset();
      this.shadeReady.clear();
      this.shadeLive.clear();
      this.shadePlans.clear();
      this.shadeAskK = 0;
    }
    const stream = this.shadeStream;
    const banded = this.shadeBands > 0;
    stream.delay = this.leadDelay;
    const ms = this.ubo.data[1]! * 1000;
    // (one ask in flight at a time: a worker that is still on the last ask is not asked again, or its queue grows and every answer is late; an inline run is asked again after twice its own time, so that it takes at most half of the
    // wall clock; the cadence is thus the pool's own, and the blend's weight follows the frames between two releases)
    // (a task with no worker, or whose worker was made again after a loss and is still generating its noise, is not asked: the stream runs the same pure job inline at the release, the ThreadedTask's rule, so the schedule and the grid are the same whoever supplies the bytes)
    // (a band: the task it goes to is the next of the tasks, so that the workers share the frames' bands; two bands may be in flight, the third waits)
    const frame = this.shadeAskFrames++, bandTask = this.shadeTasks[this.shadeAskK % this.shadeTasks.length]!;
    const inlineMode = banded ? bandTask.inline || !bandTask.warmed : this.shadeTasks.some((task) => task.inline) || !this.shadeWarmed();
    const free = this.shadeAskEveryFrame || (inlineMode ? performance.now() - this.shadeInlineAt >= 2 * this.shadeInlineMs : banded ? this.shadeFlight < 2 : this.shadeFlight === 0);
    if (M.ShadeAccumWorker.cadence(frame, this.shadeEvery) && free) {
      if (!inlineMode && !this.shadeWarmed()) {
        state.askedUnwarmed++;
      }
      const plan = banded ? ShadeBands.bandAt(this.shadeAskK, M.ShadeAccumWorker.LAYERS, this.shadeCore()) : null;
      const k = plan ? plan.k : this.shadeAskK, at = ShadeAccumLead.timeAt(this.ubo.data[1]!, this.leadDelay);
      const inputs = plan ? [this.shadeFreshInput(at, k, [plan.from, plan.to])] : this.shadeBandInputs(at, k);
      this.shadeAskK++;
      const id = stream.ask(ms, k, inputs[0]!.time, inputs);
      this.shadeLive.add(id);
      if (plan) {
        this.shadePlans.set(id, plan);
      }
      state.asks++;
      if (!inlineMode && banded) {
        const t0 = performance.now();
        this.shadeFlight++;
        const generation = this.shadeGeneration;
        bandTask.ask(inputs[0]!, this.leadDelay * 1000).then((output) => {
          if (generation === this.shadeGeneration) {
            this.shadeFlight--;
            if (this.shadeLive.has(id)) {
              this.shadeReady.set(id, output);
            }
          }
          if (M.TEST) {
            this.baseTime(state.workerMs, performance.now() - t0);
          }
        }, () => undefined);
      } else if (!inlineMode) {
        const t0 = performance.now();
        this.shadeFlight++;
        const generation = this.shadeGeneration, landed = (): void => {
          if (generation === this.shadeGeneration) {
            this.shadeFlight--;
          }
        };
        Promise.all(inputs.map((input, band) => this.shadeTasks[band]!.ask(input, this.leadDelay * 1000))).then((outputs) => {
          landed();
          const whole = new Uint16Array(M.ShadeAccumWorker.LENGTH);
          outputs.forEach((out, band) => whole.set(out, inputs[band]!.layers![0]! * M.ShadeAccumWorker.LAYER));
          // (an answer of an earlier run, asked before the accumulation was started again, carries ids the new stream numbers again: only the generation that asked it may keep it)
          if (generation === this.shadeGeneration && this.shadeLive.has(id)) {
            this.shadeReady.set(id, whole);
          }
          if (M.TEST) {
            this.baseTime(state.workerMs, performance.now() - t0);
          }
        }, () => undefined);
      }
    }
    const taken = stream.take(ms, (id) => this.shadeReady.get(id));
    for (const t of taken) {
      this.shadeReady.delete(t.id);
      this.shadeLive.delete(t.id);
      // (the weight of the frames since the last release: the 8-frame average's own, 1 - (7/8)^gap)
      const gap = this.shadeAskEveryFrame ? 1 : Math.max(1, frame - this.shadeLastRelease);
      this.shadeLastRelease = frame;
      const band = this.shadePlans.get(t.id);
      this.shadePlans.delete(t.id);
      if (band) {
        this.shadeAccumulation!.accumulateBand(M.FogAccum.jitter(t.k), ShadeBands.alphaBand(), t.output, band);
        if (band.core[1] === M.ShadeAccumWorker.LAYERS) {
          state.bandCycles++;
        }
      } else {
        this.shadeAccumulation!.accumulate(M.FogAccum.jitter(t.k), M.ShadeAccumWorker.alphaFor(gap), t.output);
      }
      state.uploads++;
      state.freshBy = "task";
      state.jitterFrame = t.k;
      state.time = t.time;
      if (t.by === "worker") {
        state.byWorker++;
      } else {
        state.inlineRuns++;
        this.shadeInlineAt = performance.now();
        this.shadeInlineMs = t.inlineMs;
        if (M.TEST) {
          this.baseTime(state.inlineMs, t.inlineMs);
        }
      }
      this.shadeLog(t.k, t.by);
    }
    if (taken.length === 0) {
      // (nothing due: the held grid stands; the frame did not accumulate)
      this.shadeSkipped++;
    }
    void d;
    return true;
  }

  // the last 256 accumulating frames: the jitter index of the frame's fresh grid and whose it was ('worker', 'inline', 'gpu')
  shadeLog(k: number, by: string): void {
    const log = this.shadeAccumState.log;
    log.push({ k, by });
    if (log.length > 256) {
      log.shift();
    }
  }

  // the shadow grid's cells the view can read, for each draw of `layers` layers: [first column, columns, rows, first row] (QualityFogShade.boxesFor). The rays are those of the extended view
  // (the volume's margin included) at the camera's pitch, yaw, lens and eye, and at the pitch and yaw drifted by the mouse parallax's tolerance (the boxes are made again only after a larger
  // drift), so the columns follow the yaw and the eye's x offset (a read's column is (eyeX + s D) / D for a ray's dx / (-dz) = s at depth D), the rows the highest and lowest slopes.
  // fogCull=off in the tests: every draw from row 0
  viewBoxes(target?: ParallaxOffsets) {
    const c = this.camera;
    const tilt = target ? c.tilt() - c.pitchShift + target.pitchShift : c.tilt(), yaw = target ? target.yaw : c.yaw, eyeX = target ? target.eyeX : c.eyeX, eyeY = target ? c.eyeY() - c.eyeShift + target.eyeShift : c.eyeY();
    const count = QualityFogShade.viewRays(tilt, yaw, c.focal(), c.cx(), c.cy(), c.width, c.height, MARGIN * c.width, MARGIN * c.height, DRIFT_PITCH, DRIFT_YAW, this.viewRayBuffer);
    const boxes = QualityFogShade.boxesFor(this.viewRayBuffer, count, eyeX, eyeY, this.layers, DRIFT_EYE, !M.TEST || this.cull) as ViewBox[];
    const m = this.shadeMargin();
    return m.columns > 0 || m.rows > 0 ? (boxes.map((box) => ShadeDelta.expand(box, m)) as ViewBox[]) : boxes;
  }

  // the margin baked around each draw's box on the pool path (M.ShadeDelta.margin): the pose's travel over the lead, bounded by a nominal fast cursor (0.3 rad/s of yaw, 0.5 of pitch: the rows of a far draw's box move fast with the slope, 0.2 m/s and 0.1 m/s of the eye); 0 without the flag, the
  // lead, the workers' path or the shade schedule, so that the delay 0 and the lod off paths are today's
  shadeMargin(): { columns: number; rows: number } {
    if (!(this.shadeViewWorker || this.shadeViewBands) || !(this.leadDelay > 0) || !this.lod || this.shadeSched === null) {
      return { columns: 0, rows: 0 };
    }
    const lead = M.ParallaxLead.lead(this.leadDelay);
    return ShadeDelta.margin(lead, { yaw: 0.3 * lead, pitch: 0.5 * lead, eyeX: 0.2 * lead, eyeY: 0.1 * lead });
  }

  // a slot's light gathered into its stack of the strikes' light, its slices from..to (a later
  // part goes on from the sums of the slice before, read from the stack)
  gatherStrike(slot: number, from: number, to: number) {
    // (only once the passes are made: update's built)
    const passes = this.passes!;
    this.bindStrikeInputs();
    this.testValues(passes.strikes);
    this.gl.uniform1i(passes.strikes.use().uSlot, slot);
    this.strikeLight.build("strike light", passes.strikes, passes.strikesCopy, from, to, slot, this.heldNow);
  }

  // the strikes' programs drawn once, over one pixel (into slot 0's shadows and light, both made
  // again when a strike comes)
  warm() {
    const gl = this.gl;
    this.warmed = true;
    this.heldNow = null;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    this.bindStrikeInputs();
    this.bake("strike shade", this.passes!.strikeShade, this.strikeDraws[0], 0, 1, 0, false);
    this.gatherStrike(0, 0, 1);
    gl.uniform1f(this.passes!.baseShade.use().uBase, 0);
    this.bake("base mist shade", this.passes!.baseShade, this.baseShadeDraws, 0, 1, -1, false);
    gl.disable(gl.SCISSOR_TEST);
    // (the temporal accumulation's four programs: the first frame that accumulates would otherwise pay their first draw)
    if (this.accumulator !== null) {
      this.accumulator.warm(this.light);
    }
    if (this.baseMist !== null) {
      this.baseMist.warm();
    }
    if (this.shadeAccumulation !== null) {
      this.shadeAccumulation.warm();
    }
  }

  // the front shade grid by accumulation (Fog.shadeAccum, the GPU path only: not with Effect.lod on, whose workers own the grid, and not without float pictures): an EXACT bake (every draw of the refresh by parts' own
  // program) on the first frame, when the option is switched on (or the path comes back), on a setting's, size's, view's or jump's change (M.ShadeAccumGpu.Schedule); every other frame a jittered reduced bake blended into the
  // held front layers at 1 / 8 (never the base layers). Returns whether it made this frame's bake (false: the refresh by parts goes on, the option off or not applicable; the next frame it applies on is exact)
  shadeAccumFrame(plan: { settings: boolean; jump: boolean; moved: boolean; switched: boolean }, program: ShaderProgram): boolean {
    const active = this.shadeAccumOn && this.shadeAccumulation !== null && !this.lod;
    if (!active) {
      this.shadeAccumWas = false;
      return false;
    }
    if (!this.shadeAccumWas) {
      this.shadeAccumWas = true;
      this.shadeAccumSchedule = new ShadeAccumGpu.Schedule();
      this.shadeAccumState.asks = 0;
      this.shadeAccumState.uploads = 0;
      this.shadeAccumState.byWorker = 0;
      this.shadeAccumState.gpuFrames = 0;
      this.shadeAccumState.inlineRuns = 0;
      this.shadeAccumState.dropped = 0;
      this.shadeAccumState.askedUnwarmed = 0;
      this.shadeAccumState.bandCycles = 0;
      this.shadePlans.clear();
      this.shadeAccumState.log = [];
      this.shadeStream = null;
      this.shadeAskK = 0;
      this.shadeAskFrames = 0;
      this.shadeLastRelease = -1;
      this.shadeFlight = 0;
      this.shadeGeneration++;
      this.shadeSkipped = 0;
    }
    const state = this.shadeAccumState;
    this.shadeWarm();
    const d = this.shadeAccumSchedule.frame({ settings: plan.settings, jump: plan.jump, moved: ShadeBands.resets({ moved: plan.moved }, this.shadeBands > 0 && this.shadeLeads()), switched: plan.switched, size: this.shadeAccumResize }, 0);
    this.shadeAccumResize = false;
    if (d.exact) {
      // (the asks of the old average are dropped, the stream's index starts again)
      if (this.shadeStream !== null) {
        state.dropped += this.shadeStream.pending();
        this.shadeStream.reset();
      }
      this.shadeReady.clear();
      this.shadeLive.clear();
      this.shadeAskK = 0;
      this.shadeAskFrames = 0;
      this.shadeLastRelease = -1;
      this.shadeSkipped = 0;
      // every cell (not culled to the view's boxes: the accumulating frames blend the whole grid, so cells left out would hold history)
      const all = ShadeAccumGpu.exactBake(this.shadeDraws.length);
      this.bake("fog shade", program, this.shadeDraws, all.from, all.to, -1, all.inView);
    } else if (!this.shadeStreamFrame(d)) {
      // (the GPU's own pass: the option off, no lead, the tasks not warmed yet)
      this.shadeAccumulation!.accumulate(M.FogAccum.jitter(d.jitter), d.alpha);
      state.freshBy = "gpu";
      state.gpuFrames++;
      state.jitterFrame = d.jitter;
      state.time = this.ubo.data[1]!;
      this.shadeLog(d.jitter, "gpu");
    }
    state.exactBakes = this.shadeAccumSchedule.exactBakes;
    state.frames = this.shadeAccumSchedule.frames;
    state.accumulations = this.shadeAccumSchedule.accumulations - this.shadeSkipped;
    return true;
  }

  // the base mist's shade grid baked: all its layers, exactly, on the GPU (every cell of the grid: the view does not matter), in the guard's pieces like any other bake; the base strength is the program's one value
  bakeBaseShade() {
    const pass = this.passes!.baseShade;
    this.gl.uniform1f(pass.use().uBase, this.baseStrength());
    this.bake("base mist shade", pass, this.baseShadeDraws, 0, this.baseShadeDraws.length, -1, false);
    this.baseShade.bakes = this.shadeSchedule.bakes;
    this.baseShade.strength = this.shadeSchedule.baked;
  }

  // (the tests only) the one read of the combined shade, skyShade of a point of the world (the grid's coordinates), [sky, moon], through one pixel of a float picture
  shadeAt(point: number[]): number[] {
    const gl = this.gl;
    if (!this.shadeReadTarget) {
      const texture = this.own(M.RenderTarget.storage(gl, gl.RGBA32F, 1, 1, gl.NEAREST), (t: WebGLTexture) => gl.deleteTexture(t));
      const framebuffer = this.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.shadeReadTarget = { texture, framebuffer };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadeReadTarget.framebuffer);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.SCISSOR_TEST);
    const u = this.shadeReadProgram!.use();
    gl.uniform3f(u.uPoint, point[0]!, point[1]!, point[2]!);
    this.quad.drawFull();
    const out = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [out[0]!, out[1]!];
  }

  // (the tests' value on a program: every shadow marched)
  testValues(program: ShaderProgram) {
    if (M.TEST) {
      this.gl.uniform1i(program.use().uMarched, this.marched ? 1 : 0);
    }
  }

  // draws from..to of a grid's framebuffers baked (`layers` layers each), as the guard's pass
  // `name` (its slices a piece: layers here); slot: the strike's (-1: the sky's shadow); inView:
  // each draw scissored to the cells the view reads (viewBoxes; false: the scissor as it is)
  bake(name: string, program: ShaderProgram, framebuffers: WebGLFramebuffer[], from: number, to: number, slot: number, inView = true) {
    const gl = this.gl;
    const each = Math.max(1, Math.floor(this.guard.size(name, "slice") / this.layers));
    gl.viewport(0, 0, SHADE_ACROSS, SHADE_UP);
    const u = program.use();
    gl.uniform1i(u.uLayers, this.layers);
    if (slot >= 0) {
      gl.uniform1i(u.uSlot, slot);
    } else if (M.TEST) {
      gl.uniform1i(u.uMoonKernel, this.moonKernel);
    }
    if (inView) {
      gl.enable(gl.SCISSOR_TEST);
    }
    this.guard.begin(name, "slice");
    for (let k = from; k < to; k++) {
      if (inView) {
        const box = this.boxes[k];
        gl.scissor(box[0], box[3], box[1], box[2]);
      }
      if (name === "fog shade" && (!inView || (this.boxes[k]![1] > 0 && this.boxes[k]![2] > 0))) {
        this.shadeBaked++;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[k]);
      gl.uniform1i(u.uLayer, k * this.layers);
      this.quad.drawFull();
      if ((k - from) % each === each - 1 || k === to - 1) {
        this.guard.piece();
      }
    }
    this.guard.end();
    if (inView) {
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

// one random value a voxel
Fog.SEED_FRAGMENT = fill(SEED_FRAGMENT_SOURCE, { "M.HASH_GLSL": M.HASH_GLSL, "NOISE": NOISE, "NOISE * NOISE": NOISE * NOISE });

// a box of 5 along one axis, wrapping round
Fog.BLUR_FRAGMENT = fill(BLUR_FRAGMENT_SOURCE, { "NOISE": NOISE });

Fog.FINISH_FRAGMENT = fill(FINISH_FRAGMENT_SOURCE, { "noiseStretchText(NOISE_CONTRAST)": noiseStretchText(NOISE_CONTRAST) });

// the uniform block, the light around (the sky's and the moon's, and the strikes' color), and
// the volumes read at a place of the screen and a distance (after Camera.GLSL)
// the atmosphere block's size: aSH 9 + aInfo 1 + aOrb 1 vec4
const ATMOSPHERE_FLOATS = (9 + 2) * 4;

// the shared fog text: the Atmosphere block and its lookups (shaders/fog/atmosphere.glsl) inside it, always
Fog.GLSL = fill(FOG_SOURCE, { "ATMOSPHERE_GLSL": atmosphereText(), "AERIAL_GLSL": aerialText(), "FOG_FAR.toFixed(1)": FOG_FAR.toFixed(1), "AIR_SCATTER": AIR_SCATTER.toExponential(6), "AIR_EXTINCTION": AIR_EXTINCTION.toExponential(6), "BASE_FAR.toFixed(1)": BaseMist.FAR.toFixed(1), "BASE_SLICES.toFixed(1)": BaseMist.SLICES.toFixed(1), "BASE_LOG.toFixed(6)": BaseMist.LOG.toFixed(6), "FOG_LAYERS.toFixed(1)": BaseMist.TOTAL_LAYERS.toFixed(1), "BASE_CUT_Z.toFixed(8)": ((BaseMist.CUT_LAYER + 0.5) / BaseMist.TOTAL_LAYERS).toFixed(8), 'MOON.map((v) => v.toFixed(2)).join(", ")': MOON.map((v) => v.toFixed(2)).join(", "), 'MOON_DIR.map((v) => v.toFixed(2)).join(", ")': MOON_DIR.map((v) => v.toFixed(2)).join(", "), "MOON_RADIUS.toFixed(6)": MoonDisc.RADIUS.toFixed(6), "MOON_SOLID_ANGLE.toExponential(6)": MoonDisc.SOLID_ANGLE.toExponential(6), "SLICES.toFixed(1)": SLICES.toFixed(1), "SLICE_NEAR.toFixed(1)": SLICE_NEAR.toFixed(1), "Math.log(1 + FOG_FAR / SLICE_NEAR).toFixed(6)": Math.log(1 + FOG_FAR / SLICE_NEAR).toFixed(6), "STRIKE_SCALE.toFixed(1)": STRIKE_SCALE.toFixed(1), "SLOTS": SLOTS, "strikeTerms": Array.from({ length: SLOTS }, (v, k) => fill(STRIKE_TERM_SOURCE, { "s": "xyzw"[k], "k": k })).join("\n") });


// the atmosphere's text with the picture's size (the seen sky's SKY_W x SKY_H rows in a picture SKY_W x PICTURE_H: v scaled by SKY_V = SKY_H / PICTURE_H, the texel coordinate unchanged)
function atmosphereText(): string {
  const A = Atmosphere;
  return fill(ATMOSPHERE_SOURCE, { "SKY_W": A.SKY_W.toFixed(1), "SKY_V": (A.SKY_H / A.PICTURE_H).toExponential(9), "PICTURE_H": A.PICTURE_H.toFixed(1) });
}

// the aerial span's lookup (shaders/fog/aerial.glsl) with the table's layout (M.Atmosphere.picture: its columns, rows, first distance, logarithm scale and the rows of the transmittance and the light)
function aerialText(): string {
  const A = Atmosphere;
  return fill(AERIAL_SOURCE, {
    "AERIAL_W": A.AERIAL_W.toFixed(1), "AERIAL_H": A.AERIAL_H.toFixed(1), "AERIAL_FROM": A.AERIAL_FROM.toFixed(1), "AERIAL_LOG_SCALE": (1 / Math.log(A.AERIAL_TO / A.AERIAL_FROM)).toExponential(9),
    "AERIAL_ROW_T": (A.SKY_H + 1).toFixed(1), "AERIAL_ROW_L": (A.SKY_H + 1 + A.AERIAL_H).toFixed(1),
  });
}

// the moon kernel's directions as GLSL constants (MOON_K0 ...: MoonDisc.directions over the disc round MOON_DIR, nine decimals), the centre first
function moonKernelConstants(): string {
  const d = MoonDisc.directions(MOON_DIR, MoonDisc.RADIUS, MoonDisc.KERNEL_MAX);
  const lines: string[] = [];
  for (let k = 0; k < MoonDisc.KERNEL_MAX; k++) {
    lines.push(fill(MOON_CONSTANT_SOURCE, { "k": k, "x": d[3 * k].toFixed(9), "y": d[3 * k + 1].toFixed(9), "z": d[3 * k + 2].toFixed(9) }));
  }
  return lines.join("\n");
}

// the medium: its density, what it lets through between two places, the shadow grid's places,
// and the clouds' shadow of the sky and the moon marched. lod: log2 of the noise's texels at a
// size of 1 m that a sample stands for (lodOf: of a length)
Fog.MEDIUM_GLSL = fill(MEDIUM_SOURCE, { "COLOUR_LO": COLOUR_LO.toFixed(6), "COLOUR_HI": COLOUR_HI.toFixed(6), "MULTIPLE": MULTIPLE, "PHASE_GLSL": phaseGlsl(PHASE_FORWARD_W, PHASE_FORWARD_G, PHASE_BACKWARD_G), "SHADE_LAYERS.toFixed(1)": (SHADE_DEEP * 2).toFixed(1), "SHADE_TOP.toFixed(1)": SHADE_TOP.toFixed(1), "SHADE_NEAR.toFixed(2)": SHADE_NEAR.toFixed(2), "Math.log(FOG_FAR / SHADE_NEAR).toFixed(6)": Math.log(FOG_FAR / SHADE_NEAR).toFixed(6), "SHADE_ACROSS": SHADE_ACROSS, "SHADE_UP": SHADE_UP, "SHADE_DEEP": SHADE_DEEP, "M.Camera.SPAN.toFixed(4)": M.Camera.SPAN.toFixed(4), "SLOTS": SLOTS, "NOISE.toFixed(1)": NOISE.toFixed(1), "MOON_KERNEL": MoonDisc.KERNEL, "MOON_KERNEL_MAX": MoonDisc.KERNEL_MAX, "moonKernelConstants": moonKernelConstants() });

// the baked shadows read, and the clouds' light (after MEDIUM_GLSL). marched: the shadows
// marched, not baked
// (the clouds' light reads the atmosphere's upper hemisphere's mean radiance, atmosAmbient())
Fog.SHADE_GLSL = SHADE_SOURCE;

// the tests' value: every shadow marched (none in the wallpaper)
Fog.TEST_GLSL = TEST_SOURCE;

// a stretch of a ray (o + t d, a to b) added to what was gathered so far (acc: light, what is
// let through), its medium taken at its middle (mirrored: the place mirrored in the water)
Fog.GATHER_GLSL = fill(GATHER_SOURCE, { "QualityFog.TOP_MIP.toFixed(1)": QualityFog.TOP_MIP.toFixed(1) });

// the slices' bounds and the level for a column's slice
const SLICE_GLSL = fill(SLICE_SOURCE, { "CULL_BELOW.toFixed(2)": QualityFog.CULL_BELOW.toFixed(2), "CULL_RELATIVE": QualityFog.CULL_RELATIVE, "QualityFog.TAIL_T.toExponential(6)": QualityFog.TAIL_T.toExponential(6) });

// layers uLayer to uLayer + n - 1 of a grid: each output a layer's cell, value(p) its value
const gridFragment = (n: number, head: string, value: string) => fill(GRID_FRAGMENT_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "head": head, "layerOutputs": Array.from({ length: n }, (v, i) => fill(LAYER_OUTPUT_SOURCE, { "i": i })).join("\n"), "value": value, "n": n, "layerWrites": Array.from({ length: n }, (v, i) => fill(LAYER_WRITE_SOURCE, { "i": i })).join("\n") });

// cells of the shadow grid: what gets to each from the sky and the moon (marched, 4 places over
// 8 m); n layers a draw
Fog.shadeFragment = (n) => gridFragment(n, "", SHADE_FRAGMENT_SOURCE);

// cells of the shadow grid: what gets to each from each region of strike slot uSlot's emitter
// (towards the region's nearest point, 4 places); n layers a draw
Fog.strikeShadeFragment = (glsl, n) => gridFragment(n, fill(STRIKE_SHADE_FRAGMENT_SOURCE, { "glsl.lightning": glsl.lightning, "glsl.emitter": glsl.emitter }), "groups(p)");

// cells of the base mist's shade grid: what gets to each from the sky and the moon through the static base density (marched exactly: 4 places over 8 m); n layers a draw
Fog.baseShadeFragment = (n) => gridFragment(n, fill(BASE_SHADE_HEAD_SOURCE, { BASE_HB: BaseMist.HB.toFixed(1), MEAN8: StaticMist.windowMean(8, 0).toFixed(6), MEAN9: StaticMist.windowMean(9, 0).toFixed(6), MEAN10: StaticMist.windowMean(10, 0).toFixed(6) }), "baseShadeCell(p)");

// (the tests only) skyShade of a point, the one read of the combined shade, out through a pixel
Fog.shadeReadFragment = () => fill(SHADE_READ_SOURCE, { "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": Fog.SHADE_GLSL });

// a slice of both of the fog's volumes: each column's sums so far (from the slice before) on to
// this slice's far end
Fog.volumeFragment = (test) => fill(VOLUME_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": Fog.SHADE_GLSL, "Fog.TEST_GLSL": Fog.TEST_GLSL, "Fog.GATHER_GLSL": Fog.GATHER_GLSL, "SLICE_GLSL": SLICE_GLSL });

// a slice of strike slot uSlot's light (per unit of its light, times STRIKE_SCALE, in its color:
// into its stack of slices): each column's light so far on to this slice's far end, its light
// scattered in the slice (at its middle: by the clouds' albedo and the air's white) times what
// the fog's volume lets through to its start, times what the slice's medium takes away
Fog.strikesFragment = (glsl, test) => fill(STRIKES_FRAGMENT_SOURCE, { "TEST_VIEWS": test ? "#define TEST_VIEWS" : "", "M.Camera.GLSL": M.Camera.GLSL, "Fog.GLSL": Fog.GLSL, "Fog.MEDIUM_GLSL": Fog.MEDIUM_GLSL, "Fog.SHADE_GLSL": Fog.SHADE_GLSL, "Fog.TEST_GLSL": Fog.TEST_GLSL, "glsl.lightning": glsl.lightning, "glsl.emitter": glsl.emitter, "glsl.scatter": glsl.scatter, "SLICE_GLSL": SLICE_GLSL });

// a slice of both volumes copied into the columns' sums (uOffset: the first layer of its stack)
Fog.COPY_FRAGMENT = COPY_FRAGMENT_SOURCE;

// (the tests' views only) the fog's light and what it lets through along o + t d from t0 to
// t1, marched along the ray itself, every shadow marched: 96 segments, further apart further
// away, one place in each at jitter (after SHADE_GLSL); the sky's and the moon's light only
// (the strikes' is compared marched in the volume itself: Rain3D.marched), so the water's
// program has the strikes' light in one place
Fog.MARCH_GLSL = fill(MARCH_SOURCE, { "M.HASH_GLSL": M.HASH_GLSL });

Fog.STAGES = STAGES;
M.Fog = Fog;
