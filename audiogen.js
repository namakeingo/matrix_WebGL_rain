// Synthetic Wallpaper Engine audio arrays: 128 values (64 bins left, 64 right, low to
// high frequencies), as wallpaperRegisterAudioListener gives them. Used by the tests
// (.tests/matrix_web_rain, where remote.sh sync copies it) and by Debug mode's
// simulated music (index.js, debugMusicSource).
// Deterministic, with its own random numbers (never Math.random, which the
// wallpaper's test runs seed). Levels are modelled on typical spectra: bass
// strongest, values mostly 0-1.
//   silent: all 0
//   soft:   quiet, smooth, slowly swelling (ambient / piano)
//   pop:    118 bpm kick and snare, louder choruses, an accent hit now and then
//   metal:  loud distorted guitars everywhere plus a fast double kick
//   dubstep: 140 bpm half-time beat with a loud wobbling bass
//   steady: constantly loud;
//   pulses: quiet and very loud, alternating
//   slowbeat, fastbeat: the same loud kick on every beat, at 70 or 170 bpm
//     (these kicks fade over 0.15 s, longer than a frame, so every beat's sampled
//     peak is about as high, wherever between two frames it falls)
//   verse, chorus: the same kick at 120 bpm over quieter or louder music
//   darkmusic, brightmusic: the same loudness and kick, sound low or spread high
//   tone100loud: a loud constant single tone of 100 Hz: one low bin (the second), a
//     little in the bins beside it, the same in both channels, without noise
//   tone100quiet: the same tone, 12 times quieter
function AudioGen(kind, seed) {
  var s = seed || 7;
  function rnd() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  }
  function bass(f) {
    return Math.exp(-f / 12);
  }
  function tilt(f) {
    return 1 - (0.7 * f) / 64;
  }
  // the array for the time t in seconds (into out, when given)
  return function (t, out) {
    out = out || new Array(128);
    for (var f = 0; f < 64; f++) {
      var v = 0;
      var n = 1 + 0.25 * (rnd() * 2 - 1);
      if (kind == "soft") {
        var swell = 1 + 0.3 * Math.sin((2 * Math.PI * t) / 6);
        v = 0.045 * swell * (0.5 + 1.5 * bass(f)) * tilt(f) * n;
      } else if (kind == "pop") {
        var beat = 60 / 118;
        var chorus = t % 25 > 15;
        var level = chorus ? 0.12 : 0.085;
        var ph = t % beat;
        var kick = Math.exp(-ph / 0.07);
        var snare = Math.exp(-((t + beat / 2) % beat) / 0.06);
        // an accent (crash and kick) at the start of every 8th bar of a chorus
        var bar = beat * 4;
        var accent =
          chorus && Math.floor(t / bar) % 4 == 0 ?
            Math.exp(-(t % bar) / 0.12)
          : 0;
        v =
          (level * (0.5 + 1.5 * bass(f)) * tilt(f) +
            0.3 * kick * bass(f) +
            0.1 * snare * (1 - bass(f)) * tilt(f) +
            0.45 * accent * tilt(f)) *
          n;
      } else if (kind == "metal") {
        var kickPh = t % 0.083;
        v =
          (0.34 * (0.6 + 0.8 * bass(f)) * (1 - (0.4 * f) / 64) +
            0.3 * Math.exp(-kickPh / 0.03) * bass(f)) *
          n;
      } else if (kind == "tone100loud" || kind == "tone100quiet") {
        v =
          (f == 1 ? 0.3
          : f == 0 || f == 2 ? 0.08
          : 0) / (kind == "tone100quiet" ? 12 : 1);
        n = 1;
      } else if (kind == "steady") {
        // constantly loud, with only small changes
        v = 0.5 * (0.6 + 0.8 * bass(f)) * tilt(f) * n;
      } else if (kind == "pulses") {
        // quiet, then very loud, alternating twice a second
        var on = t % 0.5 < 0.2;
        v = (on ? 0.55 : 0.06) * (0.6 + 0.8 * bass(f)) * tilt(f) * n;
      } else if (kind == "slowbeat" || kind == "fastbeat") {
        // the same quiet music with the same loud kick (bass) on every beat, at 70 or
        // 170 beats a minute: only the tempo differs
        var period = 60 / (kind == "slowbeat" ? 70 : 170);
        var hit = Math.exp(-(t % period) / 0.15);
        v = (0.06 * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * hit * bass(f)) * n;
      } else if (kind == "verse" || kind == "chorus") {
        // the same kick at 120 beats a minute, over a quieter verse or a louder chorus
        var hit2 = Math.exp(-(t % 0.5) / 0.15);
        var under = kind == "verse" ? 0.04 : 0.13;
        v =
          (under * (0.5 + 1.5 * bass(f)) * tilt(f) + 1.4 * hit2 * bass(f)) * n;
      } else if (kind == "darkmusic" || kind == "brightmusic") {
        // the same loudness and the same kick at 120 beats a minute, with the music's
        // sound low (dark) or spread to the high frequencies (bright)
        var shape = kind == "darkmusic" ? Math.exp(-f / 5) : 0.25 + f / 64;
        var hit3 = Math.exp(-(t % 0.5) / 0.15);
        v =
          ((0.09 * shape) / (kind == "darkmusic" ? 0.078 : 0.742) +
            1.4 * hit3 * bass(f)) *
          n;
      } else if (kind == "dubstep") {
        var half = (60 / 140) * 2;
        var wobble = 0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t);
        var kick2 = Math.exp(-(t % half) / 0.08);
        var snare2 = Math.exp(-((t + half / 2) % half) / 0.07);
        v =
          (0.14 * (0.5 + 1.2 * bass(f)) * tilt(f) +
            0.55 * wobble * bass(f) +
            0.45 * kick2 * bass(f) +
            0.35 * snare2 * tilt(f)) *
          n;
      }
      out[f] = v;
      out[f + 64] = v * (0.95 + 0.1 * rnd());
    }
    return out;
  };
}
