// Read user parameters and sound
window.onload = function () {
  window.wallpaperRegisterAudioListener(wallpaperAudioListener);
};

window.wallpaperPropertyListener = {
  // stop drawing while Wallpaper Engine has paused the wallpaper
  setPaused: function (paused) {
    isPaused = paused;
    if (!paused) {
      LastWaveTime = Date.now();
    }
    startTimer();
  },

  // the FPS limit from Wallpaper Engine's own settings
  applyGeneralProperties: function (properties) {
    if (properties.fps) {
      WallpaperEngineFPS = properties.fps;
      startTimer();
    }
  },

  applyUserProperties: function (properties) {
    if (properties.p612_setting_OledPixelShift) {
      OLEDPixelShift = properties.p612_setting_OledPixelShift.value;
      // bring the current shift back into the new range
      RainShiftX = clamp(-OLEDPixelShift, OLEDPixelShift, RainShiftX);
      ClockShiftX = clamp(-OLEDPixelShift, OLEDPixelShift, ClockShiftX);
      ClockShiftY = clamp(-OLEDPixelShift, OLEDPixelShift, ClockShiftY);
      MessageShiftX = clamp(-OLEDPixelShift, OLEDPixelShift, MessageShiftX);
      MessageShiftY = clamp(-OLEDPixelShift, OLEDPixelShift, MessageShiftY);
    }

    if (properties.p113_setting_ColorWave) {
      useDynamicColorwave = properties.p113_setting_ColorWave.value;
    }

    if (properties.p114_setting_WaveSpeed) {
      WaveSpeed = properties.p114_setting_WaveSpeed.value / 100.0;
    }

    if (properties.p115_setting_WaveWidth) {
      WaveWidth = properties.p115_setting_WaveWidth.value / 100.0;
    }

    if (properties.p201_setting_CollisionPlane && !properties.p201_setting_CollisionPlane.value) {
      stopRipples();
    }
    if (properties.p201_setting_CollisionPlane) {
      useCollisionPlane = properties.p201_setting_CollisionPlane.value;
    }

    if (properties.p202_setting_ReflectionPlane) {
      useReflectionPlane = properties.p202_setting_ReflectionPlane.value;
      ReflectionStale = true;
    }

    if (properties.p203_setting_PlaneHeight) {
      PlaneTop = 1 - properties.p203_setting_PlaneHeight.value / 100.0;
    }

    if (properties.p204_setting_PlaneTone) {
      var tone = properties.p204_setting_PlaneTone.value.split(" ");
      PlaneTone = [parseFloat(tone[0]), parseFloat(tone[1]), parseFloat(tone[2])];
    }

    if (properties.p205_setting_SplashHeight) {
      SplashHeight = properties.p205_setting_SplashHeight.value / 100.0;
    }

    if (properties.p206_setting_ReflectionStrength) {
      ReflectionStrength = properties.p206_setting_ReflectionStrength.value / 100.0;
    }

    if (properties.p207_setting_Ripples) {
      useRipples = properties.p207_setting_Ripples.value;
      if (!useRipples) {
        stopRipples();
      }
    }
    if (properties.p208_setting_RippleIntensity) {
      RippleIntensity = properties.p208_setting_RippleIntensity.value / 100.0;
    }

    if (properties.p209_setting_RippleDarkening) {
      RippleDarkening = properties.p209_setting_RippleDarkening.value / 100.0;
    }

    if (properties.p210_setting_RippleLightening) {
      RippleLightening = properties.p210_setting_RippleLightening.value / 100.0;
    }

    if (properties.p211_setting_RippleSpeed) {
      RippleSpeed = properties.p211_setting_RippleSpeed.value / 100.0;
    }

    if (properties.p212_setting_RippleDuration) {
      RippleLife = properties.p212_setting_RippleDuration.value;
    }

    if (properties.p116_setting_HighContrastText) {
      useHighContrastText = properties.p116_setting_HighContrastText.value;
    }

    if (properties.p301_setting_ReactToMusic) {
      useMusic = properties.p301_setting_ReactToMusic.value;
    }

    if (properties.p312_setting_MusicIdleAnimation) {
      useMusicTimeout = properties.p312_setting_MusicIdleAnimation.value;
    }

    if (properties.p313_setting_MusicIdleTimeout) {
      MusicTimeoutTime = properties.p313_setting_MusicIdleTimeout.value;
    }

    if (properties.p104_setting_RainDensity) {
      RainDensity = properties.p104_setting_RainDensity.value;
      resizeDrops();
    }

    if (properties.p106_setting_HeadBrightness) {
      HeadBrightness = properties.p106_setting_HeadBrightness.value / 100.0;
    }
    if (properties.p107_setting_Bloom) {
      Bloom = properties.p107_setting_Bloom.value / 100.0;
      BloomStale = true;
    }
    if (properties.p213_setting_DistanceFog) {
      useFog = properties.p213_setting_DistanceFog.value;
    }
    if (properties.p214_setting_FogColorMain) {
      FogColor1 = settingColor(properties.p214_setting_FogColorMain.value);
    }
    if (properties.p215_setting_FogColorSecondary) {
      FogColor2 = settingColor(properties.p215_setting_FogColorSecondary.value);
    }
    if (properties.p216_setting_FogIntensity) {
      FogIntensity = properties.p216_setting_FogIntensity.value / 100.0;
    }
    if (properties.p217_setting_FogLayerBlurring) {
      // 100%: a layer that fully covers something blurs it by FogBlurLayerFull
      FogBlurLayer = (properties.p217_setting_FogLayerBlurring.value / 100.0) * FogBlurLayerFull;
    }
    if (properties.p218_setting_FogLayers) {
      FogLayerCount = Math.max(1, Math.min(25, Math.round(properties.p218_setting_FogLayers.value)));
    }
    if (properties.p219_setting_FogMovement) {
      // 100% moves twice as fast as the clouds' own speed (see glFog)
      FogMovement = (properties.p219_setting_FogMovement.value / 100.0) * 2;
    }

    if (properties.p103_setting_FontSizeMax) {
      font_size = properties.p103_setting_FontSizeMax.value;
      Update_GlyphAtlas();
      fontsize_changed = true;
    }

    if (properties.p102_setting_FontSizeMin) {
      FontSizeMin = properties.p102_setting_FontSizeMin.value;
      fontsize_changed = true;
    }

    if (properties.p117_setting_TrailLength) {
      tailLength = 1.0 / properties.p117_setting_TrailLength.value;
    }

    if (properties.p118_setting_Speed) {
      speed = 100 - properties.p118_setting_Speed.value;
      startTimer();
    }

    if (properties.p613_setting_FrameCap) {
      FrameCap = properties.p613_setting_FrameCap.value;
      startTimer();
    }

    // Debug mode: readouts and switches for testing, each working only while it is on
    if (properties.p615_setting_DebugMode) {
      if (!properties.p615_setting_DebugMode.value) {
        debugMusicStop();
      }
      useDebug = properties.p615_setting_DebugMode.value;
      LastWaveTime = Date.now();
    }
    if (properties.p616_setting_DebugMusicReadout) {
      DebugMusicReadout = properties.p616_setting_DebugMusicReadout.value;
    }
    if (properties.p617_setting_DebugMusicSource) {
      debugMusicStop();
      DebugMusicSource = properties.p617_setting_DebugMusicSource.value;
      DebugMusicStart = Date.now();
      DebugMusicMade = 0;
      DebugMusicGen = null;
    }
    if (properties.p618_setting_DebugStrikeNow) {
      // a strike on every change of the toggle, not when the wallpaper loads
      var strikeNow = properties.p618_setting_DebugStrikeNow.value;
      if (DebugStrikeNow !== null && strikeNow != DebugStrikeNow) {
        DebugStrikePending = true;
      }
      DebugStrikeNow = strikeNow;
    }
    if (properties.p619_setting_DebugStrikeDistance) {
      DebugStrikeNearness = properties.p619_setting_DebugStrikeDistance.value / 100.0;
    }
    if (properties.p620_setting_DebugPerformance) {
      DebugPerformance = properties.p620_setting_DebugPerformance.value;
    }
    if (properties.p621_setting_DebugNearness) {
      DebugNearness = properties.p621_setting_DebugNearness.value;
    }
    if (properties.p622_setting_DebugNoFlash) {
      DebugNoFlash = properties.p622_setting_DebugNoFlash.value;
    }
    if (properties.p623_setting_DebugNoSplashes) {
      DebugNoSplashes = properties.p623_setting_DebugNoSplashes.value;
    }
    if (properties.p624_setting_DebugFreeze) {
      DebugFreeze = properties.p624_setting_DebugFreeze.value;
      // after a freeze, the waves and ripples go on from now
      LastWaveTime = Date.now();
    }
    if (properties.p625_setting_DebugOledReadout) {
      DebugOledReadout = properties.p625_setting_DebugOledReadout.value;
    }
    if (properties.p626_setting_DebugSteadyStart) {
      DebugSteadyStart = properties.p626_setting_DebugSteadyStart.value;
      // the drops start again, so it shows
      fontsize_changed = true;
    }
    debugShowPanel();

    if (properties.p119_setting_Lightning) {
      useLightning = properties.p119_setting_Lightning.value;
      // the first strike comes after a random wait, like every other one
      Strikes.length = 0;
      scheduleLightning();
    }
    if (properties.p120_setting_LightningPlayTimeMin) {
      LightningPlayTimeMin = properties.p120_setting_LightningPlayTimeMin.value;
    }
    if (properties.p121_setting_LightningPlayTimeMax) {
      LightningPlayTimeMax = properties.p121_setting_LightningPlayTimeMax.value;
    }
    if (properties.p122_setting_LightningBrightness) {
      LightningBrightness = properties.p122_setting_LightningBrightness.value / 100.0;
    }
    if (properties.p123_setting_LightningFlashIntensity) {
      LightningFlashWhite = properties.p123_setting_LightningFlashIntensity.value / 100.0;
    }
    if (properties.p124_setting_LightningFrequency) {
      LightningMeanWait = properties.p124_setting_LightningFrequency.value;
      scheduleLightning();
    }
    if (properties.p125_setting_CharactersBolt) {
      useCharacterBolt = properties.p125_setting_CharactersBolt.value;
    }

    if (properties.p305_setting_MusicSensitivityLightning) {
      LightningMusicSensitivity = properties.p305_setting_MusicSensitivityLightning.value / 100.0;
    }
    if (properties.p310_setting_MusicTimbreLightning) {
      LightningMusicBrightness = properties.p310_setting_MusicTimbreLightning.value / 100.0;
    }
    if (properties.p311_setting_MusicTrendLightning) {
      LightningMusicEnergy = properties.p311_setting_MusicTrendLightning.value / 100.0;
    }
    if (properties.p309_setting_MusicTempoLightning) {
      LightningMusicTempo = properties.p309_setting_MusicTempoLightning.value / 100.0;
    }
    if (properties.p307_setting_MusicStrengthLightning) {
      LightningMusicLoud = properties.p307_setting_MusicStrengthLightning.value / 100.0;
    }
    if (properties.p308_setting_MusicSuddennessLightning) {
      LightningMusicSudden = properties.p308_setting_MusicSuddennessLightning.value / 100.0;
    }
    if (properties.p302_setting_MusicSensitivity) {
      AudioMultiplier = properties.p302_setting_MusicSensitivity.value / 10.0;
    }

    if (properties.p303_setting_MusicRainResponsiveness) {
      MusicRainResponsiveness = properties.p303_setting_MusicRainResponsiveness.value;
    }

    if (properties.p108_setting_CustomColors) {
      useCustomColors = properties.p108_setting_CustomColors.value;
    }

    if (properties.p405_setting_ClockRelativePosition) {
      use_ClockSnap = properties.p405_setting_ClockRelativePosition.value;
    }

    if (properties.p406_setting_ClockRelativePositionX) {
      ClockPercentagePosX = properties.p406_setting_ClockRelativePositionX.value;
    }

    if (properties.p407_setting_ClockRelativePositionY) {
      ClockPercentagePosY = properties.p407_setting_ClockRelativePositionY.value;
    }

    if (properties.p506_setting_MessageRelativePosition) {
      use_MessageSnap = properties.p506_setting_MessageRelativePosition.value;
    }

    if (properties.p507_setting_MessageRelativePositionX) {
      MessagePercentagePosX = properties.p507_setting_MessageRelativePositionX.value;
    }

    if (properties.p508_setting_MessageRelativePositionY) {
      MessagePercentagePosY = properties.p508_setting_MessageRelativePositionY.value;
    }

    if (properties.p101_setting_Symbols) {
      if (properties.p101_setting_Symbols.value != "") {
        characters = properties.p101_setting_Symbols.value;
        Update_GlyphAtlas();
      }
    }

    if (properties.p502_setting_MessageText) {
      if (properties.p502_setting_MessageText.value != "") {
        Messagetext = properties.p502_setting_MessageText.value;
      }
    }

    if (properties.p401_setting_ShowClock) {
      Clockbool = properties.p401_setting_ShowClock.value;
    }

    if (properties.p410_setting_Clock12h) {
      Clock12h = properties.p410_setting_Clock12h.value;
    }

    if (properties.p403_setting_ClockSize) {
      Clocksize = properties.p403_setting_ClockSize.value;
    }

    if (properties.p408_setting_ClockPositionX) {
      ClockPosX = properties.p408_setting_ClockPositionX.value;
    }

    if (properties.p409_setting_ClockPositionY) {
      ClockPosY = properties.p409_setting_ClockPositionY.value;
    }

    if (properties.p501_setting_ShowMessage) {
      use_Message = properties.p501_setting_ShowMessage.value;
    }

    if (properties.p504_setting_MessageSize) {
      Messagesize = properties.p504_setting_MessageSize.value;
    }

    if (properties.p402_setting_ClockRelativeSize) {
      ClockRelativeSize = properties.p402_setting_ClockRelativeSize.value;
    }
    if (properties.p404_setting_ClockRelativeSizePercent) {
      ClockWidthPercent = properties.p404_setting_ClockRelativeSizePercent.value;
    }
    if (properties.p503_setting_MessageRelativeSize) {
      MessageRelativeSize = properties.p503_setting_MessageRelativeSize.value;
    }
    if (properties.p505_setting_MessageRelativeSizePercent) {
      MessageWidthPercent = properties.p505_setting_MessageRelativeSizePercent.value;
    }

    if (properties.p509_setting_MessagePositionX) {
      MessageposX = properties.p509_setting_MessagePositionX.value;
    }

    if (properties.p510_setting_MessagePositionY) {
      MessageposY = properties.p510_setting_MessagePositionY.value;
    }

    if (properties.p109_setting_Color1) {
      var Farbewert1 = properties.p109_setting_Color1.value.split(" ");
      ColorValue1 = [
        parseFloat(Farbewert1[0]) * 255,
        parseFloat(Farbewert1[1]) * 255,
        parseFloat(Farbewert1[2]) * 255,
      ];
    }
    if (properties.p110_setting_Color2) {
      var Farbewert2 = properties.p110_setting_Color2.value.split(" ");
      ColorValue2 = [
        parseFloat(Farbewert2[0]) * 255,
        parseFloat(Farbewert2[1]) * 255,
        parseFloat(Farbewert2[2]) * 255,
      ];
    }
    if (properties.p111_setting_Color3) {
      var Farbewert3 = properties.p111_setting_Color3.value.split(" ");
      ColorValue3 = [
        parseFloat(Farbewert3[0]) * 255,
        parseFloat(Farbewert3[1]) * 255,
        parseFloat(Farbewert3[2]) * 255,
      ];
    }
    if (properties.p112_setting_Color4) {
      var Farbewert4 = properties.p112_setting_Color4.value.split(" ");
      ColorValue4 = [
        parseFloat(Farbewert4[0]) * 255,
        parseFloat(Farbewert4[1]) * 255,
        parseFloat(Farbewert4[2]) * 255,
      ];
    }
  },
};

var c = document.getElementById("c");
// the canvas is always fully painted black first, so it can be opaque;
// this saves blending it with the page on every frame
var ctx = c.getContext("2d", { alpha: false });

// size of the screen in pixels
var ScreenWidth = window.innerWidth;
var ScreenHeight = window.innerHeight;

// the rain is drawn with WebGL when possible, see the "WebGL renderer" section;
// the 2D canvas is used when WebGL is not available or "Prevent memory leak" is off
var gl = null;
var glCanvas = null;
var useGL = false;
// WebGL programs, buffers and textures
var GL = {};
// the WebGL context: no alpha, depth or stencil (the picture is made in textures)
var GLOptions = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
};

initGL();

var useCustomColors = false;
var useDynamicColorwave = true;
var useMusic = false;
var useMusicTimeout = true;
var MusicTimeoutTime = 15;
var LastSoundTime = Date.now();
var isSilent = false;
var MusicTimeout = true;
// number of drops falling at once, per column of Font size Max (more for smaller sizes)
var RainDensity = 2;
// range of the random opacity of each drop (0 to 1)
// Distance fog: layers of cloudy fog in two colors (0-1 each) between the back and
// the front, see fogLayers; FogIntensity is the opacity of the nearest layer, each
// layer further back has 1% more. See glFog and the present shader
var useFog = true;
var FogColor1 = [80 / 255, 48 / 255, 128 / 255];
var FogColor2 = [73 / 255, 128 / 255, 88 / 255];
var FogIntensity = 0.5;
// how many layers of fog there are (Fog layers), see fogLayers
var FogLayerCount = 10;
// how fast the fog slides and swirls (2 at Fog movement 100%), and the time of its
// movement in seconds at speed 1, so a changed speed goes on smoothly
var FogMovement = 2;
// every fog layer blurs what is behind it: by this much (a Gaussian radius, as a
// part of the screen height) where it fully covers it, and less where it is
// thinner, by its cover (its density times its opacity, so with Fog intensity).
// The blurs of the layers in front of something add up like blurs do (their
// squares add), so things further back are more blurred. 0: no blur. The picture is
// blurred into three copies with these radii (parts of the screen height), between
// which each pixel takes its own radius (see glFogBlur). Fog blurring sets
// FogBlurLayer: 100% is FogBlurLayerFull
var FogBlurLayerFull = 0.0025;
var FogBlurLayer = FogBlurLayerFull;
var FogBlurCopies = [0.0015, 0.004, 0.01];
var FogTime = 0;
var LastFogTime = Date.now();

// where the fog layers are (nearness, 0 at the back, 1 at the front): the first
// (nearest) one 0.05 font sizes behind the largest drops, then evenly spaced, the
// last one a step in front of the smallest drops; each layer covers what is behind
// it. In font sizes: the first at Font size Max - 0.05, the last at Font size Min +
// ((Font size Max - 0.05) - Font size Min) / Fog layers
function fogLayers() {
  var minSize = fontSizeMin();
  var range = font_size - minSize;
  var count = FogLayerCount;
  if (range < 1) {
    // one size only: the distance is all random
    return { first: 0.95, step: 0.95 / count, count: count };
  }
  // a distance in font sizes as a nearness: Font size Max is 1 (the bottom of the
  // screen), each font size less is 1 / (range + 1) less, see newDropLook
  function nearness(distance) {
    return (distance - minSize + 1) / (range + 1);
  }
  var first = font_size - 0.05;
  var last = minSize + (first - minSize) / count;
  var step = count > 1 ? (nearness(first) - nearness(last)) / (count - 1) : 0;
  return { first: nearness(first), step: step, count: count };
}

// a color setting ("r g b", 0-1 each) as [r, g, b]
function settingColor(value) {
  var parts = value.split(" ");
  return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
}

var ColorValue1;
var ColorValue2;
var ColorValue3;
var ColorValue4;

var AudioMultiplier = 1;
// Music rain responsiveness (1 to 20): the drops the music brings when it gets louder
// start this many times closer to the top of the screen (see spawnRow)
var MusicRainResponsiveness = 1;
var tailLength = 0.05;

var speed = 33;
// milliseconds per rain step at the default Speed (70), for the splash height
var DefaultStepMs = 30;
// fading of the current frame, see draw
var FrameFade = tailLength;
// lit pixels of the clock or message in the current frame, see drawString and isLit
var LitRects = [];
var LitRectCount = 0;

// frame cap from the settings, and the FPS from Wallpaper Engine's own settings (0 = not known)
var FrameCap = 120;
var WallpaperEngineFPS = 0;
var isPaused = false;
// time of rain steps not drawn yet, and time of the last frame
var StepTime = 0;
var LastFrameTime = Date.now();

var Color;
// progress of the color wave in cycles (0 to 1, wraps around)
var WavePhase = 0;
var LastWaveTime = Date.now();
// screen widths the wave moves per second
var WaveSpeed = 0.15;
// screen widths of one full color cycle
var WaveWidth = 1;
// when false, the clock or message is recolored to match the color wave
var useHighContrastText = true;
// color of each column in the current frame, also split into red, green and blue
var ColumnColors = [];
var ColumnRed = [];
var ColumnGreen = [];
var ColumnBlue = [];

var FrequencyArray;
// how many audio arrays have come, and how many of them the lightning has followed
var AudioArrays = 0;
var AudioArraysSeen = 0;

var Clockbool = false;
var Clocksize = 2;
var ClockPosX = 50;
var ClockPosY = 5;
var Clock12h = false;
// the area of the clock drawn in this frame (left, top, right, bottom), see drawString
var ClockPosition = [0, 0, 0, 0];
var use_ClockSnap = false;
// centre of the clock in percent of the screen, used when use_ClockSnap is on
var ClockPercentagePosX = 50;
var ClockPercentagePosY = 50;
// Relative clock size: its width as a percentage of the screen width, instead of
// Clock size
var ClockRelativeSize = false;
var ClockWidthPercent = 30;

// pixel size of one cell of the clock and message (their position and size are in
// these cells); fixed, so they do not change with the font size of the rain
var TextUnit = 10;

var use_Message = false;
var Messagetext = "MATRIX";
var Messagesize = 2;
var MessageposX = 0;
var MessageposY = 0;
// the area of the message drawn in this frame (left, top, right, bottom)
var MessagePosition = [0, 0, 0, 0];
var use_MessageSnap = false;
// centre of the message in percent of the screen, used when use_MessageSnap is on
var MessagePercentagePosX = 50;
var MessagePercentagePosY = 50;
// Relative message size: its width as a percentage of the screen width, instead
// of Message size
var MessageRelativeSize = false;
var MessageWidthPercent = 30;

// the clock and the message drawn in this frame: where their lit pixels are in
// LitRects (start, count); the first one shown is text 0, the second text 1 (for
// the present shader)
var TextBlocks = [];

// set when the font size or the screen size changes, so the rain starts again
var fontsize_changed = true;

//making the canvas full screen
function resizeCanvas() {
  ScreenWidth = window.innerWidth;
  ScreenHeight = window.innerHeight;
  applyCanvasSizes();
}
resizeCanvas();

// follow changes of the screen size (e.g. picture-by-picture or rotation);
// wait until the resizing has finished before starting the rain again
var ResizeTimeout;
window.addEventListener("resize", function () {
  clearTimeout(ResizeTimeout);
  ResizeTimeout = setTimeout(function () {
    if (
      ScreenWidth == window.innerWidth &&
      ScreenHeight == window.innerHeight
    ) {
      return;
    }
    resizeCanvas();
    fontsize_changed = true;
  }, 200);
});

// default hexadecimal characters
var characters = "0123456789ABCDEF";

// Font size Max: the largest drops, the width of the columns and the size the
// characters are drawn at; Font size Min: the smallest drops
var font_size = 20;
var FontSizeMin = 6;
var columns = ScreenWidth / font_size; //number of color columns of the rain
// color columns are Font size Max wide; each has the color of the rain there
var ColumnCount = Math.ceil(columns);
// with React to music, the music's chance per column (see rainTarget; -1: no music,
// or the idle animation)
var ColumnChance = [];
// the drops, each on its own: left edge (before the pixel shift), row (counted in
// its own font size), font size and opacity. A drop sits on a grid of its own size,
// so small (far) drops are closer together, like more rain fitting in the distance
var RainCount = 0;
var RainX = [];
var RainRow = [];
var RainSize = [];
// how near each drop is (0 at the back, 1 at the front), see newDropLook
var RainNear = [];
// the character at the head of each drop (drawn brighter), or -1
var RainGlyph = [];
// 1 for a drop that finishes its fall and then ends (the rain got lighter, see
// balanceDrops), and how many there are; they do not count for RainTarget
var RainDrain = [];
var RainDraining = 0;
// the drops waiting above the screen to come in, only counted (see waitToComeIn)
var SpawnWheel = new Int32Array(0);
var SpawnAt = 0;
var RainPending = 0;
// Head brightness: how much the head of the nearest drops is brightened, as a part
// of the distance of its color from white (each channel moves that part of the
// way to full). Below 1, a head never becomes pure white unless its color is
// already white. Further back it gets less, see headBrightness
var HeadBrightness = 0.75;
// Bloom: a glow around the rain, in layers of blur. New characters are added to a
// glow layer (half the screen size) in the rain color, less further back with the
// same curve as the head brightness (see nearnessCurve); it fades like the rain.
// The glow is that layer blurred BloomLayers times, each layer at half the size
// of the one before, so it is blurred twice as far. At the lowest setting only
// the first layer shows: a soft glow that closely follows the letters; higher
// settings add the wider layers one after another, so the glow is stronger and
// reaches further from the letters
var Bloom = 0.3;
var BloomLayers = 4;
// how much each layer adds
var BloomLayerGain = 1.25;
// the glow layer is cleared before it is used again
var BloomStale = true;

// how much layer n (from 0) of the glow shows at the current setting
function bloomLayerWeight(n) {
  if (!(Bloom > 0)) {
    return 0;
  }
  if (n == 0) {
    return 1;
  }
  // the other layers come in one after another over the slider
  var extra = Bloom * (BloomLayers - 1);
  return Math.max(0, Math.min(1, extra - (n - 1)));
}
resetDrops();

// OLED pixel shift: maximum distance in pixels from the original position
var OLEDPixelShift = 0;
// current shift of the rain columns (left/right), and of the clock and the message
// (each moving on its own)
var RainShiftX = 0;
var ClockShiftX = 0;
var ClockShiftY = 0;
var MessageShiftX = 0;
var MessageShiftY = 0;

// all characters drawn white on black, see Update_GlyphAtlas
var GlyphAtlas = document.createElement("canvas");
var GlyphAtlasColumns = 1;
var GlyphCount = 0;
// true for characters that draw nothing (e.g. spaces)
var GlyphBlank = [];
// characters in white on transparent with room around them (for the splashes and
// reflections)
var TextAtlas = document.createElement("canvas");
var TextAtlasPad = 0;
var TextAtlasCell = 1;
var TextAtlasDirty = true;
// TextAtlas upside down and blurred, for the reflection plane
var TextAtlasFlipped = document.createElement("canvas");
var TextAtlasBlurred = document.createElement("canvas");
Update_GlyphAtlas();

// drops waiting to be drawn in the current frame, see queueDrop and flushDrops
var QueueCount = 0;
var QueueX = [];
var QueueY = [];
var QueueOpacity = [];
var QueueGlyph = [];
var QueueColumn = [];
var QueueSize = [];
// how much each queued character is mixed towards white (0 = rain color)
var QueueHead = [];
// how much each queued character glows (0 = not at all)
var QueueBloom = [];
// how near each queued character is, for the fog (1: none, e.g. the clock)
var QueueNear = [];
// for sortQueueBySize
var SortCounts = [];
var SortX = [];
var SortY = [];
var SortSize = [];
var SortOpacity = [];
var SortGlyph = [];
var SortColumn = [];
var SortHead = [];
var SortBloom = [];
var SortNear = [];

// collision and reflection plane, see the "Collision and reflection plane" section
var useCollisionPlane = true;
var useReflectionPlane = true;
// ripples where drops and splashes touch the plane (needs the collision plane)
var useRipples = true;

// are there ripples? where things hit the plane; with the reflection plane off they show on the
// water's own tone, with no reflection in it (they needed the reflection plane, and turning it off
// took the ripples away)
function ripplesActive() {
  return useRipples && useCollisionPlane;
}

// take away all ripples, so the water is calm when they come back
function stopRipples() {
  Ripples.length = 0;
  ImpulseCount = 0;
  if (useGL && GL.waves) {
    // the water grid starts calm again when it is used
    GL.waveWidth = 0;
  }
}
// far line of the plane, as a part of the screen height
var PlaneTop = 0.8;
// where the nearest drops (distance Font size Max) land, as a part of the plane
// height: the bottom of the screen
var PlaneNearest = 1;
// splash characters: position (centre and baseline), speed and gravity in pixels
// per second, the line where they disappear, size, opacity and character
var MaxParticles = 3000;
var SplashGravity = 40;
// splash height, reflection strength (at the far line) and ripple size, from the settings
var SplashHeight = 1;
// color of the plane (red, green, blue from 0 to 1), so the ripples can be seen
var PlaneTone = [10 / 255, 7 / 255, 16 / 255];
var ReflectionStrength = 0.95;

// Reflection strength past 100%: from 0 at 100% to 1 at 200% the reflections get
// sharper (no blur at 200%) and longer (half the screen at 200%), and fade less
// with the distance (not at all at 200%); their strength stays that of 100%
function reflectionSharpness() {
  return Math.max(0, Math.min(1, ReflectionStrength - 1));
}

// how far reflections reach for something at a nearness
function reflectionReach(nearness) {
  var reach = ScreenHeight * 0.3 * (0.4 + 0.6 * nearness);
  return reach + (ScreenHeight * 0.5 - reach) * reflectionSharpness();
}
var RippleIntensity = 1;
// how much the rings darken (troughs) and lighten (crests) the colors of the
// surface and reflection, 0 to 1: at 1 the strongest parts of a ring become black
// or white; black stays black
var RippleDarkening = 0.2;
var RippleLightening = 0.2;
// how fast the rings spread, compared to the default speed
var RippleSpeed = 1;
var ParticleCount = 0;
var ParticleX = new Float32Array(MaxParticles);
var ParticleY = new Float32Array(MaxParticles);
var ParticleVX = new Float32Array(MaxParticles);
var ParticleVY = new Float32Array(MaxParticles);
var ParticleGravity = new Float32Array(MaxParticles);
var ParticleGround = new Float32Array(MaxParticles);
var ParticleSize = new Float32Array(MaxParticles);
var ParticleOpacity = new Float32Array(MaxParticles);
var ParticleNear = new Float32Array(MaxParticles);
var ParticleGlyph = new Uint16Array(MaxParticles);
// the splash characters in 3D (see splashLook): distance into the plane (0 at the
// front), height above the plane and their speeds, in pixels at the size of the
// front; the scale (font size compared to Font size Max) and nearness of the drop
// that made them; and how much they are brightened like a drop head
var ParticleZ = new Float32Array(MaxParticles);
var ParticleH = new Float32Array(MaxParticles);
var ParticleVZ = new Float32Array(MaxParticles);
var ParticleVH = new Float32Array(MaxParticles);
var ParticleScale0 = new Float32Array(MaxParticles);
var ParticleNear0 = new Float32Array(MaxParticles);
var ParticleHead = new Float32Array(MaxParticles);
// how strongly each splash character glows (see Bloom)
var ParticleBloom = new Float32Array(MaxParticles);
// 1 for a character thrown out of the front of the screen: it may grow past the
// limits of the nearest drops (see splashLook)
var ParticleOut = new Uint8Array(MaxParticles);
// the splash characters drawn in the last frame, so their head brightness can be
// taken away again (see settleSplashHeads): place (centre, baseline), font size,
// character, how much brighter than the rain color they were (red, green, blue,
// 0-1) and opacity
var SettleCount = 0;
var SettleX = new Float32Array(MaxParticles);
var SettleY = new Float32Array(MaxParticles);
var SettleSize = new Float32Array(MaxParticles);
var SettleGlyph = new Uint16Array(MaxParticles);
var SettleRed = new Float32Array(MaxParticles);
var SettleGreen = new Float32Array(MaxParticles);
var SettleBlue = new Float32Array(MaxParticles);
var SettleOpacity = new Float32Array(MaxParticles);
var SettleNear = new Float32Array(MaxParticles);

// every per-character array, for removing characters
var ParticleArrays = [
  ParticleX, ParticleY, ParticleVX, ParticleVY, ParticleGravity, ParticleGround,
  ParticleSize, ParticleOpacity, ParticleNear, ParticleGlyph, ParticleZ, ParticleH,
  ParticleVZ, ParticleVH, ParticleScale0, ParticleNear0, ParticleHead,
  ParticleBloom, ParticleOut,
];
// rings on the reflection: [x, y, time in ms, nearness, strength]; they last
// RippleLife seconds (from the settings)
var MaxRipples = 32;
var RippleLife = 5;
var Ripples = [];
// impacts on the water in this frame, for the water simulation (see glSimulateWaves),
// and the rain time in seconds that the simulation still has to catch up
var MaxImpulses = 4096;
var ImpulseCount = 0;
var ImpulseX = new Float32Array(MaxImpulses);
var ImpulseY = new Float32Array(MaxImpulses);
var ImpulseStrength = new Float32Array(MaxImpulses);
var WaveTime = 0;
// the water time of this frame when it does not follow the rain steps (-1: it
// follows them), see frameSteps
var FrameWaterSeconds = -1;
// the water simulation's steps so far, and the water time they make, in seconds
var WaveSteps = 0;
var WaterTime = 0;
// reflected characters waiting to be drawn in this frame, see reflectCharacter:
// top left and size of the (upside down) character image, character, column for the
// color, opacity, and blur (0 = sharp, 1 = most blurred)
var ReflectCount = 0;
var ReflectX = [];
var ReflectY = [];
var ReflectSize = [];
var ReflectGlyph = [];
var ReflectColumn = [];
var ReflectAlpha = [];
var ReflectBlur = [];
// the reflection layer is cleared before it is used again after being switched off
var ReflectionStale = true;
// is the clock or message recolored in this frame? see recolorText
var RecolorActive = false;

// Lightning: now and then a bolt strikes at a random place and distance. It plays
// over a whole number of frames, the nearest to Lightning playing time (see
// lightningFrames):
// - the first StrikeMeetAt (a quarter) of the time: two leaders grow towards each
//   other, one down from above the screen, one up from the line where drops at its
//   distance land. On the way each forks BoltForksMin to BoltForksMax times, and
//   the branches fork again;
// - at exactly StrikeMeetAt they meet at a random point between them and become
//   the bright main channel, and the flash starts round the channel;
// - the rest of the time: the channel and the flash fade out, fast at first and
//   then slowly (see strikeFade), like the after-image a strong light leaves in the
//   eye. The branches are gone by BranchFadeEnd (half) of the time, so after that
//   only the main channel and the flash are left; the flash closes in on the
//   channel as it fades, so its outer glow goes first.
// The flash is light in layers round the main channel, like the bloom (see
// FlashLayers). The bolt is a glowing jagged line drawn into a texture of its own
// (see glDrawBolt), or, with Characters bolt, rain characters along the same lines
// (see queueCharacterBolt) with only the glow drawn. The present shader puts the
// bolt and the flash at the strike's distance among the fog layers and the rain, so
// the fog in front of a strike covers and blurs it, and mirrors both on the water
var useLightning = false;
// how long a strike plays (ms: a random time between Min and Max for each strike, Max
// when Min is not below it, see lightningPlayTime), the part of the screen its flash
// lights at the front (0-1), the grey of its flash (Lightning flash intensity: 0.7 is
// rgb 0.7, 0.7, 0.7), the average wait between strikes (seconds), and the kind of bolt
var LightningPlayTimeMin = 250;
var LightningPlayTimeMax = 1000;
var LightningBrightness = 0.5;
var LightningFlashWhite = 0.93;
var LightningMeanWait = 60;
var useCharacterBolt = false;
// when the next strike comes (Date.now()), and the strikes playing now, from the
// furthest to the nearest. Up to MaxStrikes play at once; a new one never starts in
// the same frame as another, nor less than StrikeStartGap of the screen's width from
// where another playing one starts
var NextLightning = 0;
var Strikes = [];
var MaxStrikes = 3;
var StrikeStartGap = 0.1;
// with React to music (and not idle, see musicDriven), strikes come with the music
// instead of at random: on each peak of its loudness (the average of the audio
// values) whose score reaches a threshold, at least LightningMusicGap seconds after
// the last one. The score counts how loud the peak is and how sudden, with two
// weights of their own: LightningMusicLoud (Lightning peak loudness weight, 0-1)
// times its loudness, plus LightningMusicSudden (Lightning peak suddenness weight,
// 0-1) times its rise above the loudness of the quiet moments just before
// (MusicFloor); a weight of 0 leaves that part out. So, with more suddenness than
// loudness (the defaults, 0.3 and 0.7), a sound that is loud all the time strikes
// less than quiet and very loud alternating, and quiet music hardly ever strikes.
// The floor drops at once to a quieter frame and rises slowly to a louder one (over
// LightningMusicFloorRise seconds).
// Lightning music sensitivity (0-1) sets the threshold: LightningMusicPeak at
// the most sensitive (1), rising in a straight line to LightningMusicPeakLeast at
// the least sensitive, and no music strikes at all at 0. The loudness of the last
// two frames, and when the last music strike started
var LightningMusicSensitivity = 0.5;
var LightningMusicPeak = 0.2;
var LightningMusicPeakLeast = 1.0;
var LightningMusicLoud = 0.3;
var LightningMusicSudden = 0.7;
var LightningMusicFloorRise = 0.6;
var MusicFloor = 0;
var LastMusicTime = 0;
var LightningMusicGap = 0.15;
var MusicLoudness = [0, 0];
var LastMusicStrike = 0;
// the music's tempo counts too, with Lightning tempo weight (LightningMusicTempo,
// 0-1): a peak's score is multiplied by a factor from LightningTempoSlowest at a
// slow tempo or no clear beat (at LightningTempoSlow beats a minute or less) to
// LightningTempoFastest at a fast one (LightningTempoFast or more), in a straight
// line between; at weight 0 the factor is 1. So slow, quiet music hardly ever
// strikes, and fast, loud music strikes more easily
var LightningMusicTempo = 0.5;
var LightningTempoSlow = 80;
var LightningTempoFast = 160;
var LightningTempoSlowest = 0.25;
var LightningTempoFastest = 1.75;
// the tempo is estimated from the beats: every frame, how much the bass (the
// lowest 8 values of each channel) rose since the frame before goes into
// MusicOnsets (a ring of the last MusicOnsetCount frames, about 10 s at 24 fps);
// every MusicTempoEvery seconds their autocorrelation gives the beat's period,
// between 50 and 200 beats a minute (MusicTempo), and how clear the beat is
// (MusicBeat, 0-1: how much the rises repeat at that period)
var MusicOnsetCount = 256;
var MusicOnsets = new Float32Array(MusicOnsetCount);
var MusicOnsetAt = 0;
var MusicOnsetFilled = 0;
var MusicBass = 0;
var MusicFrameMs = 1000 / 24;
var MusicTempo = 0;
var MusicBeat = 0;
var MusicTempoEvery = 0.5;
var MusicTempoNext = 0;
// the rises, oldest last and blurred over neighbouring frames, while estimating
var MusicOnsetWork = new Float32Array(MusicOnsetCount);
// the song's energy counts too, with Lightning song energy weight
// (LightningMusicEnergy, 0-1): the loudness of the part playing now (MusicPart, an
// average over about LightningEnergyPart seconds) against the song's so far
// (MusicSong, over about LightningEnergySong seconds). A part louder than the song
// (a chorus, a drop) multiplies a peak's score by up to LightningEnergyMost, a
// quieter one (a verse, an intro) by down to LightningEnergyLeast: the factor is
// 1 + LightningEnergySlope times how much louder or quieter, within those; at
// weight 0 it is 1. It only counts after LightningEnergyWarmUp seconds of sound,
// so the start of a song is not judged on too little. Both averages follow only
// while there is sound (a pause between songs does not lower them), and start from
// nothing: each is divided by how much of its span is filled yet (energyAverage),
// so they are right from the first seconds instead of creeping up from 0
var LightningMusicEnergy = 0.5;
var LightningEnergyPart = 3;
var LightningEnergySong = 60;
var LightningEnergySlope = 3;
var LightningEnergyLeast = 0.25;
var LightningEnergyMost = 1.75;
var LightningEnergyWarmUp = 10;
var MusicPart = 0;
var MusicSong = 0;
var MusicHeard = 0;
// the music's brightness counts too, with Lightning music brightness weight
// (LightningMusicBrightness, 0-1): the part of its loudness above the lowest
// quarter of the frequencies (MusicBrightness, an average over about
// LightningBrightnessSpan seconds, so the bass of a single kick does not count as
// the music turning dark). Bright music (distorted guitars, cymbals, synths: at
// LightningBrightnessHigh or more) multiplies a peak's score by up to
// LightningBrightnessMost, dark music (piano, ambient, lo-fi: at
// LightningBrightnessLow or less) by down to LightningBrightnessLeast, in a straight
// line between; at weight 0 the factor is 1
var LightningMusicBrightness = 0.5;
var LightningBrightnessSpan = 2;
var LightningBrightnessLow = 0.25;
var LightningBrightnessHigh = 0.55;
var LightningBrightnessLeast = 0.25;
var LightningBrightnessMost = 1.75;
var MusicBrightness = 0;
// the straight pieces of a bolt: the main channel is the ways down and up, each with
// BoltMainLevels halvings (32 pieces, 64 in all; the flash uses at most
// MaxChannelSegments a strike, the present shader's uChannel holds 3 of them),
// a branch off a leader BoltBranchLevels halvings (8 pieces), a branch off a branch
// one less (4 pieces), and cut where they fork (see boltLineParts). At most
// MaxBoltSegments in all, for all the strikes playing (up to 100 branches a strike)
var MaxBoltSegments = 4096;
var MaxChannelSegments = 64;
var BoltMainLevels = 5;
// how far the middle of each piece of the ways down and up is pushed sideways, as a
// part of their length (less at each finer level, see jaggedLine): so they wind
var BoltRouteRoughness = 0.3;
var BoltBranchLevels = 3;
// how many times each leader (with its branches) forks before they meet (a random
// number, both included), shared among the generations of branches (1: off a leader,
// 2: off one of those, ... up to BoltGenerations) as BoltGenerationForks gives for the
// strike (see boltForkPlan); a fork whose branch would be too small to draw is not
// made, so a strike far back forks less. Every line thins to BoltThinning of its size
// after each fork along it, and a branch starts at that size (see boltLineParts).
// A generation is a look (a size: the 0th F / 2, each next 3/4 of it), not a role: the
// leader (the route, the path destined to reach the meeting point) is one only in the
// code, and its parts can be of any generation; rejoins can make several paths of the
// 0th at once, the leader's or any other (see makeLine in newStrike)
var BoltForksMin = 10;
var BoltForksMax = 50;
var BoltGenerations = 4;
var BoltGenerationForks = [[2, 5], [4, 25], [8, 50], [2, 50]];
var BoltThinning = 0.75;
// only the routes reach the other half of the strike; in its own half a branch that
// meets another line rejoins it, at most BoltRejoinDepth times in a row (see makeLine
// in newStrike). A branch is tried BoltBranchTries times, the later tries turned
// further from its line (up to 80 degrees instead of 50); drawn widths that come
// within BoltClearGap pixels meet
var BoltBranchTries = 24;
var BoltClearGap = 1;
var BoltRejoinDepth = 3;
// where paths meet they really cross, at BoltJoinAngle degrees or more, and meeting
// points are at least BoltJoinGap times the font size (F) apart, so no more than two
// paths ever meet at once (the user, 2026-10-22)
var BoltJoinAngle = 20;
var BoltJoinGap = 3;
// how the leaders' and the branches' glowing lines look (see glDrawBolt): their glow's
// spread (times their size) and brightness, and how far their width changes where
// their size does (times the bigger size); the main channel keeps its own
var BoltGlowSpread = 0.6;
var BoltGlowLight = 0.25;
var BoltTaper = 2;
// the characters bolt's glow (bloom) round the leaders and the branches, a part of
// the rain's (the main channel's is the rain's)
var BoltCharacterBloom = 0.5;
// when the leaders meet, and when the branches are gone (parts of the strike's time)
var StrikeMeetAt = 0.25;
var BranchFadeEnd = 0.5;
// how quickly the fade starts: the higher, the faster at first (see strikeFade)
var StrikeFadeCurve = 40;
// the flicker as a strike fades, as real lightning dims, brightens, dims and brightens
// again: each fade (the main channel's and the flash's, the branches') is times a wave
// of a whole number of periods in it, StrikeFlickerMin to StrikeFlickerMax (random for
// each strike and each of the two, see strikeFlicker); a low wave, between full light
// and StrikeFlickerLow, so the light dims and never goes dark
var StrikeFlickerLow = 0.5;
var StrikeFlickerMin = 3;
var StrikeFlickerMax = 6;
// the flash: layers of light round the main channel, like the bloom. Within its
// band (on each side of the channel, see strikeFlashBand) the light is full;
// outside it four layers fade out, each a Gaussian of the distance from the band:
// the first three this many times the reach of the flash's near-white part (see
// strikeFlashReach) but at least FlashLayersMin of the screen's diagonal (so a strike
// further back still lights a wide part of the sky), the last FlashScreenLayer of
// the diagonal, so a faint glow reaches the edges of the screen (see
// flashLayerWidths). FlashWeights are their parts of the light
// (they add up to 1). At full light the flash adds FlashPeak of Lightning flash
// intensity, like a light shone on the picture, so what is behind it still shows
// through; it counts as near-white where it is at least FlashNearWhite of that
var FlashLayers = [0.3, 0.8, 1.8];
var FlashLayersMin = [0, 0.06, 0.15];
var FlashScreenLayer = 0.7;
var FlashWeights = [0.4, 0.3, 0.18, 0.12];
var FlashPeak = 0.88;
var FlashNearWhite = 0.96;

// the wait before the next strike is random: an exponential distribution with
// Lightning frequency seconds on average, as for things that happen independently at
// random. Short waits are the most likely, so two strikes can come a second apart
function scheduleLightning() {
  if (!useLightning) {
    // nothing to plan (and no random number taken from the rain)
    return;
  }
  NextLightning = Date.now() - Math.log(1 - Math.random()) * LightningMeanWait * 1000;
}

// how long a strike plays (ms): a random time between Lightning playing time Min and
// Max, as strikes are not all alike; Max when Min is not below it
function lightningPlayTime() {
  if (LightningPlayTimeMin >= LightningPlayTimeMax) {
    return LightningPlayTimeMax;
  }
  return LightningPlayTimeMin + (LightningPlayTimeMax - LightningPlayTimeMin) * Math.random();
}

// how many frames a strike plays: the nearest whole number of frames to its playing
// time at the current frame rate (at least 2: one to grow, one to flash)
function lightningFrames(playTime) {
  var frameMs = 1000.0 / FrameRate;
  return Math.max(2, Math.round(playTime / frameMs));
}

// the flicker of a fade at s (0 at its start, 1 at its end), with periods whole
// periods in it: 1 at the start, down to StrikeFlickerLow and up again each period
// (see StrikeFlickerMin)
function strikeFlicker(s, periods) {
  var middle = (1 + StrikeFlickerLow) / 2;
  return middle + (1 - middle) * Math.cos(2 * Math.PI * periods * s);
}

// font size of rain at a nearness (Font size Min at the back, Max at the front)
function fontSizeAt(nearness) {
  var minSize = fontSizeMin();
  return minSize + (font_size - minSize) * Math.max(0, Math.min(1, nearness));
}

// a jagged line from (x0, y0) to (x1, y1): its middle is pushed sideways at random,
// then the middles of the two halves (a little less), and so on, levels times;
// gives the corner points [x, y, x, y, ...]
function jaggedLine(x0, y0, x1, y1, levels, roughness) {
  var points = [x0, y0, x1, y1];
  var amount = roughness * Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  for (var level = 0; level < levels; level++) {
    var next = [points[0], points[1]];
    for (var i = 0; i + 3 < points.length; i += 2) {
      var ax = points[i], ay = points[i + 1], bx = points[i + 2], by = points[i + 3];
      // across the piece, mostly sideways
      var dx = bx - ax, dy = by - ay;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var push = (Math.random() * 2 - 1) * amount;
      next.push((ax + bx) / 2 - (dy / length) * push, (ay + by) / 2 + (dx / length) * push * 0.3);
      next.push(bx, by);
    }
    points = next;
    amount *= 0.55;
  }
  return points;
}

// the length of a jagged line
function lineLength(points) {
  var total = 0;
  for (var i = 0; i + 3 < points.length; i += 2) {
    total += Math.sqrt(Math.pow(points[i + 2] - points[i], 2) + Math.pow(points[i + 3] - points[i + 1], 2));
  }
  return total;
}

// the point at a part (0-1) of a jagged line's length
function pointOnLine(points, part) {
  var cut = partOfLine(points, part);
  return [cut[cut.length - 2], cut[cut.length - 1]];
}

// the start of a jagged line, up to a part (0-1) of its length; gives the corner
// points
function partOfLine(points, part) {
  if (part >= 1) {
    return points;
  }
  var left = lineLength(points) * Math.max(0, part);
  var out = [points[0], points[1]];
  for (var i = 0; i + 3 < points.length; i += 2) {
    var length = Math.sqrt(Math.pow(points[i + 2] - points[i], 2) + Math.pow(points[i + 3] - points[i + 1], 2));
    if (length >= left) {
      var f = length > 0 ? left / length : 0;
      out.push(points[i] + (points[i + 2] - points[i]) * f, points[i + 1] + (points[i + 3] - points[i + 1]) * f);
      return out;
    }
    out.push(points[i + 2], points[i + 3]);
    left -= length;
  }
  return out;
}

// a jagged line the other way round
function reversedLine(points) {
  var out = [];
  for (var i = points.length - 2; i >= 0; i -= 2) {
    out.push(points[i], points[i + 1]);
  }
  return out;
}

// distance from a point to a jagged line
function distanceToLine(points, x, y) {
  var best = 1e9;
  for (var i = 0; i + 3 < points.length; i += 2) {
    var ax = points[i], ay = points[i + 1];
    var dx = points[i + 2] - ax, dy = points[i + 3] - ay;
    var h = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 0.0001)));
    var ex = x - ax - dx * h, ey = y - ay - dy * h;
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

// how far the flash's near-white part reaches from the main channel: so far that it
// covers Lightning brightness of the screen for a strike at the front, less further
// back (by nearnessCurve, like the head brightness and the bloom). Sampled: the
// distance from the channel within which that share of the screen lies
function strikeFlashReach(main, nearness) {
  var target = LightningBrightness * nearnessCurve(nearness);
  if (!(target > 0)) {
    return 0;
  }
  var n = 48;
  var distances = [];
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      distances.push(distanceToLine(main, ((i + 0.5) / n) * ScreenWidth, ((j + 0.5) / n) * ScreenHeight));
    }
  }
  distances.sort(function (p, q) { return p - q; });
  return distances[Math.max(0, Math.min(distances.length - 1, Math.round(target * distances.length) - 1))];
}

// the widths of the flash's four layers (pixels) for a flash whose near-white part
// reaches so far (see FlashLayers)
function flashLayerWidths(reach) {
  var diagonal = Math.sqrt(ScreenWidth * ScreenWidth + ScreenHeight * ScreenHeight);
  var widths = [];
  for (var i = 0; i < 3; i++) {
    widths.push(Math.max(1, reach * FlashLayers[i], diagonal * FlashLayersMin[i]));
  }
  widths.push(diagonal * FlashScreenLayer);
  return widths;
}

// the light of the flash's layers (0-1 of its full light) at a distance (pixels)
// outside its band, for a flash whose near-white part reaches so far (the present
// shader has the same)
function flashLayersLight(over, reach) {
  var widths = flashLayerWidths(reach);
  var light = 0;
  for (var i = 0; i < 4; i++) {
    var v = over / widths[i];
    light += FlashWeights[i] * Math.exp(-v * v);
  }
  return light;
}

// how far the flash's band of full light reaches on each side of the main channel:
// the layers just outside the band keep the flash near-white a little further, so
// the band stops that much before the reach of the near-white part
function strikeFlashBand(reach) {
  // how far past the band the layers are still near-white (found by halving)
  var low = 0, high = reach;
  for (var n = 0; n < 30; n++) {
    var middle = (low + high) / 2;
    if (flashLayersLight(middle, reach) >= FlashNearWhite) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return Math.max(0, reach - low);
}

// a line that branches can fork off: its corner points, when it grows (from start
// to end, in parts of the time until the leaders meet), its generation (0: a leader,
// 1: a branch off a leader, ...), which way its leader goes (1: down, -1: up), is it a
// leader, its size where it starts (in pixels, before rounding: see boltLineParts),
// its length, where it forks (parts of its length, in order), and the line it forks
// off and where (none for a leader)
function boltLine(points, start, end, generation, along, leader, size, parent, at) {
  return { points: points, start: start, end: end, generation: generation, along: along, leader: leader,
    size: size, length: lineLength(points), forks: [], merges: [], parent: parent, at: at };
}

// where a line can fork for a branch of a generation: after its last fork, early
// enough to be seen growing and to leave the later generations time to fork off it
// in turn (the 1st generation by 40% of the time until the leaders meet, each later
// one 15% later, the last by 85%), and only while the branch would be big enough to
// draw (BoltThinning of the line's size there, rounded); loose: by 95% of the time,
// nearer the line's last fork (when no fork could be found otherwise); gives [from,
// to] (parts of its length), or null
function boltForkWindow(line, generation, loose) {
  if (Math.floor(line.size * Math.pow(BoltThinning, line.forks.length + 1) + 0.5) < 1) {
    return null;
  }
  var latest = loose ? 0.95 : 0.85 - 0.15 * (BoltGenerations - generation);
  var gap = loose ? 0.01 : 0.03;
  var from = Math.max(0.03, line.forks.length ? line.forks[line.forks.length - 1] + gap : 0);
  var to = Math.min(loose ? 0.97 : 0.9, (latest - line.start) / (line.end - line.start));
  return to > from ? [from, to] : null;
}

// a fork for a branch of a generation, on the side of the leader going along (1:
// down, -1: up): a line of the generation before and a part of its length, picked at
// random by the length where it can fork (see boltForkWindow; loose: with its looser
// limits); gives [line, part], or
// null
function pickBoltFork(lines, along, generation, loose) {
  var total = 0;
  for (var i = 0; i < lines.length; i++) {
    var w = lines[i].along == along && lines[i].generation == generation - 1 ? boltForkWindow(lines[i], generation, loose) : null;
    if (w) {
      total += (w[1] - w[0]) * lines[i].length;
    }
  }
  var pick = Math.random() * total;
  for (var i = 0; i < lines.length && total > 0; i++) {
    var w = lines[i].along == along && lines[i].generation == generation - 1 ? boltForkWindow(lines[i], generation, loose) : null;
    if (w) {
      var span = (w[1] - w[0]) * lines[i].length;
      if (pick <= span) {
        return [lines[i], w[0] + (w[1] - w[0]) * (pick / span)];
      }
      pick -= span;
    }
  }
  return null;
}

// how many branches of each generation a strike's two sides get: each side forks
// BoltForksMin to BoltForksMax times, and the strike has as many of each generation
// as BoltGenerationForks gives (both sides together); gives [[1st, 2nd, 3rd, 4th] for
// the side down, the same for the side up]
function boltForkPlan() {
  // the 1st generation: 2 a side (the route's first fork and its sibling, see
  // newStrike), and a 3rd on one side half of the time, 4 or 5 in all
  var first = [2, 2];
  if (Math.random() < 0.5) {
    first[Math.random() < 0.5 ? 0 : 1]++;
  }
  var plan = [];
  for (var side = 0; side < 2; side++) {
    var forks = BoltForksMin + Math.floor(Math.random() * (BoltForksMax - BoltForksMin + 1));
    // each side has half of each generation's range
    var most = [], least = [];
    for (var g = 1; g < BoltGenerations; g++) {
      least.push(Math.ceil(BoltGenerationForks[g][0] / 2));
      most.push(Math.floor(BoltGenerationForks[g][1] / 2));
    }
    var left = forks - first[side];
    var second = Math.max(least[0], Math.min(most[0], Math.round(left * (0.15 + 0.15 * Math.random()))));
    var third = Math.max(least[1], Math.min(most[1], Math.round((left - second) * (0.35 + 0.2 * Math.random()))));
    var fourth = Math.max(least[2], Math.min(most[2], left - second - third));
    // what is left over goes to the 3rd, then the 2nd generation, as far as they take it
    var over = left - second - third - fourth;
    var more = Math.max(0, Math.min(over, most[1] - third));
    third += more;
    over -= more;
    second += Math.max(0, Math.min(over, most[0] - second));
    plan.push([first[side], second, third, fourth]);
  }
  return plan;
}

// a branch forking off a line at a part (0-1) of its length, turned 20 to 50
// degrees (or up to wider) to one side of the line's way there, and never turned
// back against its leader's way; gives its corner points
function newBranch(parent, at, length, levels, wider) {
  var start = pointOnLine(parent.points, at);
  // (the line's way there: from a little before to a little after, so that it is
  // known at the line's very end too)
  var ahead = pointOnLine(parent.points, Math.min(1, at + 0.05));
  var behind = pointOnLine(parent.points, Math.max(0, at - 0.05));
  var dx = ahead[0] - behind[0], dy = ahead[1] - behind[1];
  var d = Math.sqrt(dx * dx + dy * dy);
  if (!(d > 0.001)) {
    dx = 0;
    dy = parent.along;
    d = 1;
  }
  dx /= d;
  dy /= d;
  var angle = (Math.random() < 0.5 ? -1 : 1) * (20 + ((wider || 50) - 20) * Math.random()) * Math.PI / 180;
  var ex = dx * Math.cos(angle) - dy * Math.sin(angle);
  var ey = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (ey * parent.along < 0.2) {
    // the other side, which goes the leader's way
    ex = dx * Math.cos(angle) + dy * Math.sin(angle);
    ey = -dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return jaggedLine(start[0], start[1], start[0] + ex * length, start[1] + ey * length, levels, 0.15);
}

// a line a strike's branches keep clear of, or meet: its corner points, its drawn width
// (in pixels), the box round it, its side (0: down, 1: up) and its line (null for a
// route)
function boltObstacle(points, width, side, line) {
  var box = [1e9, 1e9, -1e9, -1e9];
  for (var i = 0; i + 1 < points.length; i += 2) {
    box[0] = Math.min(box[0], points[i]);
    box[1] = Math.min(box[1], points[i + 1]);
    box[2] = Math.max(box[2], points[i]);
    box[3] = Math.max(box[3], points[i + 1]);
  }
  return { points: points, width: width, box: box, side: side, line: line };
}

// the distance from a point to a straight piece
function pointToPiece(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
  var ex = px - ax - dx * h, ey = py - ay - dy * h;
  return Math.sqrt(ex * ex + ey * ey);
}

// the distance between two straight pieces (0 when they cross)
function pieceGap(ax, ay, bx, by, cx, cy, dx, dy) {
  var c1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  var c2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  var c3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  var c4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  if (c1 * c2 < 0 && c3 * c4 < 0) {
    return 0;
  }
  return Math.min(pointToPiece(ax, ay, cx, cy, dx, dy), pointToPiece(bx, by, cx, cy, dx, dy),
    pointToPiece(cx, cy, ax, ay, bx, by), pointToPiece(dx, dy, ax, ay, bx, by));
}

// the first piece of a jagged line of a width that comes too near one of the obstacles
// (see boltObstacle: nearer than their two half widths and BoltClearGap), but the ones
// ignored (a list, or null); gives { piece: its index, a, b: its ends, obstacle, target:
// the index of the obstacle's piece it comes near }, or null
function boltContact(points, width, obstacles, ignored) {
  for (var i = 0; i + 3 < points.length; i += 2) {
    var ax = points[i], ay = points[i + 1], bx = points[i + 2], by = points[i + 3];
    for (var k = 0; k < obstacles.length; k++) {
      var o = obstacles[k];
      if (ignored && ignored.indexOf(o) >= 0) {
        continue;
      }
      var need = (width + o.width) / 2 + BoltClearGap;
      if (Math.max(ax, bx) + need < o.box[0] || Math.min(ax, bx) - need > o.box[2] ||
          Math.max(ay, by) + need < o.box[1] || Math.min(ay, by) - need > o.box[3]) {
        continue;
      }
      var q = o.points;
      for (var j = 0; j + 3 < q.length; j += 2) {
        if (pieceGap(ax, ay, bx, by, q[j], q[j + 1], q[j + 2], q[j + 3]) < need) {
          return { piece: i / 2, a: [ax, ay], b: [bx, by], obstacle: o, target: j / 2 };
        }
      }
    }
  }
  return null;
}

// where a straight piece (a to b) meets another (c to d): the point on the other where
// they cross, or else its point nearest the piece
function meetingPoint(ax, ay, bx, by, cx, cy, dx, dy) {
  var ex = bx - ax, ey = by - ay, fx = dx - cx, fy = dy - cy;
  var den = ex * fy - ey * fx;
  if (Math.abs(den) > 1e-9) {
    var s = ((cx - ax) * fy - (cy - ay) * fx) / den;
    var u = ((cx - ax) * ey - (cy - ay) * ex) / den;
    if (s >= 0 && s <= 1 && u >= 0 && u <= 1) {
      return [cx + fx * u, cy + fy * u];
    }
  }
  // the ends of the piece onto the other, and the other's ends
  var best = null, bestGap = 1e18;
  var onOther = function (px, py) {
    var h = Math.max(0, Math.min(1, ((px - cx) * fx + (py - cy) * fy) / Math.max(fx * fx + fy * fy, 1e-9)));
    var qx = cx + fx * h, qy = cy + fy * h;
    var gap = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (gap < bestGap) {
      bestGap = gap;
      best = [qx, qy];
    }
  };
  onOther(ax, ay);
  onOther(bx, by);
  var ends = [[cx, cy], [dx, dy]];
  for (var i = 0; i < 2; i++) {
    var g = pointToPiece(ends[i][0], ends[i][1], ax, ay, bx, by);
    if (g * g < bestGap) {
      bestGap = g * g;
      best = ends[i];
    }
  }
  return best;
}

// the path going on from where two lines of the bolt meet (see newStrike): from a
// point, its way turned 5 to 25 degrees to one side of a way (biased toward it, not the
// same), never turned back against its leader's way (along); gives its corner points
function rejoinPath(x, y, dx, dy, length, levels, along) {
  var angle = (Math.random() < 0.5 ? -1 : 1) * (5 + 20 * Math.random()) * Math.PI / 180;
  var ex = dx * Math.cos(angle) - dy * Math.sin(angle);
  var ey = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (ey * along < 0.2) {
    ex = dx * Math.cos(angle) + dy * Math.sin(angle);
    ey = -dx * Math.sin(angle) + dy * Math.cos(angle);
  }
  return jaggedLine(x, y, x + ex * length, y + ey * length, levels, 0.15);
}

// is a top x far enough from where every playing strike starts?
function strikeStartFree(x) {
  for (var i = 0; i < Strikes.length; i++) {
    if (Math.abs(Strikes[i].main[0] - x) < StrikeStartGap * ScreenWidth) {
      return false;
    }
  }
  return true;
}

// a new strike at a random place and distance, or null when no place was found far
// enough from the strikes playing now
function newStrike(atNearness) {
  // at a random distance, or at the one given (Strike now in Debug mode)
  var nearness = atNearness >= 0 ? atNearness : Math.random();
  var top = -0.03 * ScreenHeight;
  var ground = groundY(nearness);
  var height = ground - top;
  var x0 = ScreenWidth * (0.1 + 0.8 * Math.random());
  for (var tries = 0; !strikeStartFree(x0); tries++) {
    if (tries >= 8) {
      return null;
    }
    x0 = ScreenWidth * (0.1 + 0.8 * Math.random());
  }
  // where it strikes the ground: anywhere up to 0.45 of the strike's height to either
  // side of the top (inside the screen), so the top and the ground are not lined up
  var x1 = Math.max(0.05 * ScreenWidth, Math.min(0.95 * ScreenWidth, x0 + (Math.random() - 0.5) * 0.9 * height));
  // where the two leaders meet: a random part of the way down, and to the side of the
  // straight line from the top to the ground by up to 0.25 of the height, so the ways
  // down and up turn there
  var meet = 0.3 + 0.45 * Math.random();
  var meetX = x0 + (x1 - x0) * meet + (Math.random() - 0.5) * 0.5 * height;
  var meetY = top + meet * height;
  // the way down from the top and the way up from the ground, each a jagged line of
  // its own to the meeting point (so the two are not one line cut in two), winding
  // (BoltRouteRoughness); the main channel is the two joined, the way up the other way
  // round
  var routes = [
    jaggedLine(x0, top, meetX, meetY, BoltMainLevels, BoltRouteRoughness),
    jaggedLine(x1, ground, meetX, meetY, BoltMainLevels, BoltRouteRoughness),
  ];
  var main = routes[0].concat(reversedLine(routes[1]).slice(2));
  // what the branches keep clear of, or meet (see makeLine): the two routes (in the
  // main channel's width, the font size), then each branch as it is made, whole and
  // past its fork
  var F = fontSizeAt(nearness);
  var routeObstacles = [boltObstacle(routes[0], F, 0, null), boltObstacle(routes[1], F, 1, null)];
  // where paths meet (see meetingOn)
  var meetings = [];
  var obstacles = routeObstacles.slice();
  var outer = routeObstacles.slice();
  // a line's drawn width at its start (its size there, rounded; the sizes made again
  // below are never bigger)
  var drawnWidth = function (size) { return Math.max(1, Math.floor(size + 0.5)); };
  // the way to the meeting point on each side (the route: down from the top, up from
  // the ground), grown over the whole time until the leaders meet, is a chain of forks
  // like any other: the leader forks, the route goes on as a branch of the next
  // generation, and so on, 1 to BoltGenerations times, with a sibling branch at each of
  // these forks. So the line that reaches the meeting point is a branch of the 1st to
  // 4th generation, and nothing marks the route out until the leaders meet. Its first
  // fork is early (10-40% of the way), so its branches can fork in turn; with more than
  // one, the last is in the route's last fifth, so near the meeting point the route is
  // never one bare line (with one, its tip forks there instead, see below). The route's
  // parts are the strike's leaders (drawn until they meet, never below 1 px). The
  // parts of both routes are made first, then the siblings (which may meet them)
  var plan = boltForkPlan();
  var lines = [];
  var leaders = [];
  var branches = [];
  var depths = [];
  var siblings = [];
  for (var side = 0; side < 2; side++) {
    var along = side == 0 ? 1 : -1;
    var route = routes[side];
    var routeLength = lineLength(route);
    var depth = 1 + Math.floor(Math.random() * BoltGenerations);
    var cuts = [0.1 + 0.3 * Math.random()];
    if (depth > 1) {
      var last = 0.8 + 0.15 * Math.random();
      for (var c = 1; c < depth - 1; c++) {
        cuts.push(cuts[0] + 0.05 + (last - 0.1 - cuts[0]) * Math.random());
      }
      cuts.sort(function (a, b) { return a - b; });
      cuts.push(last);
    }
    depths.push(depth);
    var previous = null;
    for (var j = 0; j <= depth; j++) {
      var from = j ? cuts[j - 1] : 0;
      var to = j < depth ? cuts[j] : 1;
      // (the sizes are made again once every fork is known, below)
      var size = previous ? previous.size * BoltThinning : F / 2;
      var part = boltLine(sliceOfLine(route, from, to), from, to, j, along, true, size, previous, 1);
      part.route = true;
      part.routeFrom = from;
      part.routeTo = to;
      part.routeLength = routeLength;
      leaders.push(part);
      lines.push(part);
      if (previous) {
        siblings.push({ side: side, parent: previous, from: from, size: size, generation: j });
      }
      previous = part;
    }
  }
  var sideOf = function (line) { return line.along > 0 ? 0 : 1; };
  // the lines a line comes from: its parent, the two a rejoin joins, and theirs
  var ancestorsOf = function (line) {
    var out = [], todo = [line];
    while (todo.length) {
      var x = todo.pop();
      var up = (x.joins || []).concat(x.parent ? [x.parent] : []);
      for (var u = 0; u < up.length; u++) {
        if (out.indexOf(up[u]) < 0) {
          out.push(up[u]);
          todo.push(up[u]);
        }
      }
    }
    return out;
  };
  // the obstacles of some lines past their forks (the whole route for a part of it)
  var ownObstacles = function (list, side) {
    var own = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i].route ? routeObstacles[side] : list[i].outerObstacle;
      if (o && own.indexOf(o) < 0) {
        own.push(o);
      }
    }
    return own;
  };
  // the part of a side's route at a part (0-1) of its length
  var routePartAt = function (side, part) {
    var along = side == 0 ? 1 : -1;
    for (var i = 0; i < leaders.length; i++) {
      var p = leaders[i];
      if (p.along == along && p.routeFrom <= part && part < p.routeTo) {
        return p;
      }
    }
    return null;
  };
  // a line's obstacles (made again when it changes), whole and past its fork
  var setObstacles = function (line, width) {
    var whole = boltObstacle(line.points, width, sideOf(line), line);
    var past = boltObstacle(sliceOfLine(line.points, line.clearFrom / line.length, 1), width, sideOf(line), line);
    var i = obstacles.indexOf(line.obstacle), k = outer.indexOf(line.outerObstacle);
    if (i >= 0) {
      obstacles[i] = whole;
    } else {
      obstacles.push(whole);
    }
    if (k >= 0) {
      outer[k] = past;
    } else {
      outer.push(past);
    }
    line.obstacle = whole;
    line.outerObstacle = past;
    line.width = width;
  };
  var dropObstacles = function (line) {
    obstacles.splice(obstacles.indexOf(line.obstacle), 1);
    outer.splice(outer.indexOf(line.outerObstacle), 1);
  };
  var register = function (line, width) {
    setObstacles(line, width);
    branches.push(line);
    lines.push(line);
    return line;
  };
  // the route goes on from a part of its length as a part of a generation (a rejoin
  // with a branch: see makeLine), in that generation's size: its part there is cut in
  // two, and its forks after that point (and the route's next part) go to the new one
  var splitRoute = function (p, part, generation, branch) {
    var side = sideOf(p);
    var f = (part - p.routeFrom) / (p.routeTo - p.routeFrom);
    var next = boltLine(sliceOfLine(routes[side], part, p.routeTo), part, p.routeTo, generation, p.along, true,
      F / 2 * Math.pow(BoltThinning, generation), p, 1);
    next.route = true;
    next.routeFrom = part;
    next.routeTo = p.routeTo;
    next.routeLength = p.routeLength;
    next.joins = [branch, p];
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i];
      if (c.parent === p) {
        if (c.at >= 1) {
          c.parent = next;
        } else if (c.at >= f) {
          c.parent = next;
          c.at = (c.at - f) / (1 - f);
        } else {
          c.at = c.at / f;
        }
      }
    }
    var forks = p.forks;
    p.forks = [];
    for (var i = 0; i < forks.length; i++) {
      if (forks[i] < f) {
        p.forks.push(forks[i] / f);
      } else {
        next.forks.push((forks[i] - f) / (1 - f));
      }
    }
    p.points = sliceOfLine(routes[side], p.routeFrom, part);
    p.routeTo = part;
    p.end = part;
    p.length = lineLength(p.points);
    // (a part that went on from this one after an earlier rejoin now goes on from the
    // new one, and a branch that ended on it further on ends on the new one)
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i];
      if (c.route && c.joins && c.joins[1] === p && c.routeFrom >= part) {
        c.joins[1] = next;
      }
      if (c.mergedInto === p && c.mergedAt >= part) {
        c.mergedInto = next;
      }
    }
    branch.joinedInto = next;
    leaders.push(next);
    lines.push(next);
    // the route's later rejoins, by the generation of the route before them now
    var later = leaders.filter(function (x) { return x.joins && x.along == p.along && x.routeFrom > part; });
    later.sort(function (x, y) { return x.routeFrom - y.routeFrom; });
    for (var i = 0; i < later.length; i++) {
      var g = Math.max(0, Math.min(later[i].joins[0].generation, later[i].joins[1].generation) - 1);
      later[i].generation = g;
      later[i].size = F / 2 * Math.pow(BoltThinning, g);
    }
  };
  // the sizes of the lines (see below), as they would be with no more forks: a line's
  // parent (or the route's part it goes on from) can only thin it more later
  var resize = function () {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.parent && !line.joins) {
        var k = line.at >= 1 ? line.parent.forks.length : line.parent.forks.indexOf(line.at);
        line.size = line.parent.size * Math.pow(BoltThinning, k + 1);
      }
    }
  };
  // all that a rejoin with the route changes, to undo it
  var snapshot = function () {
    var state = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      state.push({ line: l, points: l.points, routeTo: l.routeTo, end: l.end, length: l.length, forks: l.forks.slice(),
        merges: l.merges.slice(), parent: l.parent, at: l.at, joins: l.joins ? l.joins.slice() : null, mergedInto: l.mergedInto,
        joinedInto: l.joinedInto, generation: l.generation, size: l.size, width: l.width, obstacle: l.obstacle,
        outerObstacle: l.outerObstacle });
    }
    return { state: state, lines: lines.length, leaders: leaders.length, branches: branches.length, meetings: meetings.length,
      obstacles: obstacles.slice(), outer: outer.slice() };
  };
  var restore = function (saved) {
    for (var i = 0; i < saved.state.length; i++) {
      var x = saved.state[i], l = x.line;
      l.points = x.points; l.routeTo = x.routeTo; l.end = x.end; l.length = x.length; l.forks = x.forks;
      l.merges = x.merges; l.parent = x.parent; l.at = x.at; l.joins = x.joins; l.mergedInto = x.mergedInto;
      l.joinedInto = x.joinedInto; l.generation = x.generation; l.size = x.size; l.width = x.width;
      l.obstacle = x.obstacle; l.outerObstacle = x.outerObstacle;
    }
    lines.length = saved.lines;
    meetings.length = saved.meetings;
    leaders.length = saved.leaders;
    branches.length = saved.branches;
    obstacles.length = 0;
    outer.length = 0;
    Array.prototype.push.apply(obstacles, saved.obstacles);
    Array.prototype.push.apply(outer, saved.outer);
  };
  // with the sizes now, does every branch that grew still keep clear of the lines it
  // does not come from, fork off or meet (past its fork)? Their obstacles take the new
  // widths
  var stillClear = function () {
    resize();
    for (var i = 0; i < branches.length; i++) {
      var line = branches[i];
      var width = drawnWidth(line.size);
      if (width <= line.width) {
        continue;
      }
      setObstacles(line, width);
      var skip = [line].concat(ancestorsOf(line));
      for (var k = 0; k < lines.length; k++) {
        var x = lines[k];
        if (x.mergedInto === line || ancestorsOf(x).indexOf(line) >= 0) {
          skip.push(x);
        }
      }
      var into = line.joinedInto || line.mergedInto;
      if (into) {
        skip.push(into);
        if (into.joins) {
          skip = skip.concat(into.joins);
        }
      }
      var ignored = [];
      for (var k = 0; k < obstacles.length; k++) {
        var o = obstacles[k];
        if (o.line ? skip.indexOf(o.line) >= 0 : (into && into.route && o.side == sideOf(line))) {
          ignored.push(o);
        }
      }
      for (var k = 0; k < outer.length; k++) {
        if (outer[k].line && skip.indexOf(outer[k].line) >= 0) {
          ignored.push(outer[k]);
        }
      }
      // (and the lines that fork off it keep clear of it past their forks)
      for (var k = 0; k < branches.length; k++) {
        var d = branches[k];
        if (d !== line && ancestorsOf(d).indexOf(line) >= 0 &&
            boltContact(sliceOfLine(d.points, d.clearFrom / d.length, 1), d.width, [line.obstacle], null)) {
          return false;
        }
      }
      var far = sliceOfLine(line.points, line.clearFrom / line.length, 1);
      if (boltContact(far, width, obstacles, ignored) || boltContact(line.points, width, outer, ignored.concat([routeObstacles[0], routeObstacles[1]]))) {
        return false;
      }
    }
    return true;
  };
  // a new line of the bolt (a fork's branch, a sibling, or the path going on from a
  // rejoin): spec.shape(try) gives its corner points, spec.make(points, near) the line
  // (near: how far from its start it may touch its parent). It is tried BoltBranchTries
  // times. Near its fork it only keeps clear of the routes and of the other branches
  // past their own forks (spec.own: the obstacles of its parent and the lines that
  // forks off, the parent's first, are left out); further on it meets the first line
  // it comes near:
  // - a line of the other half: it may not (only the routes meet the other half);
  // - a line of its own half: a rejoin (the user, 2026-10-22). Both end there and a
  //   path goes on from that point, of the generation one bigger than the bigger of the
  //   two (the smaller number, less 1, at least 0), in that generation's size, starting
  //   when both have grown to it, its way biased toward the way the bigger one came
  //   (see rejoinPath), as long as the bigger one had left, at most BoltRejoinDepth
  //   rejoins in a row. With the route, the branch ends there and the route goes on, on
  //   its own way, as a part of that generation (see splitRoute). Not with a line it
  //   comes from, one that already ended, or past a fork of the other line, near the
  //   other's fork or the route's meeting point.
  // - The 0th generation (the user, 2026-10-22): a line of the 1st to 4th never meets a
  //   leader's first part; one of the 0th going on after a rejoin it meets, and ends on
  //   it (mergedInto), and the 0th goes on on its own way at its size. So a path of the
  //   0th going on after a rejoin goes on through a branch of the 1st to 4th it meets,
  //   which ends there; with the route, the route goes on as the 0th (a rejoin).
  // When it may not, the longest try cut short before it, if it keeps spec.least
  // pixels and at least as much past the part near its fork as that part; gives the
  // line (in the strike's lists), or null
  var makeLine = function (spec) {
    var best = null, bestLength = 0, bestNear = 0, bestThrough = [], bestPiece = 0;
    for (var t = 0; t < BoltBranchTries; t++) {
      var points = spec.shape(t);
      var total = lineLength(points);
      if (!(total > 0)) {
        continue;
      }
      var near = Math.min(total / 2, 2 * (spec.width + spec.ownWidth) + 4);
      if (boltContact(sliceOfLine(points, 0, near / total), spec.width, outer, spec.own)) {
        continue;
      }
      var far = sliceOfLine(points, near / total, 1);
      // (a path of the 0th going on after a rejoin goes on through the branches of the
      // 1st to 4th of its half it meets, which end there)
      var through = [], passed = [];
      var hit = boltContact(far, spec.width, obstacles, null);
      while (hit && spec.generation == 0 && spec.joining) {
        var cut = passable(spec, hit, near, far, total, through);
        if (!cut) {
          break;
        }
        through.push(cut);
        passed.push(hit.obstacle);
        hit = boltContact(far, spec.width, obstacles, passed);
      }
      if (!hit) {
        return passThrough(register(spec.make(points, near), spec.width), through, 1e9);
      }
      var kept = near + lineLength(far.slice(0, 2 * hit.piece + 2));
      if (kept < 2 * near) {
        continue;
      }
      var head = partOfLine(points, kept / total);
      spec.passed = passed;
      var joined = spec.depth < BoltRejoinDepth ? rejoin(spec, head, near, hit, total - kept) : null;
      if (joined) {
        return passThrough(joined, through, hit.piece);
      }
      if (kept > bestLength) {
        bestLength = kept;
        best = head;
        bestNear = near;
        bestThrough = through;
        bestPiece = hit.piece;
      }
    }
    return bestLength >= spec.least ? passThrough(register(spec.make(best, bestNear), spec.width), bestThrough, bestPiece) : null;
  };
  // where a try of makeLine (its piece that comes near: hit) really crosses the other
  // line: the point there, a part (0-1) of the other line's length, and the angle they
  // cross at (degrees, 0-90); or null when the piece does not cross it, at less than
  // BoltJoinAngle, or nearer than BoltJoinGap F to where paths already meet
  var meetingOn = function (hit) {
    var q = hit.obstacle.points;
    var ax = hit.a[0], ay = hit.a[1], ex = hit.b[0] - ax, ey = hit.b[1] - ay;
    var best = null;
    for (var j = 0; j + 3 < q.length; j += 2) {
      var cx = q[j], cy = q[j + 1], fx = q[j + 2] - cx, fy = q[j + 3] - cy;
      var den = ex * fy - ey * fx;
      if (Math.abs(den) < 1e-9) {
        continue;
      }
      var t = ((cx - ax) * fy - (cy - ay) * fx) / den;
      var u = ((cx - ax) * ey - (cy - ay) * ex) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!best || t < best.t)) {
        var cos = Math.abs(ex * fx + ey * fy) / Math.max(1e-9, Math.sqrt((ex * ex + ey * ey) * (fx * fx + fy * fy)));
        best = { t: t, j: j, u: u, angle: Math.acos(Math.min(1, cos)) * 180 / Math.PI };
      }
    }
    if (!best || best.angle < BoltJoinAngle) {
      return null;
    }
    var j = best.j;
    var m = [q[j] + (q[j + 2] - q[j]) * best.u, q[j + 1] + (q[j + 3] - q[j + 1]) * best.u];
    for (var i = 0; i < meetings.length; i++) {
      if (Math.sqrt(Math.pow(meetings[i][0] - m[0], 2) + Math.pow(meetings[i][1] - m[1], 2)) < BoltJoinGap * F) {
        return null;
      }
    }
    var upTo = lineLength(q.slice(0, j + 2)) + Math.sqrt(Math.pow(m[0] - q[j], 2) + Math.pow(m[1] - q[j + 1], 2));
    return { point: m, part: upTo / Math.max(1e-9, lineLength(q)), angle: best.angle };
  };
  // may a line end where it is met: not a line the new one comes from, one that already
  // ended, near its fork, or past one of its forks
  var mayEnd = function (spec, line, part) {
    if (spec.ancestors.indexOf(line) >= 0 || line.joinedInto || line.mergedInto || part * line.length <= line.clearFrom + 1) {
      return false;
    }
    var kept = line.forks.concat(line.merges || []);
    for (var f = 0; f < kept.length; f++) {
      if (kept[f] >= part - 0.01) {
        return false;
      }
    }
    return true;
  };
  // a branch of the 1st to 4th of the same half that a path of the 0th going on after a
  // rejoin may go through (it ends there): { line, part, piece }, or null
  var passable = function (spec, hit, near, far, total, through) {
    var line = hit.obstacle.line;
    if (!line || hit.obstacle.side != spec.side || line.generation == 0) {
      return null;
    }
    var meet = meetingOn(hit);
    if (!meet || !mayEnd(spec, line, meet.part)) {
      return null;
    }
    for (var i = 0; i < through.length; i++) {
      var o = through[i].point;
      if (Math.sqrt(Math.pow(o[0] - meet.point[0], 2) + Math.pow(o[1] - meet.point[1], 2)) < BoltJoinGap * F) {
        return null;
      }
    }
    // (where on the path: a part of its length)
    var on = near + lineLength(far.slice(0, 2 * hit.piece + 2)) +
      Math.sqrt(Math.pow(meet.point[0] - hit.a[0], 2) + Math.pow(meet.point[1] - hit.a[1], 2));
    // (its end on the path: where they cross)
    var onPath = meet.point;
    // (its last piece, on to that point, keeps clear of the others but its own forks)
    var kept = partOfLine(line.points, meet.part);
    var end = kept.slice(-4, -2).concat(onPath);
    var ignored = [line.obstacle, line.outerObstacle];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].parent === line && lines[i].obstacle) {
        ignored.push(lines[i].obstacle);
      }
    }
    if (boltContact(end, line.width, obstacles, ignored)) {
      return null;
    }
    return { line: line, part: meet.part, piece: hit.piece, on: on / total, point: onPath };
  };
  // the branches a path went through (before its piece upTo) end where it met them
  var passThrough = function (path, through, upTo) {
    for (var i = 0; i < through.length; i++) {
      if (through[i].piece < upTo && through[i].on <= 1) {
        var cut = through[i].line;
        cutLine(cut, through[i].part);
        cut.points[cut.points.length - 2] = through[i].point[0];
        cut.points[cut.points.length - 1] = through[i].point[1];
        cut.length = lineLength(cut.points);
        setObstacles(cut, cut.width);
        cut.mergedInto = path;
        through[i].line.mergedAt = through[i].on;
        meetings.push(through[i].point);
        path.merges.push(through[i].on);
      }
    }
    return path;
  };
  // a branch ends at a part (0-1) of its length: its forks, as parts of its new length
  var cutLine = function (line, part) {
    line.points = partOfLine(line.points, part);
    line.end = line.start + (line.end - line.start) * part;
    line.length = lineLength(line.points);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].parent === line) {
        lines[i].at = lines[i].at / part;
      }
    }
    for (var f = 0; f < line.forks.length; f++) {
      line.forks[f] = line.forks[f] / part;
    }
    for (var f = 0; f < line.merges.length; f++) {
      line.merges[f] = line.merges[f] / part;
    }
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].mergedInto === line) {
        lines[i].mergedAt = lines[i].mergedAt / part;
      }
    }
    setObstacles(line, line.width);
  };
  // a try of makeLine (its corner points up to the piece that comes near a line, the
  // part near its fork, what it comes near, how long the rest of it was) as a rejoin;
  // gives the line, or null when it may not
  var rejoin = function (spec, head, near, hit, rest) {
    var o = hit.obstacle;
    if (o.side != spec.side) {
      return null;
    }
    var meet = meetingOn(hit);
    if (!meet) {
      return null;
    }
    var m = meet.point, part = meet.part;
    // (its last piece, on to the meeting point, keeps clear of the others)
    var end = head.slice(-2).concat([m[0], m[1]]);
    if (boltContact(end, spec.width, obstacles, [o].concat(spec.passed || []))) {
      return null;
    }
    var other = o.line;
    if (!other) {
      other = routePartAt(spec.side, part);
      if (!other || part > 0.97) {
        return null;
      }
    }
    if (spec.ancestors.indexOf(other) >= 0) {
      return null;
    }
    if (spec.generation > 0 && other.generation == 0) {
      // a 0th: a leader's first part never; one going on after a rejoin goes on on its
      // own way, and the branch ends on it
      if (!other.joins || (o.line && part * other.length <= other.clearFrom + 1)) {
        return null;
      }
      var merged = spec.make(head.concat([m[0], m[1]]), near);
      merged.mergedInto = other;
      merged.mergedAt = part;
      meetings.push(m);
      if (o.line) {
        other.merges.push(part);
      }
      return register(merged, spec.width);
    }
    if (spec.generation == 0 && other.generation > 0 && (o.line || !spec.joining)) {
      // (a branch it goes through: see makeLine)
      return null;
    }
    if (!o.line) {
      if (part - other.routeFrom < 0.02 || other.routeTo - part < 0.02) {
        return null;
      }
    } else if (!mayEnd(spec, other, part)) {
      return null;
    }
    var generation = Math.max(0, Math.min(spec.generation, other.generation) - 1);
    var line = spec.make(head.concat([m[0], m[1]]), near);
    if (!o.line) {
      // (the route's later parts, and their forks, may grow: undone when one would
      // touch a line then)
      var saved = snapshot();
      register(line, spec.width);
      meetings.push(m);
      splitRoute(other, part, generation, line);
      if (!stillClear()) {
        restore(saved);
        return null;
      }
      return line;
    }
    // the other line ends there too (undone when the path cannot go on)
    var was = { points: other.points, length: other.length, end: other.end, obstacle: other.obstacle, outer: other.outerObstacle };
    var otherRest = other.length * (1 - part);
    other.points = partOfLine(other.points, part);
    other.length = lineLength(other.points);
    other.end = other.start + (was.end - other.start) * part;
    setObstacles(other, other.width);
    setObstacles(line, spec.width);
    var big = line.generation < other.generation || (line.generation == other.generation && line.size >= other.size) ? line : other;
    var into = sliceOfLine(big.points, Math.max(0, 1 - 20 / big.length), 1);
    var dx = m[0] - into[0], dy = m[1] - into[1];
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var size = F / 2 * Math.pow(BoltThinning, generation);
    var width = drawnWidth(size);
    var length = Math.max(20, 4 * width, (big === line ? rest : otherRest) * (0.7 + 0.4 * Math.random()));
    var from = [line, other].concat(ancestorsOf(line), ancestorsOf(other));
    var startAt = Math.max(line.end, other.end);
    var along = line.along;
    // (where they meet, while the path is made, so its own meetings are apart from it)
    meetings.push(m);
    var path = makeLine({
      side: spec.side, generation: generation, width: width, ownWidth: Math.max(spec.width, other.width),
      own: ownObstacles(from, spec.side), ancestors: from, least: 0.4 * length, depth: spec.depth + 1, joining: true,
      shape: function () {
        return rejoinPath(m[0], m[1], dx / d, dy / d, length, generation <= 1 ? BoltBranchLevels : BoltBranchLevels - 1, along);
      },
      make: function (points, near) {
        var speed = lineLength(routes[spec.side]) * (0.6 + 0.4 * Math.random());
        var path = boltLine(points, startAt, startAt + lineLength(points) / Math.max(1, speed), generation, along, false,
          size, big, 1);
        path.clearFrom = near;
        path.joins = [line, other];
        return path;
      },
    });
    if (!path) {
      meetings.splice(meetings.indexOf(m), 1);
      other.points = was.points;
      other.length = was.length;
      other.end = was.end;
      obstacles[obstacles.indexOf(other.obstacle)] = was.obstacle;
      outer[outer.indexOf(other.outerObstacle)] = was.outer;
      other.obstacle = was.obstacle;
      other.outerObstacle = was.outer;
      dropObstacles(line);
      return null;
    }
    // the other line's forks, as parts of its new length
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].parent === other) {
        lines[i].at = lines[i].at / part;
      }
    }
    for (var f = 0; f < other.forks.length; f++) {
      other.forks[f] = other.forks[f] / part;
    }
    for (var f = 0; f < other.merges.length; f++) {
      other.merges[f] = other.merges[f] / part;
    }
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].mergedInto === other) {
        lines[i].mergedAt = lines[i].mergedAt / part;
      }
    }
    line.joinedInto = path;
    other.joinedInto = path;
    branches.push(line);
    lines.push(line);
    return line;
  };
  // the sibling at each fork of the chain: about as long as the rest of the route, so
  // either could be the way to the meeting point (at least half the rest of the route,
  // also when it is cut short; with no room for it, none)
  for (var i = 0; i < siblings.length; i++) {
    (function (sib) {
      var routeLength = lineLength(routes[sib.side]);
      var length = (1 - sib.from) * routeLength * (0.6 + 0.5 * Math.random());
      var from = [sib.parent].concat(ancestorsOf(sib.parent));
      makeLine({
        side: sib.side, generation: sib.generation, width: drawnWidth(sib.size), ownWidth: F,
        own: [routeObstacles[sib.side]], ancestors: from, least: 0.5 * (1 - sib.from) * routeLength, depth: 0,
        shape: function (t) { return newBranch(sib.parent, 1, length, BoltBranchLevels, 50 + 30 * t / (BoltBranchTries - 1)); },
        make: function (points, near) {
          var speed = routeLength * (0.6 + 0.4 * Math.random());
          var line = boltLine(points, sib.from, sib.from + lineLength(points) / Math.max(1, speed), sib.generation,
            sib.parent.along, false, sib.size, sib.parent, 1);
          line.clearFrom = near;
          return line;
        },
      });
    })(siblings[i]);
  }
  // the other forks of each side, generation by generation (see boltForkPlan; the
  // chain's forks count with their generation, a rejoin's path does not), only where
  // their branch can be drawn. Each branch forks off where its line has already grown
  // to, after the line's earlier forks, grows about as fast as the route, and may not
  // be fully grown when the leaders meet; a branch off the route is about as long as
  // the rest of the route, branches of branches are shorter. At a fork the line thins
  // to BoltThinning of its size, and the branch starts at that size. A fork with no
  // room for its branch (see makeLine) is given up, and another one tried (up to 4
  // times as many as wanted); what a side still lacks then is tried again: a
  // generation with fewer than its least first, then any from the 2nd that has room
  // for more (see boltForkPlan)
  // one fork of a generation on a side (tip: the fork in the route's last fifth of a
  // chain of one fork); gives the branch, false when it had no room, or null when there
  // was no place to fork
  var forkOnce = function (side, generation, tip) {
    var along = side == 0 ? 1 : -1;
    var fork;
    if (tip) {
      var onRoute = 0.8 + 0.15 * Math.random();
      var line = routePartAt(side, onRoute);
      fork = line ? [line, (onRoute - line.routeFrom) / (line.routeTo - line.routeFrom)] : null;
    } else {
      fork = pickBoltFork(lines, along, generation, false) || pickBoltFork(lines, along, generation, true);
    }
    if (!fork) {
      return null;
    }
    var parent = fork[0], at = fork[1];
    parent.forks.push(at);
    // a branch off the route is about as long as the rest of the route (at least half
    // of it, also when it is cut short), one off a branch shorter
    var rest = parent.route ? (1 - parent.routeFrom - at * (parent.routeTo - parent.routeFrom)) * parent.routeLength : 0;
    var length = parent.route ? rest * (0.6 + 0.5 * Math.random()) : parent.length * (0.3 + 0.35 * Math.random());
    var size = parent.size * Math.pow(BoltThinning, parent.forks.length);
    var levels = parent.route ? BoltBranchLevels : BoltBranchLevels - 1;
    var from = [parent].concat(ancestorsOf(parent));
    var branch = makeLine({
      side: side, generation: generation, width: drawnWidth(size), ownWidth: parent.route ? F : parent.width,
      own: ownObstacles(from, side), ancestors: from, least: parent.route ? 0.5 * rest : 0.4 * length, depth: 0,
      shape: function (t) { return newBranch(parent, at, length, levels, 50 + 30 * t / (BoltBranchTries - 1)); },
      make: function (points, near) {
        var start = parent.start + at * (parent.end - parent.start);
        var speed = lineLength(routes[side]) * (0.6 + 0.4 * Math.random());
        var line = boltLine(points, start, start + lineLength(points) / Math.max(1, speed), generation, along, false,
          size, parent, at);
        line.clearFrom = near;
        return line;
      },
    });
    if (!branch) {
      parent.forks.pop();
      return false;
    }
    return branch;
  };
  for (var side = 0; side < 2; side++) {
    for (var generation = 1; generation <= BoltGenerations; generation++) {
      var count = plan[side][generation - 1] - (generation <= depths[side] ? 2 : 0);
      for (var made = 0, tried = 0; made < count && tried < 4 * count + 8; tried++) {
        var branch = forkOnce(side, generation, generation == 2 && depths[side] == 1 && made == 0);
        if (branch === null) {
          break;
        }
        if (branch) {
          made++;
        }
      }
    }
  }
  for (var side = 0; side < 2; side++) {
    // what the side still lacks: a chain of one fork's fork in the route's last fifth
    // first; then a generation with fewer than its least, then any that has room for
    // more (the 1st while the strike has fewer than its most: more lines to fork off),
    // but one whose forks failed 15 times
    var along = side == 0 ? 1 : -1;
    var wanted = plan[side].reduce(function (x, y) { return x + y; }, 0);
    // (a generation whose forks keep finding no room gives way to the others)
    var failed = [0, 0, 0, 0, 0];
    for (var tried = 0, tips = 0; tried < 100; tried++) {
      var have = [0, 0, 0, 0, 0], firsts = 0, tipForked = false;
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (l.generation > 0 && !l.joins) {
          if (l.along == along) {
            have[l.generation]++;
          }
          if (l.generation == 1) {
            firsts++;
          }
        }
        if (l.along == along && l.parent && l.parent.route && !l.route &&
            l.parent.routeFrom + l.at * (l.parent.routeTo - l.parent.routeFrom) >= 0.8) {
          tipForked = true;
        }
      }
      if (depths[side] == 1 && !tipForked && tips < 10) {
        tips++;
        forkOnce(side, 2, true);
        continue;
      }
      var open = [], short = [];
      if (firsts < BoltGenerationForks[0][1] && failed[1] < 15) {
        open.push(1);
      }
      for (var g = 2; g <= BoltGenerations; g++) {
        if (failed[g] >= 15) {
          continue;
        }
        if (have[g] < Math.ceil(BoltGenerationForks[g - 1][0] / 2)) {
          short.push(g);
        }
        if (have[g] < Math.floor(BoltGenerationForks[g - 1][1] / 2)) {
          open.push(g);
        }
      }
      if (short.length) {
        open = short;
      } else if (have[1] + have[2] + have[3] + have[4] >= wanted || !open.length) {
        break;
      }
      var g = open[Math.floor(Math.random() * open.length)];
      if (!forkOnce(side, g, false)) {
        failed[g]++;
      }
    }
  }
  // the sizes, now that every fork is known (in the order the lines were made, so a
  // line's parent is done before it): 3/4 of the parent's size at the fork, the parent
  // thinned by 3/4 at each fork before it (a fork at its end comes after all of them);
  // a rejoin's path keeps its generation's size
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.parent && !line.joins) {
      var k = line.at >= 1 ? line.parent.forks.length : line.parent.forks.indexOf(line.at);
      line.size = line.parent.size * Math.pow(BoltThinning, k + 1);
    }
  }
  var reach = strikeFlashReach(main, nearness);
  var frames = lightningFrames(lightningPlayTime());
  // how many times the channel and the flash, and the branches, flicker as they fade
  var flickers = StrikeFlickerMax - StrikeFlickerMin + 1;
  var flickerChannel = StrikeFlickerMin + Math.floor(Math.random() * flickers);
  var flickerBranches = StrikeFlickerMin + Math.floor(Math.random() * flickers);
  var touch = Math.min(frames - 1, Math.max(1, Math.round(frames * StrikeMeetAt)));
  return {
    nearness: nearness,
    size: F,
    main: main,
    leaders: leaders,
    // the ways down and up (the main channel is the two joined)
    routes: routes,
    branches: branches,
    groundX: x1,
    groundY: ground,
    flashReach: reach,
    flashBand: strikeFlashBand(reach),
    flashWidths: flashLayerWidths(reach),
    frames: frames,
    // the whole periods of the flicker in the channel's and the branches' fades
    flickerChannel: flickerChannel,
    flickerBranches: flickerBranches,
    // the frame in which the leaders meet (StrikeMeetAt), and the frame by which the
    // branches are gone (BranchFadeEnd)
    touch: touch,
    branchEnd: Math.min(frames, Math.max(touch + 1, Math.round(frames * BranchFadeEnd))),
    frame: 0,
    // this frame: how far the leaders have grown (0-1, 1 when they have met), how
    // bright the channel and the branches are, how bright the flash is (0-1) and
    // how far it still reaches (1 at the meeting, closing in to 0)
    grown: 0,
    light: 0,
    branchLight: 0,
    flash: 0,
    flashSize: 0,
  };
}

// how bright the channel and the flash are after the leaders met, s from 0 (the
// meeting) to 1 (the end of the strike): a logarithmic fade, much faster at first
// and then slower, down to nothing at the end
function strikeFade(s) {
  s = Math.max(0, Math.min(1, s));
  return 1 - Math.log(1 + StrikeFadeCurve * s) / Math.log(1 + StrikeFadeCurve);
}

// the part of a jagged line from one part (0-1) of its length to another; gives the
// corner points
function sliceOfLine(points, from, to) {
  var head = partOfLine(points, to);
  if (from <= 0) {
    return head;
  }
  var headLength = lineLength(head);
  var keep = headLength > 0 ? (to - from) * lineLength(points) / headLength : 0;
  return reversedLine(partOfLine(reversedLine(head), keep));
}

// the parts of a line of the bolt grown so far (up to a part of its length), one
// between each two of its forks: [corner points, false, size, generation, is it a
// leader, the line, which part]. Part k is the line's size thinned k times by
// BoltThinning, rounded (0.5 up), from the font size of the rain at the strike's
// distance (F, fontSizeAt): the leaders start at F / 2, a branch at its parent's size
// after the fork. A leader's parts are at least 1 (so the leaders reach the meeting
// point), a branch ends where its size rounds to 0. It is the size of the characters
// bolt's characters, and the width of the glowing bolt's core (see glDrawBolt)
function boltLineParts(line, grown, lines) {
  var from = 0;
  for (var k = 0; k <= line.forks.length && from < grown; k++) {
    var to = Math.min(grown, k < line.forks.length ? line.forks[k] : 1);
    var size = Math.floor(line.size * Math.pow(BoltThinning, k) + 0.5);
    if (line.leader) {
      size = Math.max(1, size);
    } else if (size <= 0) {
      return;
    }
    if (to > from) {
      lines.push([sliceOfLine(line.points, from, to), false, size, line.generation, line.leader, line, k]);
    }
    from = to;
  }
}

// the lines of the bolt in this frame (see boltLineParts; the main channel: [corner
// points, true, F rounded, -1, false]). Until the leaders meet there is no main
// channel yet: the leaders are drawn like the branches (white), thinner after each
// fork; the main channel comes first in the list. Branches are left out once they are
// gone, and parts of size 0 always
function strikeLines(strike) {
  var lines = [];
  var grown = strike.grown;
  if (grown >= 1) {
    lines.push([strike.main, true, Math.floor(strike.size + 0.5), -1, false]);
  } else {
    // (each part of the route grows over its own part of the time)
    for (var l = 0; l < strike.leaders.length; l++) {
      var leader = strike.leaders[l];
      var part = (grown - leader.start) / (leader.end - leader.start);
      if (part > 0) {
        boltLineParts(leader, Math.min(1, part), lines);
      }
    }
  }
  if (strike.branchLight > 0.01) {
    for (var b = 0; b < strike.branches.length; b++) {
      var branch = strike.branches[b];
      var part = (Math.min(1, grown) - branch.start) / (branch.end - branch.start);
      if (part > 0) {
        boltLineParts(branch, Math.min(1, part), lines);
      }
    }
  }
  return lines;
}

// do strikes come with the music now? With React to music, unless the idle
// animation plays (no sound for Timeout in seconds), as for the rain
function musicDriven() {
  return useMusic && (!MusicTimeout || !useMusicTimeout);
}

// the music's loudness in this frame (see LightningMusicPeak); true when the frame
// before was a peak loud enough for a strike
function musicPeak() {
  var loudness = 0;
  if (FrequencyArray && FrequencyArray.length) {
    for (var i = 0; i < FrequencyArray.length; i++) {
      loudness += FrequencyArray[i];
    }
    loudness = loudness / FrequencyArray.length;
  }
  var threshold = LightningMusicPeakLeast -
    (LightningMusicPeakLeast - LightningMusicPeak) * LightningMusicSensitivity;
  var before = MusicLoudness[0];
  var earlier = MusicLoudness[1];
  MusicLoudness[1] = before;
  MusicLoudness[0] = loudness;
  // the frame before: a peak, scored by its loudness and its rise above the floor,
  // and by the tempo
  var score = LightningMusicLoud * before + LightningMusicSudden * Math.max(0, before - MusicFloor);
  score *= tempoFactor() * energyFactor() * brightnessFactor();
  var peak = LightningMusicSensitivity > 0 && before > earlier && before >= loudness && score >= threshold &&
    Date.now() - LastMusicStrike >= LightningMusicGap * 1000;
  if (useDebug) {
    // for the music readout
    DebugLoudness = loudness;
    DebugThreshold = threshold;
    DebugScoreMost = Math.max(DebugScoreMost, score);
  }
  // the floor follows the quiet moments (the step is limited, so it does not jump
  // after the wallpaper was paused)
  var now = Date.now();
  var seconds = Math.min(0.5, Math.max(0, (now - LastMusicTime) / 1000));
  LastMusicTime = now;
  if (loudness < MusicFloor) {
    MusicFloor = loudness;
  } else {
    MusicFloor += (loudness - MusicFloor) * (1 - Math.exp(-seconds / LightningMusicFloorRise));
  }
  followTempo(seconds, now);
  // the loudness of the part playing now and of the song so far, and how long
  // there has been sound
  if (loudness > 0.01) {
    followBrightness(seconds);
    MusicPart += (loudness - MusicPart) * (1 - Math.exp(-seconds / LightningEnergyPart));
    MusicSong += (loudness - MusicSong) * (1 - Math.exp(-seconds / LightningEnergySong));
    MusicHeard += seconds;
  }
  return peak;
}

// the music's brightness in this frame (see LightningMusicBrightness): the part of
// each channel's loudness above its lowest quarter of the frequencies, averaged
function followBrightness(seconds) {
  if (!FrequencyArray || FrequencyArray.length < 8) {
    return;
  }
  var half = Math.floor(FrequencyArray.length / 2);
  var low = Math.floor(half / 4);
  var all = 0;
  var high = 0;
  for (var i = 0; i < half; i++) {
    var v = FrequencyArray[i] + FrequencyArray[half + i];
    all += v;
    if (i >= low) {
      high += v;
    }
  }
  if (all > 0) {
    MusicBrightness += (high / all - MusicBrightness) * (1 - Math.exp(-seconds / LightningBrightnessSpan));
  }
}

// the factor a peak's score is multiplied by for the music's brightness (see
// LightningMusicBrightness): 1 at weight 0, and before there was sound
function brightnessFactor() {
  if (!(LightningMusicBrightness > 0) || MusicHeard < LightningBrightnessSpan) {
    return 1;
  }
  var bright = clamp(0, 1, (MusicBrightness - LightningBrightnessLow) / (LightningBrightnessHigh - LightningBrightnessLow));
  var factor = LightningBrightnessLeast + (LightningBrightnessMost - LightningBrightnessLeast) * bright;
  return 1 + (factor - 1) * LightningMusicBrightness;
}

// an average that started from nothing, divided by how much of its span (seconds)
// is filled after MusicHeard seconds of sound
function energyAverage(value, span) {
  return value / Math.max(0.001, 1 - Math.exp(-MusicHeard / span));
}

// the factor a peak's score is multiplied by for the energy of the part of the song
// playing now (see LightningMusicEnergy): 1 at weight 0
function energyFactor() {
  if (!(LightningMusicEnergy > 0) || MusicHeard < LightningEnergyWarmUp || !(MusicSong > 0.001)) {
    return 1;
  }
  var part = energyAverage(MusicPart, LightningEnergyPart);
  var song = energyAverage(MusicSong, LightningEnergySong);
  var factor = clamp(LightningEnergyLeast, LightningEnergyMost, 1 + LightningEnergySlope * (part / song - 1));
  return 1 + (factor - 1) * LightningMusicEnergy;
}

// the beats of this frame (the rise of the bass), and every MusicTempoEvery
// seconds a new estimate of the tempo (see MusicOnsets)
function followTempo(seconds, now) {
  var bass = 0;
  if (FrequencyArray && FrequencyArray.length >= 16) {
    var half = Math.floor(FrequencyArray.length / 2);
    for (var i = 0; i < 8; i++) {
      bass += FrequencyArray[i] + FrequencyArray[half + i];
    }
    bass /= 16;
  }
  MusicOnsets[MusicOnsetAt] = Math.max(0, bass - MusicBass);
  MusicBass = bass;
  MusicOnsetAt = (MusicOnsetAt + 1) % MusicOnsetCount;
  MusicOnsetFilled = Math.min(MusicOnsetCount, MusicOnsetFilled + 1);
  // the frame interval, for turning frames into beats a minute
  if (seconds > 0) {
    MusicFrameMs += (seconds * 1000 - MusicFrameMs) * 0.05;
  }
  if (now >= MusicTempoNext) {
    MusicTempoNext = now + MusicTempoEvery * 1000;
    estimateTempo();
  }
}

// the rise of the bass k frames ago (0: this frame)
function onsetAgo(k) {
  return MusicOnsets[(MusicOnsetAt - 1 - k + 2 * MusicOnsetCount) % MusicOnsetCount];
}

// the tempo and how clear the beat is, from the autocorrelation of the rises of
// the bass: the period (in frames, between 50 and 200 beats a minute) at which
// they repeat best, refined between whole frames. The rises are blurred over
// neighbouring frames first, so a beat that falls between frames (170 beats a
// minute at 24 fps is 8.5 frames) still lines up; and of periods that repeat
// almost as well (MusicTempoOctave of the best), the shortest is taken, so a beat
// is not taken for one every two beats
var MusicTempoOctave = 0.7;
function estimateTempo() {
  var n = MusicOnsetFilled;
  var shortest = Math.max(2, Math.floor(60000 / 200 / MusicFrameMs));
  var longest = Math.min(n - 8, Math.ceil(60000 / 50 / MusicFrameMs));
  if (longest <= shortest + 1) {
    MusicTempo = 0;
    MusicBeat = 0;
    return;
  }
  var o = MusicOnsetWork;
  for (var k = 0; k < n; k++) {
    var before = k > 0 ? onsetAgo(k - 1) : onsetAgo(k);
    var after = k + 1 < n ? onsetAgo(k + 1) : onsetAgo(k);
    o[k] = 0.25 * before + 0.5 * onsetAgo(k) + 0.25 * after;
  }
  var mean = 0;
  for (var k = 0; k < n; k++) {
    mean += o[k];
  }
  mean /= n;
  var power = 0;
  for (var k = 0; k < n; k++) {
    power += (o[k] - mean) * (o[k] - mean);
  }
  power /= n;
  if (!(power > 1e-9)) {
    MusicTempo = 0;
    MusicBeat = 0;
    return;
  }
  // how well the rises repeat at each period (a correlation, -1 to 1)
  var values = [];
  var top = -2;
  for (var lag = shortest - 1; lag <= longest + 1; lag++) {
    var sum = 0;
    for (var k = 0; k + lag < n; k++) {
      sum += (o[k] - mean) * (o[k + lag] - mean);
    }
    var value = sum / (n - lag) / power;
    values.push(value);
    if (lag >= shortest && lag <= longest) {
      top = Math.max(top, value);
    }
  }
  // the shortest period that repeats almost as well as the best, at a peak
  var best = shortest;
  var bestValue = -2;
  for (var lag = shortest; lag <= longest; lag++) {
    var v = values[lag - shortest + 1];
    if (v >= MusicTempoOctave * top && v >= values[lag - shortest] && v >= values[lag - shortest + 2]) {
      best = lag;
      bestValue = v;
      break;
    }
  }
  if (bestValue < -1) {
    bestValue = top;
  }
  // between whole frames: the top of a parabola through the best period and its
  // neighbours
  var a = values[best - shortest];
  var b = values[best - shortest + 1];
  var c = values[best - shortest + 2];
  var shift = a - 2 * b + c < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / (a - 2 * b + c))) : 0;
  MusicTempo = 60000 / ((best + shift) * MusicFrameMs);
  MusicBeat = Math.max(0, Math.min(1, bestValue));
}

// the factor a peak's score is multiplied by for the music's tempo (see
// LightningMusicTempo): 1 at weight 0
function tempoFactor() {
  if (!(LightningMusicTempo > 0)) {
    return 1;
  }
  // how fast (0-1), less where there is no clear beat
  var fast = clamp(0, 1, (MusicTempo - LightningTempoSlow) / (LightningTempoFast - LightningTempoSlow)) *
    Math.min(1, MusicBeat / 0.3);
  var factor = LightningTempoSlowest + (LightningTempoFastest - LightningTempoSlowest) * fast;
  return 1 + (factor - 1) * LightningMusicTempo;
}

// was the last frame driven by the music? (to plan a random wait again after it)
var LightningWasMusic = false;

// start, play and end strikes; called once a frame, before the queued characters
// are drawn (the characters bolt adds to them)
function updateLightning() {
  BoltStrikes.length = 0;
  if (!useLightning) {
    Strikes.length = 0;
    return;
  }
  // a new strike: with the music on its peaks, otherwise after random waits of
  // Lightning frequency seconds on average. A start that is not possible now (too
  // many playing, or no free place) waits for the next frame
  var music = musicDriven();
  // the music is followed once for every audio array (Wallpaper Engine sends about
  // 30 a second), whatever the frame rate
  var fresh = AudioArrays != AudioArraysSeen;
  AudioArraysSeen = AudioArrays;
  var peak = useMusic && fresh ? musicPeak() : false;
  if (LightningWasMusic && !music) {
    // the idle animation starts: random strikes again, after a random wait
    scheduleLightning();
  }
  LightningWasMusic = music;
  // Strike now (Debug mode): a strike at Strike distance, as soon as one can start
  if (!useDebug) {
    DebugStrikePending = false;
  }
  var forced = DebugStrikePending;
  var start = forced || (music ? peak : Date.now() >= NextLightning);
  if (start && Strikes.length < MaxStrikes) {
    var strike = newStrike(forced ? DebugStrikeNearness : -1);
    if (strike) {
      // kept from the furthest to the nearest
      var at = 0;
      while (at < Strikes.length && Strikes[at].nearness <= strike.nearness) {
        at++;
      }
      Strikes.splice(at, 0, strike);
      if (forced) {
        DebugStrikePending = false;
      } else if (music) {
        LastMusicStrike = Date.now();
        debugMusicStrike();
      } else {
        scheduleLightning();
      }
    }
  }
  for (var i = 0; i < Strikes.length; i++) {
    updateStrike(Strikes[i]);
  }
  // the ones that have ended
  for (var i = Strikes.length - 1; i >= 0; i--) {
    if (Strikes[i].frame >= Strikes[i].frames) {
      Strikes.splice(i, 1);
    }
  }
}

// one frame of a strike
function updateStrike(s) {
  if (s.frame < s.touch) {
    // the leaders grow towards each other: thin, pure white branches
    s.grown = (s.frame + 1) / (s.touch + 1);
    s.light = 0;
    s.branchLight = 1;
    s.flash = 0;
    s.flashSize = 0;
  } else {
    // met: the thick main channel and the flash fade out, the branches by the
    // branchEnd frame, each flickering as it fades (dimming and brightening again,
    // see strikeFlicker); the flash closes in on the channel as it fades (by the fade
    // alone, without the flicker), so its outer glow goes first
    var after = (s.frame - s.touch) / Math.max(1, s.frames - s.touch);
    var fade = strikeFade(after);
    var branchAfter = (s.frame - s.touch) / (s.branchEnd - s.touch);
    s.grown = 1;
    s.light = fade * strikeFlicker(after, s.flickerChannel);
    s.branchLight = strikeFade(branchAfter) * strikeFlicker(branchAfter, s.flickerBranches);
    s.flash = s.light;
    s.flashSize = Math.max(0.001, Math.sqrt(fade));
    if (s.frame == s.touch) {
      // the water where it strikes: a strong ring
      addRipple(s.groundX, s.groundY, s.nearness, 3);
    }
  }
  if (useCharacterBolt) {
    // drawn on the shown copy of this frame only (see presentWithBolt)
    BoltStrikes.push(s);
  }
  s.frame++;
}

// the strikes of this frame whose characters bolt is drawn: never into the screen image
// (where they would fade with the rain's trail, longer than a short strike), only into
// the copy of it that is shown (glComposeShown), so the characters are gone with the
// strike. At most MaxStrikes
var BoltStrikes = [];

// show the frame with the characters bolt of this frame's strikes on a copy of the
// screen image (see BoltStrikes)
function presentWithBolt() {
  if (!useGL) {
    renderPresent();
    return;
  }
  glComposeShown(0, false);
  renderPresent();
  glSwapShown();
  // (a gliding frame later must not show this copy again)
  GL.shownReady = false;
}

// the characters bolt: pure white rain characters along the bolt's lines, in the size
// of each part of a line (see boltLineParts: the main channel in the font size of the
// rain at the strike's distance, the leaders from half of it, thinning to 3/4 at each
// fork), 0.7 of their size apart on the main channel, 0.6 on the others. They
// fade with the bolt. Like the rain, they glow, are fogged, are reflected and fade
// out, which leaves a trail
function queueCharacterBolt(s) {
  var lines = strikeLines(s);
  var bloom = nearnessCurve(s.nearness);
  for (var l = 0; l < lines.length; l++) {
    var points = lines[l][0];
    var main = lines[l][1];
    var cell = Math.min(256, lines[l][2]);
    var spacing = Math.max(1, cell * (main ? 0.7 : 0.6));
    var opacity = Math.max(0.08, main ? s.light : s.branchLight);
    var carry = 0;
    for (var i = 0; i + 3 < points.length; i += 2) {
      var ax = points[i], ay = points[i + 1];
      var dx = points[i + 2] - ax, dy = points[i + 3] - ay;
      var length = Math.sqrt(dx * dx + dy * dy);
      var t = carry;
      while (t <= length) {
        var f = length > 0 ? t / length : 0;
        var cx = ax + dx * f, cy = ay + dy * f;
        var column = particleColumn(cx);
        // the cell whose middle is on the line
        var row = (cy - cell / 2) / cell + 1;
        var glyph = queueDrop(cx - cell / 2, row, opacity, cell, column, -1, 1);
        if (glyph >= 0) {
          QueueBloom[QueueCount - 1] = bloom * opacity * (main ? 1 : BoltCharacterBloom);
          QueueNear[QueueCount - 1] = s.nearness;
          if (useReflectionPlane) {
            reflectCharacter(cx, row * cell, cell / font_size, glyph, column, opacity, s.nearness, s.groundY);
          }
        }
        t += spacing;
      }
      carry = t - length;
    }
  }
}

chooseRenderer();

//drawing the characters; steps is the number of rain steps shown in this frame
//(more than 1 when the frames are slower than the rain speed, 0 in a frame that
//does not move the rain, see frameSteps)
function draw(steps) {
  // fading of this frame: the same as fading once for every step
  FrameFade =
    steps == 0 ? 0 : steps == 1 ? tailLength : 1 - Math.pow(1 - tailLength, steps);
  if (!useGL) {
    // no WebGL (or the graphics driver was reset): nothing to draw on
    return;
  }
  // the fog layers of this frame, used when the picture is shown
  glFog();
  // did the screen image change in this frame? (see presentGliding)
  var changed = steps > 0;

  if (fontsize_changed) {
    fontsize_changed = false;
    //recalculate columns
    columns = ScreenWidth / font_size;
    ColumnCount = Math.ceil(columns);
    //start the drops again
    resetDrops();

    //Black BG for the canvas
    renderClear();
    if (RainSteadyStart) {
      // (Debug mode's Steady start) with the trails the settled rain has
      warmRain();
      RainSteadyStart = false;
    }
    changed = true;
  }

  if (steps > 0) {
    drawRainSteps(steps);
  }

  // lightning: once a frame, whatever the number of rain steps (the characters bolt
  // is drawn on the shown copy, see BoltStrikes)
  updateLightning();

  // draw the drops collected above
  if (QueueCount > 0) {
    flushDrops();
    changed = true;
  }

  // move and draw the splashes by the rain steps; the water simulation follows the
  // same time, or the time of the frame (see frameSteps)
  if (steps > 0) {
    updateParticles((steps * speed) / 1000.0);
  }
  WaveTime += FrameWaterSeconds >= 0 ? FrameWaterSeconds : (steps * speed) / 1000.0;
  if (steps > 0 && ParticleCount > 0) {
    renderParticles();
  }

  // draw the reflections collected above
  if (useReflectionPlane && (steps > 0 || ReflectCount > 0)) {
    flushReflections();
    changed = true;
  }

  // the text keeps its characters, so with a moving color wave it collects
  // many different colors; recolor it to the current color of the rain
  // (done by the present shader, see glPresent)
  RecolorActive =
    useDynamicColorwave && !useHighContrastText && (Clockbool || use_Message);

  // show the frame on the screen; a gliding rain shows the drops part of a step on,
  // a characters bolt is drawn on a copy (see BoltStrikes)
  if (rainGlides()) {
    presentGliding(changed);
  } else if (BoltStrikes.length > 0) {
    presentWithBolt();
  } else {
    renderPresent();
  }

  if (useMusicTimeout) {
    // when was the last sound?
    if (!isSilent) {
      // just now
      MusicTimeout = false;
      LastSoundTime = Date.now();
    } else if (Date.now() - LastSoundTime > MusicTimeoutTime * 1000) {
      MusicTimeout = true;
    }
  }
}

// the rain steps of a frame: fade the picture, draw the clock and the message, the
// colors of the columns, and move the drops (queued, drawn by flushDrops)
function drawRainSteps(steps) {
  // fading that is left to do for characters of each step
  var StepFade = 1 - tailLength;

  // fade out characters, except the lit pixels of the clock and the message (they
  // can both be shown, each at its own place)
  beginFade(FrameFade);
  LitRectCount = 0;
  TextBlocks.length = 0;
  var textBoxes = [];
  if (Clockbool) {
    var today = new Date();
    var h = today.getHours();
    var m = today.getMinutes();

    // format hours and minutes
    if (Clock12h && h > 12) {
      h = h % 12;
      if (h == 0) {
        h = 12;
      }
    }
    if (h < 10) {
      h = "0" + h;
    }
    if (m < 10) {
      m = "0" + m;
    }
    var ClockText = h + ":" + m;
    // the width does not change with the time: measured with the widest digits
    var size = ClockRelativeSize ? relativeTextSize("88:88", ClockWidthPercent) : Clocksize;
    if (size > 0) {
      var ClockDrawPosX = ClockPosX;
      var ClockDrawPosY = ClockPosY;
      if (use_ClockSnap) {
        var ClockSnapPosition = percentagePosition(
          ClockText,
          size,
          ClockPercentagePosX,
          ClockPercentagePosY,
        );
        ClockDrawPosX = ClockSnapPosition[0];
        ClockDrawPosY = ClockSnapPosition[1];
      }
      var start = LitRectCount;
      ClockPosition = drawString(ClockText, size, ClockDrawPosX, ClockDrawPosY, ClockShiftX, ClockShiftY);
      textBoxes.push(ClockPosition);
      TextBlocks.push([start, LitRectCount - start]);
    }
  }
  if (use_Message) {
    var size = MessageRelativeSize ? relativeTextSize(Messagetext, MessageWidthPercent) : Messagesize;
    if (size > 0) {
      var MessageDrawPosX = MessageposX;
      var MessageDrawPosY = MessageposY;
      if (use_MessageSnap) {
        var MessageSnapPosition = percentagePosition(
          Messagetext,
          size,
          MessagePercentagePosX,
          MessagePercentagePosY,
        );
        MessageDrawPosX = MessageSnapPosition[0];
        MessageDrawPosY = MessageSnapPosition[1];
      }
      var start = LitRectCount;
      MessagePosition = drawString(Messagetext, size, MessageDrawPosX, MessageDrawPosY, MessageShiftX, MessageShiftY);
      textBoxes.push(MessagePosition);
      TextBlocks.push([start, LitRectCount - start]);
    }
  }
  // the rest of the screen, around the clock and the message
  fadeAround(textBoxes);
  endFade();

  // move the color wave from left to right
  var WaveNow = Date.now();
  // limit the step so the wave doesn't jump after the wallpaper was paused
  var WaveSeconds = Math.min(0.5, (WaveNow - LastWaveTime) / 1000.0);
  LastWaveTime = WaveNow;
  if (useDynamicColorwave) {
    // WaveSpeed is in screen widths per second, WaveWidth in screen widths per cycle
    WavePhase = (WavePhase + (WaveSpeed * WaveSeconds) / WaveWidth) % 1;
  }

  // assumption that there is no music
  isSilent = true;

  // the color of every column (and how likely its drops start again)
  for (var i = 0; i < ColumnCount; i++) {
    var chance = -1; // the music's chance for this column (see rainTarget), -1 without
    var lightness = 50; // lightness of the character of the current drop
    if (useMusic) {
      // map a sound-array element to the current column
      var frequency = Math.floor(
        i * (FrequencyArray.length / 2 / ColumnCount),
      );

      // read volume level of both stereo channels
      var Volume =
        FrequencyArray[frequency] +
        FrequencyArray[frequency + FrequencyArray.length / 2];

      // is there sound?
      if (Volume > 0.01) {
        isSilent = false;
      }

      if (!MusicTimeout || !useMusicTimeout) {
        // the chance is the volume (likely to be between 0.0 and 1.0) cubed
        chance = clamp(0, 1, Volume * Volume * Volume * AudioMultiplier);
        // lightness depends on volume
        lightness = Math.floor(clamp(40, 80, Volume * 100 * AudioMultiplier));
      }
    }

    // position of this column in the color wave (0 to 1, wraps around)
    var WavePosition =
      (((i / ColumnCount / WaveWidth - WavePhase) % 1) + 1) % 1;

    // calculate gradient between colors
    if (useCustomColors) {
      var CustomColor;
      if (useDynamicColorwave) {
        // wrap Color 4 back into Color 1
        CustomColor = gradientColor(WavePosition, [
          ColorValue1,
          ColorValue2,
          ColorValue3,
          ColorValue4,
          ColorValue1,
        ]);
      } else {
        CustomColor = gradientColor(i / ColumnCount, [
          ColorValue1,
          ColorValue2,
          ColorValue3,
          ColorValue4,
        ]);
      }

      ctx.fillStyle =
        "rgba(" +
        Math.floor(CustomColor[0]).toString() +
        "," +
        Math.floor(CustomColor[1]).toString() +
        "," +
        Math.floor(CustomColor[2]).toString() +
        ",1.0)";
    }
    // no custom colors
    else {
      if (useDynamicColorwave) {
        Color = (WavePosition * 360 + 347) % 360;
      } else {
        Color = ((i / ColumnCount) * 360 + 347) % 361;
      }
      ctx.fillStyle =
        "hsl(" +
        Math.floor(Color).toString() +
        ", 100%," +
        lightness.toString() +
        "%)";
    }

    // remember the color of this column for drawing the drops and recoloring the text
    ColumnColors[i] = ctx.fillStyle;
    storeColumnRGB(i, ColumnColors[i]);

    ColumnChance[i] = chance;
  }

  // how many drops fall in this frame
  RainTarget = rainTarget();
  balanceDrops();

  // the drops, a step at a time; each falls one row of its own font size per step
  // until it passes where it lands (its line on the plane, or the bottom of the
  // screen); in the step after that its head goes back to the rain color and it
  // ends, and starts again after a wait above the screen (see spawnRow; it waits only
  // as a count, see SpawnWheel), unless it is one of the drops finishing their fall
  // (see balanceDrops) or more drops fall than RainTarget. New drops wait above the
  // screen too (spawnDrops), and the drops whose wait ends with a step come in at the
  // top (comeIn). (Backwards, as ending a drop moves the last one into its place)
  for (var step = 0; step < steps; step++) {
    // characters of earlier steps would have been faded by the later steps
    var fade = steps == 1 ? 1 : Math.pow(StepFade, steps - 1 - step);
    // the drops that enter the screen in the next step (for spawnDrops)
    var entering = 0;
    for (var d = RainCount - 1; d >= 0; d--) {
      var size = RainSize[d];
      var x = RainX[d] + RainShiftX;
      // where the drop lands: the bottom of the screen, or its line on the plane
      var ground = groundY(RainNear[d]);

      if (RainRow[d] * size > ground) {
        // past its line since the step before
        settleHead(d, fade);
        if (RainDrain[d] || RainCount + RainPending - RainDraining > RainTarget) {
          removeDrop(d);
        } else {
          // it starts again after a random wait above the screen (see spawnRow), with
          // a new size, distance and place when it comes in
          var wait = -spawnRow(d);
          removeDrop(d);
          entering += waitToComeIn(wait);
        }
        continue;
      }

      // Print characters
      drawDrop(d, fade, ground);

      // a drop that reaches the plane in this step splashes and makes a ripple
      if (
        planeActive() &&
        RainRow[d] * size <= ground &&
        (RainRow[d] + 1) * size > ground
      ) {
        dropLanded(x + size / 2, ground, RainNear[d], size);
      }

      //incrementing Y coordinate
      RainRow[d]++;
      if (RainRow[d] == 1) {
        // a new drop from above enters the screen
        RainEntries++;
      }
    }
    // the drops whose wait ends with this step come in at the top (and enter the
    // screen in the next step)
    entering += comeIn();
    spawnDrops(entering);
    SpawnAt = (SpawnAt + 1) % Math.max(1, SpawnWheel.length);
  }
}


// Gliding rain: when the rain moves more often than once a step (see rainGlides),
// the screen image keeps only the whole steps, exactly as without gliding. What is
// shown is a copy of it with the drop heads, the splashes and their reflections part
// of a step (RainPhase) further on (see glComposeShown); the copy is made again in
// each frame that moves the rain, and the next whole step draws over what it showed.
// Gliding is true while the copy is drawn
var Gliding = false;
// copies of the splash arrays, to move the splashes for the copy and back
var GlideParticleArrays = null;

// show the frame with the gliding rain: the copy, made again when the rain moved
// or the screen image changed (changed), otherwise the one already made
function presentGliding(changed) {
  if (!useGL) {
    return;
  }
  var bolt = BoltStrikes.length > 0;
  if (changed || bolt || !GL.shownReady || GL.shownPhase != RainPhase) {
    glComposeShown(RainPhase, true);
  } else {
    glSwapShown();
  }
  renderPresent();
  glSwapShown();
  if (bolt) {
    // (the copy has this frame's characters bolt: not to be shown again)
    GL.shownReady = false;
  }
}

// the drop heads part of a step (phase, 0 to 1) further down: the character of each
// head is drawn again where it was stamped, in the rain color (as the next step will
// do), and brightened, phase of a row lower (not below the plane), with its reflection
function queueGlidingDrops(phase) {
  for (var d = 0; d < RainCount; d++) {
    var glyph = RainGlyph[d];
    if (glyph < 0) {
      continue;
    }
    var size = RainSize[d];
    var row = RainRow[d] - 1;
    var x = RainX[d] + RainShiftX;
    var nearness = RainNear[d];
    var column = particleColumn(x + size / 2);
    var depth = nearnessCurve(nearness);
    var lit = isLit(x + size / 2, (row - 0.5) * size);
    if (queueDrop(x, row, 1, size, column, glyph, 0) >= 0) {
      QueueBloom[QueueCount - 1] = depth;
      QueueNear[QueueCount - 1] = lit ? 1 : nearness;
    }
    var ground = groundY(nearness);
    var at = row + phase;
    if (planeActive() && at * size > ground) {
      continue;
    }
    lit = isLit(x + size / 2, (at - 0.5) * size);
    if (queueDrop(x, at, 1, size, column, glyph, HeadBrightness * depth) >= 0) {
      QueueBloom[QueueCount - 1] = depth;
      QueueNear[QueueCount - 1] = lit ? 1 : nearness;
      if (useReflectionPlane) {
        reflectCharacter(x + size / 2, at * size, size / font_size, glyph, column, 1, nearness, ground);
      }
    }
  }
}

// keep the splash arrays, to move the splashes for the copy only
function keepParticles() {
  if (!GlideParticleArrays) {
    GlideParticleArrays = [];
    for (var a = 0; a < ParticleArrays.length; a++) {
      GlideParticleArrays.push(new ParticleArrays[a].constructor(MaxParticles));
    }
  }
  for (var a = 0; a < ParticleArrays.length; a++) {
    GlideParticleArrays[a].set(ParticleArrays[a].subarray(0, ParticleCount));
  }
}

// back to the kept splash arrays
function restoreParticles() {
  for (var a = 0; a < ParticleArrays.length; a++) {
    ParticleArrays[a].set(GlideParticleArrays[a].subarray(0, ParticleCount));
  }
}

// the splashes seconds further on, as updateParticles moves them, but without
// changing their characters (no random numbers are taken from the rain), making
// ripples or removing them: the ones that would be gone are put out of sight
function moveParticlesBy(seconds) {
  var unit = splashDepthUnit();
  var furthest = unit * (1 / planeScale() - 1);
  for (var n = 0; n < ParticleCount; n++) {
    var scale = splashScale(n, 1 / (1 + ParticleZ[n] / unit));
    ParticleVH[n] -= ParticleGravity[n] * seconds;
    ParticleH[n] += ParticleVH[n] * seconds;
    ParticleX[n] += ParticleVX[n] * scale * seconds;
    ParticleZ[n] = Math.min(furthest, ParticleZ[n] + ParticleVZ[n] * seconds);
    var gone = 1 + ParticleZ[n] / unit < 0.1;
    if (!gone) {
      splashLook(n);
    }
    if (gone || (ParticleVH[n] < 0 && ParticleH[n] <= 0)) {
      ParticleY[n] = -100000;
    }
  }
}

// color at a position (0 to 1) of a gradient through the given colors,
// passing through the sum of each pair of neighbouring colors:
// Color A >> Color A + Color B >> Color B >> ...
function gradientColor(position, colors) {
  var segments = 2 * (colors.length - 1);
  var segment = Math.min(Math.floor(position * segments), segments - 1);
  var amount = position * segments - segment;
  var colorA = colors[Math.floor(segment / 2)];
  var colorB = colors[Math.floor(segment / 2) + 1];
  var result = [];
  for (var channel = 0; channel < 3; channel++) {
    if (segment % 2 == 0) {
      // Color A >> Color A + Color B
      result[channel] = colorA[channel] + lerp(0, colorB[channel], amount);
    } else {
      // Color A + Color B >> Color B
      result[channel] = colorB[channel] + lerp(colorA[channel], 0, amount);
    }
    result[channel] = clamp(0, 255, result[channel]);
  }
  return result;
}

// smallest font size of the drops (at most Font size Max)
function fontSizeMin() {
  return Math.min(FontSizeMin, font_size);
}

// how many drops there can be (DropCapacity): Density per column of Font size Max,
// and more for smaller sizes, as more of them fit across the screen
function rainCount() {
  var minSize = fontSizeMin();
  // average of 1 / font size over the sizes picked by newDropLook
  var perPixel =
    font_size > minSize
      ? (1 / minSize - 1 / font_size) / Math.log(font_size / minSize)
      : 1 / font_size;
  return Math.max(1, Math.round(RainDensity * ScreenWidth * perPixel));
}

// start all drops again
// start all drops again: from a clean screen (it fills at the settled rate, see
// spawnDrops), or with Debug mode's Steady start as the settled rain
function resetDrops() {
  DropCapacity = rainCount();
  RainCount = 0;
  RainDrain.length = 0;
  RainDraining = 0;
  sizeSpawnWheel();
  for (var w = 0; w < SpawnWheel.length; w++) {
    SpawnWheel[w] = 0;
  }
  RainPending = 0;
  // the screen fills at the settled rate (see spawnDrops)
  RainFilling = true;
  RainFillCredit = 0;
  RainFillArrivals = 0;
  if (useDebug && DebugSteadyStart) {
    RainFilling = false;
    RainSteadyStart = true;
    RainCount = Math.round(DropCapacity * RainScale);
    for (var d = 0; d < RainCount; d++) {
      newDrop(d, true);
    }
    // the ones above the screen wait to come in instead (see SpawnWheel): a drop k rows
    // above comes in at the top with the k-th step from now. (Backwards, as ending a
    // drop moves the last one into its place)
    for (var d = RainCount - 1; d >= 0; d--) {
      if (RainRow[d] < 0) {
        var wait = -RainRow[d];
        removeDrop(d);
        SpawnWheel[(SpawnAt + wait - 1) % SpawnWheel.length]++;
        RainPending++;
      }
    }
  }
}

// Density changed: when it went up, the new drops come in at the settled rate of the
// new density, as from a clean screen (RainFilling, see spawnDrops; all at once they
// came in as a burst, then a dip); when it went down, drops end where they land (see
// balanceDrops)
function resizeDrops() {
  DropCapacity = rainCount();
}

// a new font size and distance for drop d.
// Smaller sizes are picked more often, in proportion to how many fit across the
// screen
function newDropLook(d) {
  var minSize = fontSizeMin();
  var size = font_size;
  if (font_size > minSize) {
    size = Math.round(minSize * Math.pow(font_size / minSize, Math.random()));
  }
  RainSize[d] = size;
  // the distance comes from the font size, with random decimals within it; with
  // a small font size range (less than 10) it is partly random in the whole range,
  // the more the smaller the range (all random when all sizes are the same)
  var range = font_size - minSize;
  // (the decimals count down, so the largest drops reach Font size Max, the
  // bottom of the screen: nearness 1)
  var bySize = range > 0 ? (size - minSize + 1 - Math.random()) / (range + 1) : 0;
  var weight = Math.min(1, range / 10);
  RainNear[d] = weight * bySize + (1 - weight) * Math.random();
}
// drop d starts again: a new look and a random place on the grid of its size, at
// the top; a new drop (first) above the screen (see spawnRow), or, with Debug mode's
// Steady start, as in the settled rain (see steadyLook)
function newDrop(d, first) {
  var steady = first && useDebug && DebugSteadyStart && RainSteadyStart;
  if (steady) {
    steadyLook(d);
  } else {
    newDropLook(d);
  }
  var size = RainSize[d];
  var places = Math.max(1, Math.floor(ScreenWidth / size));
  RainX[d] = Math.floor(Math.random() * places) * size;
  RainRow[d] = !first ? 0 : steady ? steadyRow(d) : spawnRow(d);
  RainGlyph[d] = -1;
}

// The drops. A drop falls from above the screen until it passes where it lands, then
// starts again at once above the screen (see spawnRow; none waits below the screen).
// Without music RainScale times DropCapacity (Rain density's drops, see rainCount)
// fall; with React to music, as many as the music gives (rainTarget): new drops come
// above the screen when it gets louder (spawnDrops), and drops end where they land
// when it gets quieter. RainScale keeps the rain as it was when drops waited below the
// screen to start again (with Rain frequency 20, the default before it was removed):
// as many drops enter the screen in an hour, measured with
// densitytest.html?test=calibrate at Speed 20, 70 and 90. It is above 1 because each
// drop is now above the screen for 0 to screen height / Font size Max steps before it
// shows (72 on average at 1920x2160), longer than the wait of 50 steps on average
var RainScale = 1.06;
var DropCapacity = 0;
var RainTarget = 0;
// does the music set RainTarget now (React to music, not in the idle animation)?
var RainByMusic = false;
// the drops that have entered the top of the screen so far (for the tests)
var RainEntries = 0;

// how many drops fall now: without music (or in the idle animation) RainScale times
// DropCapacity; with the music, DropCapacity times the share of drops each column's
// chance kept falling when drops waited below the screen to start again with that
// chance a step (a drop's cycle was its rows, FallRows on average, and a wait of
// 1 / chance steps), on average over the columns, and times (FallRows + the average
// steps above the screen) / FallRows, as each drop is now above the screen for a
// while before it shows (see spawnRow)
function rainTarget() {
  var music = false;
  var share = 0;
  var fall = averageFallRows();
  for (var i = 0; i < ColumnCount; i++) {
    var chance = ColumnChance[i];
    if (chance >= 0) {
      music = true;
      if (chance > 0) {
        share += fall / (fall + 1 / chance);
      }
    }
  }
  RainByMusic = music;
  if (!music) {
    return Math.round(DropCapacity * RainScale);
  }
  // (the drops starting again keep the whole height above the screen, also with Music
  // rain responsiveness, which is only for the drops the music brings, see spawnDrops)
  var above = ScreenHeight / font_size / 2;
  return Math.round(((DropCapacity * share) / Math.max(1, ColumnCount)) * ((fall + above) / fall));
}

// New drops up to RainTarget, whenever there are fewer: when the rain starts from a
// clean screen (the start, a font size change), when Rain density goes up, when the
// music gets louder or stops (its target goes back to the settled rain's). They come
// at the settled rate of the new rain: new drops are put just above the screen so
// that, with the drops already coming back (entering), as many enter as the settled
// rain brings in (RainTarget / rainCycle a step), until there are RainTarget of them.
// While the music sets the rain (RainByMusic), Music rain responsiveness times that
// rate (at 1 as the settled rain, at 10 the music's new drops come in ten times
// faster, almost together). The new drops are a random number (as drops come by
// themselves) of the settled rate less the drops expected to come back
// (RainFillArrivals: their average over about a second, kept in every step), not less
// the ones coming back in this step, so the two vary on their own and together vary
// as much as the settled rain; and the balance is kept over time (RainFillCredit: the
// drops still missing, or too many, so far in this fill: each step adds the rate and
// takes away the drops that entered; a tenth of a second's share of it, so ten seconds
// to make it up, is added to the next steps: made up within a second, it evened out
// the seconds themselves), so it is right on average however few drops a step brings.
// (Taking a random number less the random number coming back in each step, and none
// when that was below 0, let in the larger of the two, about 1.5 times the settled
// rate as the fill ended at Rain density 1; taking away exactly the ones coming back
// made the first minute too even; and all the new drops at once came in as a burst,
// then a dip.) So the rain is as dense, and as random, from the first step as later,
// and does not come in waves. RainFilling: is the rain filling (fewer drops than
// RainTarget)
var RainFilling = false;
var RainFillCredit = 0;
var RainFillArrivals = 0;
function spawnDrops(entering) {
  // (about a second of steps)
  var second = Math.max(1, 1000 / speed);
  RainFillArrivals += (entering - RainFillArrivals) / second;
  // (the drops waiting to come in count, those finishing their fall do not)
  var counted = RainCount + RainPending - RainDraining;
  if (counted >= RainTarget) {
    RainFilling = false;
    RainFillCredit = 0;
    return;
  }
  RainFilling = true;
  var rate = RainTarget / rainCycle();
  if (RainByMusic) {
    rate *= MusicRainResponsiveness;
  }
  var n = Math.min(RainTarget - counted,
    randomCount(Math.max(0, rate - RainFillArrivals + RainFillCredit / (10 * second))));
  RainFillCredit += rate - entering - n;
  for (var k = 0; k < n; k++) {
    newDrop(RainCount++, false);
  }
}

// The drops waiting above the screen to come in at the top (see spawnRow) are not
// kept as drops (each would be a drop out of the screen, moved a row a step), only
// counted: SpawnWheel holds how many come in with each of the next steps (a ring, a
// place a step, as many as a wait can be long; SpawnAt is the current step's place),
// RainPending how many wait in all. A drop that comes in is made then, at the top
// (row 0: it enters the screen in the next step), with a new size, distance and place
// (newDrop). They count for RainTarget like the falling drops. (SpawnWheel, SpawnAt
// and RainPending are with the drops' arrays, at the top: the drops are made before
// this part of the script runs)

// a drop comes in after wait steps (0: at once, at the top); gives 1 when it came in
function waitToComeIn(wait) {
  if (wait <= 0) {
    newDrop(RainCount++, false);
    return 1;
  }
  sizeSpawnWheel();
  SpawnWheel[(SpawnAt + wait) % SpawnWheel.length]++;
  RainPending++;
  return 0;
}

// the drops whose wait ends with the current step come in at the top; gives how many
function comeIn() {
  if (RainPending == 0) {
    return 0;
  }
  var n = SpawnWheel[SpawnAt];
  SpawnWheel[SpawnAt] = 0;
  RainPending -= n;
  for (var k = 0; k < n; k++) {
    newDrop(RainCount++, false);
  }
  return n;
}

// one of the waiting drops, the which-th from the next step on, does not come in
function cancelWaiting(which) {
  var length = SpawnWheel.length;
  for (var k = 1; k <= length; k++) {
    var at = (SpawnAt + k) % length;
    if (which < SpawnWheel[at]) {
      SpawnWheel[at]--;
      RainPending--;
      return;
    }
    which -= SpawnWheel[at];
  }
}

// the ring holds the longest wait (screen height / Font size Max steps, see spawnRow);
// made bigger only when it has to be, keeping the waiting drops in their steps
function sizeSpawnWheel() {
  var length = Math.floor(ScreenHeight / font_size) + 2;
  if (SpawnWheel.length >= length) {
    return;
  }
  var wheel = new Int32Array(length);
  for (var k = 0; k < SpawnWheel.length; k++) {
    wheel[k] = SpawnWheel[(SpawnAt + k) % SpawnWheel.length];
  }
  SpawnWheel = wheel;
  SpawnAt = 0;
}

// The rain got lighter (Rain density went down, or the music got quieter): as many
// drops as there are over RainTarget, picked at random, go: one still waiting to come
// in does not (it was not seen yet, see SpawnWheel), one at the top ends at once, one
// on the screen finishes its fall and ends where it lands (RainDrain). They no longer count, so the drops that count go on
// starting again at the top, and as the drops above the screen thin out like all the
// others, the new rain comes in at its own density at once while the rain that was
// falling lands. The rain got heavier: drops finishing their fall go on falling first
// (so there are never more drops than before), then new ones come (spawnDrops)
function balanceDrops() {
  var counted = RainCount + RainPending - RainDraining;
  if (counted > RainTarget) {
    var tries = 0;
    while (counted > RainTarget && tries < 4 * (RainCount + RainPending)) {
      tries++;
      // the drops waiting above the screen (see SpawnWheel) are picked like the others
      var pick = Math.floor(Math.random() * (RainCount + RainPending));
      if (pick >= RainCount) {
        cancelWaiting(pick - RainCount);
        counted--;
      } else if (!RainDrain[pick]) {
        dropGoes(pick);
        counted--;
      }
    }
    // (in the unlikely case the random picks kept finding drops already ending;
    // backwards, as ending a drop moves the last one into its place)
    while (counted > RainTarget && RainPending > 0) {
      cancelWaiting(0);
      counted--;
    }
    for (var e = RainCount - 1; e >= 0 && counted > RainTarget; e--) {
      if (!RainDrain[e]) {
        dropGoes(e);
        counted--;
      }
    }
  } else {
    for (var u = 0; u < RainCount && counted < RainTarget && RainDraining > 0; u++) {
      if (RainDrain[u]) {
        RainDrain[u] = 0;
        RainDraining--;
        counted++;
      }
    }
  }
}

// the average steps of a drop's cycle: its rows (FallRows, from where it enters to
// where it passes its line) and its steps above the screen (1 to screen height /
// Font size Max, see spawnRow)
function rainCycle() {
  return averageFallRows() + (ScreenHeight / font_size + 1) / 2;
}

// a random whole number, mean on average, as random as things that happen on their
// own (a Poisson distribution)
function randomCount(mean) {
  if (!(mean > 0)) {
    return 0;
  }
  if (mean > 30) {
    // (close to a normal distribution)
    var u = Math.max(1e-12, Math.random());
    var gauss = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss));
  }
  var limit = Math.exp(-mean);
  var count = 0;
  var product = Math.random();
  while (product > limit) {
    count++;
    product *= Math.random();
  }
  return count;
}

// drop d goes (see balanceDrops): at once while it is above the screen, otherwise
// after its fall
function dropGoes(d) {
  if (RainRow[d] <= 0) {
    removeDrop(d);
  } else {
    RainDrain[d] = 1;
    RainDraining++;
  }
}

// drop d ends: the last one takes its place
function removeDrop(d) {
  var last = --RainCount;
  if (RainDrain[d]) {
    RainDraining--;
  }
  RainDrain[d] = RainDrain[last];
  // (so every place after the last drop is ready for a new one)
  RainDrain[last] = 0;
  RainX[d] = RainX[last];
  RainRow[d] = RainRow[last];
  RainSize[d] = RainSize[last];
  RainNear[d] = RainNear[last];
  RainGlyph[d] = RainGlyph[last];
}

// the row a drop starts on, new or starting again: a random height above the top of
// the screen (row 0 is just above it), up to the screen height for Font size Max and
// in proportion to its size for the others (screen height * size / Font size Max).
// A drop falls one row of its own size a step, so every drop reaches the screen after
// a random 0 to screen height / Font size Max steps, whatever its size and at any
// Speed, and drops that start together never come in as one line (new drops come
// in at the top instead, at the rate of spawnDrops)
function spawnRow(d) {
  return -Math.floor(Math.random() * (ScreenHeight / font_size));
}

// the average rows a drop falls (newDropLook's looks), for rainTarget; made again
// when the font sizes, the screen or the plane change. It takes random numbers of its
// own (FallRowsCount looks), so the rain's random numbers stay
var FallRows = 1;
var FallRowsCount = 4000;
var FallRowsFor = [];
function averageFallRows() {
  var key = [font_size, fontSizeMin(), ScreenHeight, planeActive() ? 1 : 0, planeTopY(), PlaneNearest];
  var same = FallRowsFor.length == key.length;
  for (var i = 0; same && i < key.length; i++) {
    same = FallRowsFor[i] == key[i];
  }
  if (same) {
    return FallRows;
  }
  FallRowsFor = key;
  var seed = 1;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  }
  var minSize = fontSizeMin();
  var range = font_size - minSize;
  var weight = Math.min(1, range / 10);
  var total = 0;
  for (var n = 0; n < FallRowsCount; n++) {
    // as newDropLook
    var size = font_size > minSize ? Math.round(minSize * Math.pow(font_size / minSize, random())) : font_size;
    var bySize = range > 0 ? (size - minSize + 1 - random()) / (range + 1) : 0;
    var nearness = weight * bySize + (1 - weight) * random();
    total += Math.floor(groundY(nearness) / size) + 1;
  }
  FallRows = total / FallRowsCount;
  return FallRows;
}

// Steady start (Debug mode): the drops start as the settled rain does at any moment,
// and their trails are drawn before the first frame (see warmRain). True while the
// drops start again (resetDrops)
var RainSteadyStart = false;
// a look for drop d as the drops have at a random moment of the settled rain: a drop
// keeps its look for a whole cycle (its steps above the screen, see spawnRow, and its
// rows), and smaller ones fall longer, so at any moment more of the drops are small
// than when they start. A look is taken with a chance of its cycle against the
// longest one (at most SteadyTries looks)
var SteadyTries = 200;
function steadyLook(d) {
  var above = ScreenHeight / font_size / 2;
  var longest = ScreenHeight / fontSizeMin() + 1 + above;
  for (var tries = 0; tries < SteadyTries; tries++) {
    newDropLook(d);
    var rows = Math.floor(groundY(RainNear[d]) / RainSize[d]) + 1;
    if (Math.random() * longest < rows + above) {
      return;
    }
  }
}
// where drop d is at a random moment of its cycle: on any of its rows alike, or for
// the rest of its cycle above the screen
function steadyRow(d) {
  var rows = Math.floor(groundY(RainNear[d]) / RainSize[d]) + 1;
  var above = ScreenHeight / font_size / 2;
  if (Math.random() * (rows + above) < rows) {
    return Math.floor(Math.random() * rows);
  }
  return spawnRow(d);
}

// how many rain steps a character takes to fade out completely: the trails' length
// (each step fades by Trail length and takes away 1/255, see glFadePasses)
function trailSteps() {
  var value = 255;
  var steps = 0;
  while (value > 0 && steps < 255) {
    value = Math.floor(value * (1 - tailLength) + 0.5) - 1;
    steps++;
  }
  return steps;
}

// Steady start: the trails the drops would have left are drawn before the first
// frame, as trailSteps steps of rain one after another, without splashes and ripples
// (which would all come at once). RainWarming is true meanwhile
var RainWarming = false;
function warmRain() {
  var fade = FrameFade;
  RainWarming = true;
  var steps = trailSteps();
  for (var s = 0; s < steps; s++) {
    FrameFade = tailLength;
    drawRainSteps(1);
    if (QueueCount > 0) {
      flushDrops();
    }
    if (useReflectionPlane) {
      flushReflections();
    }
  }
  RainWarming = false;
  FrameFade = fade;
}

// print a random character of drop d at its row;
// fade is the fading this character would get from the later steps of this frame,
// ground is the line where the drop lands (for its reflection)
function drawDrop(d, fade, ground) {
  settleHead(d, fade);
  var size = RainSize[d];
  var row = RainRow[d];
  var x = RainX[d] + RainShiftX;
  var nearness = RainNear[d];
  var column = particleColumn(x + size / 2);
  var lit = isLit(x + size / 2, (row - 0.5) * size);
  if (fade < 1 && lit) {
    // the clock or message never fades
    fade = 1;
  }
  var opacity = 1;
  // the head is brighter, more for near drops
  var depth = nearnessCurve(nearness);
  var head = HeadBrightness * depth;
  var glyph = queueDrop(x, row, opacity * fade, size, column, -1, head);
  RainGlyph[d] = glyph;
  if (glyph >= 0) {
    // the character glows, less further back
    QueueBloom[QueueCount - 1] = depth;
    QueueNear[QueueCount - 1] = lit ? 1 : nearness;
  }
  if (glyph >= 0 && useReflectionPlane) {
    // the character stands on the bottom of its cell, at row
    reflectCharacter(
      x + size / 2,
      row * size,
      size / font_size,
      glyph,
      column,
      opacity * fade,
      nearness,
      ground,
    );
  }
}

// the head of drop d moved on (or the drop stopped): draw its last character again,
// one row up, in the normal rain color; fade is the fading of the current step
function settleHead(d, fade) {
  var glyph = RainGlyph[d];
  if (glyph < 0) {
    return;
  }
  RainGlyph[d] = -1;
  var size = RainSize[d];
  var row = RainRow[d] - 1;
  var x = RainX[d] + RainShiftX;
  var column = particleColumn(x + size / 2);
  // it has been faded for one step more than the current one
  fade *= 1 - tailLength;
  var lit = isLit(x + size / 2, (row - 0.5) * size);
  if (lit) {
    // the clock or message never fades, and is in front of the fog
    fade = 1;
  }
  var queued = queueDrop(x, row, fade, size, column, glyph, 0);
  if (queued >= 0) {
    QueueBloom[QueueCount - 1] = nearnessCurve(RainNear[d]);
    QueueNear[QueueCount - 1] = lit ? 1 : RainNear[d];
  }
}

// draw every character once in white on transparent, for the splashes and reflections;
// each cell has room around the character, because fillText is not limited to it
function Update_TextAtlas() {
  TextAtlasPad = Math.ceil(font_size / 2);
  TextAtlasCell = font_size + 2 * TextAtlasPad;
  var atlasRows = Math.max(1, Math.ceil(GlyphCount / GlyphAtlasColumns));
  TextAtlas.width = GlyphAtlasColumns * TextAtlasCell;
  TextAtlas.height = atlasRows * TextAtlasCell;
  var TextCtx = TextAtlas.getContext("2d");
  TextCtx.clearRect(0, 0, TextAtlas.width, TextAtlas.height);
  TextCtx.font = font_size + "px consolas";
  TextCtx.fillStyle = "rgba(255,255,255,1.0)";
  for (var i = 0; i < GlyphCount; i++) {
    var cellX = (i % GlyphAtlasColumns) * TextAtlasCell;
    var cellY = Math.floor(i / GlyphAtlasColumns) * TextAtlasCell;
    TextCtx.save();
    TextCtx.beginPath();
    TextCtx.rect(cellX, cellY, TextAtlasCell, TextAtlasCell);
    TextCtx.clip();
    TextCtx.fillText(
      characters[i],
      cellX + TextAtlasPad,
      cellY + TextAtlasPad + font_size,
    );
    TextCtx.restore();
  }
  TextAtlasDirty = false;

  // upside down, for the reflection on the 2D canvas
  TextAtlasFlipped.width = TextAtlas.width;
  TextAtlasFlipped.height = TextAtlas.height;
  var flippedCtx = TextAtlasFlipped.getContext("2d");
  flippedCtx.save();
  flippedCtx.translate(0, TextAtlas.height);
  flippedCtx.scale(1, -1);
  flippedCtx.drawImage(TextAtlas, 0, 0);
  flippedCtx.restore();

  // blurred, for reflections of characters far from the surface (WebGL)
  TextAtlasBlurred.width = TextAtlas.width;
  TextAtlasBlurred.height = TextAtlas.height;
  var blurredCtx = TextAtlasBlurred.getContext("2d");
  blurredCtx.filter = "blur(" + Math.max(1, font_size * 0.15) + "px)";
  blurredCtx.drawImage(TextAtlas, 0, 0);
  blurredCtx.filter = "none";

  // upload to the WebGL renderer for the splashes and reflections
  GL.textAtlasDirty = true;
}

// is the point inside a lit pixel of the clock or message drawn in this frame?
function isLit(x, y) {
  for (var n = 0; n < LitRectCount; n++) {
    var r = LitRects[n];
    if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) {
      return true;
    }
  }
  return false;
}

// remember a character at left edge x and the given row (of its font size), in the
// color of its column; it is drawn by flushDrops; gives the character, or -1 when
// it is not visible. glyph is the character (-1 for a random one), head how much
// it is mixed towards white
function queueDrop(x, row, opacity, size, column, glyph, head) {
  var y = (row - 1) * size;
  // drops above or below the screen are not visible, so skip them
  if (y >= ScreenHeight || y + size <= 0) {
    return -1;
  }
  if (glyph < 0) {
    //a random character to print
    glyph = Math.floor(Math.random() * GlyphCount);
  }
  var n = QueueCount++;
  QueueX[n] = x;
  QueueY[n] = y;
  QueueSize[n] = size;
  QueueOpacity[n] = opacity;
  QueueGlyph[n] = glyph;
  QueueColumn[n] = column;
  QueueHead[n] = head;
  QueueBloom[n] = 0;
  QueueNear[n] = 1;
  return glyph;
}

// sort the queued characters by font size, smallest first (keeping the order of
// equal sizes), so nearer (larger) drops are drawn over the drops behind them
function sortQueueBySize() {
  var counts = SortCounts;
  for (var s = 0; s <= 256; s++) {
    counts[s] = 0;
  }
  for (var n = 0; n < QueueCount; n++) {
    counts[Math.min(256, QueueSize[n])]++;
  }
  var position = 0;
  for (var s = 0; s <= 256; s++) {
    var c = counts[s];
    counts[s] = position;
    position += c;
  }
  for (var n = 0; n < QueueCount; n++) {
    var to = counts[Math.min(256, QueueSize[n])]++;
    SortX[to] = QueueX[n];
    SortY[to] = QueueY[n];
    SortSize[to] = QueueSize[n];
    SortOpacity[to] = QueueOpacity[n];
    SortGlyph[to] = QueueGlyph[n];
    SortColumn[to] = QueueColumn[n];
    SortHead[to] = QueueHead[n];
    SortBloom[to] = QueueBloom[n];
    SortNear[to] = QueueNear[n];
  }
  // swap the queue and the sorted copy
  var a;
  a = QueueX; QueueX = SortX; SortX = a;
  a = QueueY; QueueY = SortY; SortY = a;
  a = QueueSize; QueueSize = SortSize; SortSize = a;
  a = QueueOpacity; QueueOpacity = SortOpacity; SortOpacity = a;
  a = QueueGlyph; QueueGlyph = SortGlyph; SortGlyph = a;
  a = QueueColumn; QueueColumn = SortColumn; SortColumn = a;
  a = QueueHead; QueueHead = SortHead; SortHead = a;
  a = QueueBloom; QueueBloom = SortBloom; SortBloom = a;
  a = QueueNear; QueueNear = SortNear; SortNear = a;
}

// draw all queued drops, from the smallest (furthest) to the largest (nearest), so
// near drops cover far ones; each cell becomes character * color * opacity
function flushDrops() {
  sortQueueBySize();
  glBloomCharacters();
  glFlushDrops();
}
// how strong depth effects (head brightness, bloom) are at a nearness: 1 for the
// nearest drops, decreasing with the logarithm of the distance to 0 for the
// furthest. The distance (0 at the front, 1 at the back) is 1 - nearness (see
// newDropLook). 1 - log10(1 + 9 * distance) drops quickly just behind the front
// and slowly further back
function nearnessCurve(nearness) {
  var distance = 1 - Math.max(0, Math.min(1, nearness));
  return 1 - Math.log(1 + 9 * distance) / Math.LN10;
}

// red, green and blue (0-255) of queued character n: the rain color of its
// column, mixed towards white for a drop head, times its opacity; stored in
// QueueRGB. Rounded like a 2D canvas color string
var QueueRGB = [0, 0, 0];
function queueColor(n) {
  var column = QueueColumn[n];
  var opacity = QueueOpacity[n];
  var head = QueueHead[n];
  var r = ColumnRed[column];
  var g = ColumnGreen[column];
  var b = ColumnBlue[column];
  if (head > 0) {
    r += (255 - r) * head;
    g += (255 - g) * head;
    b += (255 - b) * head;
  }
  if (opacity < 1 || head > 0) {
    r = Math.round(r * Math.min(opacity, 1));
    g = Math.round(g * Math.min(opacity, 1));
    b = Math.round(b * Math.min(opacity, 1));
  }
  QueueRGB[0] = r;
  QueueRGB[1] = g;
  QueueRGB[2] = b;
}

// split a color as returned by ctx.fillStyle ("#rrggbb" or "rgba(r, g, b, a)")
// into red, green and blue of column i
function storeColumnRGB(i, color) {
  if (color.charAt(0) == "#") {
    ColumnRed[i] = parseInt(color.substr(1, 2), 16);
    ColumnGreen[i] = parseInt(color.substr(3, 2), 16);
    ColumnBlue[i] = parseInt(color.substr(5, 2), 16);
  } else {
    var parts = color.replace(/[^\d.,]/g, "").split(",");
    ColumnRed[i] = parseFloat(parts[0]);
    ColumnGreen[i] = parseFloat(parts[1]);
    ColumnBlue[i] = parseFloat(parts[2]);
  }
}

// ---------------------------------------------------------------------------
// Collision and reflection plane
// The plane is a floor seen in perspective at the bottom of the screen. Smaller
// (and fainter) drops are further back, so they land higher up, closer to the far
// line of the plane (PlaneTop); the largest drops land near the bottom.
// ---------------------------------------------------------------------------

// are the drops stopped by a plane?
function planeActive() {
  return useCollisionPlane || useReflectionPlane;
}

// far line of the plane in pixels
function planeTopY() {
  return ScreenHeight * PlaneTop;
}

// The plane in perspective: things on it look smaller towards the far line.
// At the bottom of the screen they have their real size, at the far line
// planeScale() of it: the size of the smallest drops (Font size Min / Max),
// kept between 0.2 and 0.6 so the plane always goes into the distance
function planeScale() {
  var ratio = fontSizeMin() / font_size;
  return Math.max(0.2, Math.min(0.6, ratio));
}

// how much more the plane is squashed vertically than horizontally at the front
// (it is seen from a low angle); as in a real perspective, the squash grows with
// the distance: a step into the distance moves scale * scale * PlaneSquash pixels
// up the screen
var PlaneSquash = 0.3;

// the flat plane seen from above ("world"), in pixels at the size of the front:
// width and depth of the part that is visible on the screen
function planeWorldWidth() {
  return ScreenWidth / planeScale();
}
function planeWorldDepth() {
  var smin = planeScale();
  var planeHeight = Math.max(1, ScreenHeight - planeTopY());
  return (planeHeight / (PlaneSquash * (1 - smin))) * (1 / smin - 1);
}

// height in pixels where a drop at this nearness lands
function groundY(nearness) {
  if (!planeActive()) {
    return ScreenHeight;
  }
  return planeLine(nearness);
}

// the line on the plane at a nearness (0 at the far line, 1 for the nearest drops;
// more is further to the front, below them)
function planeLine(nearness) {
  var top = planeTopY();
  return top + nearness * (ScreenHeight - top) * PlaneNearest;
}
// left edge of column i on the screen (columns are Font size Max wide)
function columnX(i) {
  return (i - 1) * font_size + RainShiftX;
}

// a drop reached its line on the plane at x (its centre)
function dropLanded(x, ground, nearness, size) {
  if (RainWarming) {
    // (the trails drawn before the first frame, see warmRain)
    return;
  }
  if (useCollisionPlane && !(useDebug && DebugNoSplashes)) {
    spawnSplash(x, ground, nearness, size);
  }
  addRipple(x, ground, nearness, 1);
}
// a ring spreading on the reflection from where something touched the surface.
// With WebGL the rings come from a water simulation (see glSimulateWaves), which
// takes every impact. Otherwise there is a list of at most MaxRipples rings, and
// a new ring only replaces one that has (nearly) finished, so the rings can spread
function addRipple(x, y, nearness, strength) {
  if (!ripplesActive() || RippleIntensity <= 0) {
    return;
  }
  if (useGL && GL.waves) {
    // the water simulation takes every impact, see glSimulateWaves
    if (ImpulseCount < MaxImpulses) {
      ImpulseX[ImpulseCount] = x;
      ImpulseY[ImpulseCount] = y;
      ImpulseStrength[ImpulseCount] = 1.5 * strength * (0.4 + 0.6 * nearness);
      ImpulseCount++;
    }
    return;
  }
  var now = Date.now();
  var oldest = 0;
  for (var n = 0; n < MaxRipples; n++) {
    if (!Ripples[n]) {
      oldest = n;
      break;
    }
    if (Ripples[n][2] < Ripples[oldest][2]) {
      oldest = n;
    }
  }
  if (Ripples[oldest] && now - Ripples[oldest][2] < RippleLife * 700) {
    return;
  }
  Ripples[oldest] = [x, y, now, nearness, strength];
}

// a few small characters jump up from where the drop landed, in any direction
// around (left, right, to the front or the back), up to 60 degrees from straight up.
// The splash follows the effective speed of the drop: a drop falls one of its own
// characters per step, so its speed is its font size per step. At the default
// speed the front drops (Font size Max) jump up to the full Splash height; drops
// further back (smaller, so slower) jump lower in the same proportion, and a faster
// or slower Speed makes all splashes higher or lower in the same proportion.
// The characters move in 3D: heights and speeds are at the size of the front, and
// splashLook shows them in perspective where they are now
function spawnSplash(x, ground, nearness, size) {
  var scale = size / font_size;
  var speedScale = DefaultStepMs / speed;
  var count = 2 + Math.floor(Math.random() * 4);
  var gravity = SplashGravity * font_size;
  var unit = splashDepthUnit();
  var perspective = splashPerspective(nearness);
  for (var n = 0; n < count && ParticleCount < MaxParticles; n++) {
    // direction around, and how far from straight up
    var around = Math.random() * 2 * Math.PI;
    var tilt = Math.random() * (Math.PI / 3);
    // highest point between 1 and 4 characters above the plane (at the default
    // speed), but not above the top of the screen
    var height = Math.min(
      ground / scale,
      (1 + Math.random() * 3) * font_size * SplashHeight * speedScale,
    );
    var speedUp = Math.sqrt(2 * gravity * height);
    var sideways = (speedUp / Math.max(0.5, Math.cos(tilt))) * Math.sin(tilt);
    var p = ParticleCount++;
    ParticleX[p] = x;
    ParticleVX[p] = Math.cos(around) * sideways;
    ParticleVZ[p] = Math.sin(around) * sideways;
    ParticleH[p] = 0;
    ParticleVH[p] = speedUp;
    ParticleZ[p] = unit * (1 / perspective - 1);
    ParticleGravity[p] = gravity;
    ParticleScale0[p] = scale;
    ParticleNear0[p] = nearness;
    ParticleGlyph[p] = splashGlyph();
    // it is thrown out of the front when it would come down below the screen
    ParticleOut[p] = 0;
    if (ParticleVZ[p] < 0) {
      var landZ = ParticleZ[p] + ParticleVZ[p] * ((2 * speedUp) / gravity);
      var land = 1 + landZ / unit;
      ParticleOut[p] = land <= 0 || planeLine(splashNearness(1 / land)) > ScreenHeight ? 1 : 0;
    }
    splashLook(p);
  }
}
// how large things look at a nearness on the plane, compared to the front (1):
// planeScale() at the far line, like the ripples
function splashPerspective(nearness) {
  var smin = planeScale();
  return smin + (1 - smin) * nearness;
}

// the nearness for a perspective scale (the inverse of splashPerspective)
function splashNearness(perspective) {
  var smin = planeScale();
  return (perspective - smin) / (1 - smin);
}
// a random character for a splash, one that is not empty (an empty one would make
// the splash character disappear for a frame)
function splashGlyph() {
  var glyph = Math.floor(Math.random() * GlyphCount);
  for (var tries = 0; tries < 5 && GlyphBlank[glyph]; tries++) {
    glyph = Math.floor(Math.random() * GlyphCount);
  }
  return glyph;
}

// how far into the plane (in pixels at the size of the front) things get smaller
// by the perspective: at distance z they look 1 / (1 + z / unit) as large as at
// the front (see splashPerspective). It matches the lines where drops land: a
// step into the distance at the front moves its line PlaneSquash times as far up
// the screen
function splashDepthUnit() {
  var planeHeight = Math.max(1, ScreenHeight - planeTopY());
  return (planeHeight * PlaneNearest) / (PlaneSquash * (1 - planeScale()));
}
// the font size of splash character p (compared to Font size Max) at a perspective
// (see splashPerspective): the size a drop has at its distance now. It starts at
// the size of the drop that made it and changes with the distance as the font
// size goes with the distance of the drops (see newDropLook), within Font size Min
// to Max; a character thrown out of the front grows past it with the perspective
function splashScale(p, perspective) {
  var minSize = fontSizeMin();
  var range = font_size - minSize;
  var nearness = Math.min(1, splashNearness(perspective));
  var size = ParticleScale0[p] * font_size + (nearness - ParticleNear0[p]) * (range + 1);
  var scale = Math.max(minSize, Math.min(font_size, size)) / font_size;
  if (ParticleOut[p] && perspective > 1) {
    scale *= perspective;
  }
  return scale;
}

// the look of splash character p where it is now: its font size, nearness, line
// on the plane, place on the screen, head brightness, glow and fog; things further
// back are smaller and higher up
function splashLook(p) {
  var unit = splashDepthUnit();
  var perspective = 1 / (1 + ParticleZ[p] / unit);
  // past the front (more than 1) only when thrown out of it
  var shownPerspective = ParticleOut[p] ? perspective : Math.min(perspective, 1);
  var line = splashNearness(perspective);
  var ground = planeLine(line);
  var nearness = Math.max(0, Math.min(1, line));
  var head = HeadBrightness * nearnessCurve(nearness);
  var bloom = nearnessCurve(nearness);
  var past = Math.max(1, shownPerspective);
  if (past > 1) {
    // past the front: the distance from white shrinks by the same part each time
    // the scale grows by the scale of the front, so it gets close but never
    // reaches it; the glow grows with the scale
    head = 1 - (1 - head) * Math.pow(1 - head, past - 1);
    bloom *= past;
  }
  // the font size for its distance now
  var shown = splashScale(p, perspective);
  ParticleSize[p] = Math.max(3, font_size * 0.5 * shown);
  ParticleOpacity[p] = 1;
  ParticleNear[p] = nearness;
  ParticleGround[p] = ground;
  ParticleY[p] = ground - ParticleH[p] * shown;
  ParticleVY[p] = -ParticleVH[p] * shown;
  ParticleHead[p] = head;
  ParticleBloom[p] = bloom;
  return shown;
}
// move the splash characters by the given time in seconds; they disappear when they
// fall back below their line on the plane or leave the screen
function updateParticles(seconds) {
  var unit = splashDepthUnit();
  // the furthest a character can go: the far line of the plane
  var furthest = unit * (1 / planeScale() - 1);
  var n = 0;
  while (n < ParticleCount) {
    var scale = splashScale(n, 1 / (1 + ParticleZ[n] / unit));
    ParticleVH[n] -= ParticleGravity[n] * seconds;
    ParticleH[n] += ParticleVH[n] * seconds;
    // sideways it moves as far as it looks at its distance
    ParticleX[n] += ParticleVX[n] * scale * seconds;
    ParticleZ[n] += ParticleVZ[n] * seconds;
    if (ParticleZ[n] > furthest) {
      ParticleZ[n] = furthest;
      ParticleVZ[n] = 0;
    }
    // reached the viewer: gone
    var gone = 1 + ParticleZ[n] / unit < 0.1;
    if (!gone) {
      splashLook(n);
      // a new random character in every frame, like the rain
      ParticleGlyph[n] = splashGlyph();
    }
    var landed = ParticleVH[n] < 0 && ParticleH[n] <= 0;
    if (landed) {
      // a smaller ring where the splash character falls back onto the surface
      addRipple(ParticleX[n], ParticleGround[n], ParticleNear[n] * 0.6, 0.35);
    }
    if (
      !useCollisionPlane ||
      gone ||
      landed ||
      ParticleX[n] < -ParticleSize[n] * 2 ||
      ParticleX[n] > ScreenWidth + ParticleSize[n] * 2 ||
      ParticleY[n] - ParticleSize[n] * 2 > ScreenHeight
    ) {
      // replace with the last one
      ParticleCount--;
      for (var a = 0; a < ParticleArrays.length; a++) {
        ParticleArrays[a][n] = ParticleArrays[a][ParticleCount];
      }
    } else {
      n++;
    }
  }
}

// rain color at a position on the screen
function particleColumn(x) {
  var column = Math.floor((x - RainShiftX) / font_size) + 1;
  return Math.max(0, Math.min(ColumnCount - 1, column));
}

// draw the splash characters in the rain color where they are, blended over the
// picture (they are not in the character grid, so they must not replace cells)
function renderParticles() {
  if (TextAtlasDirty) {
    Update_TextAtlas();
  }
  if (useReflectionPlane) {
    for (var n = 0; n < ParticleCount; n++) {
      reflectCharacter(
        ParticleX[n],
        ParticleY[n],
        ParticleSize[n] / font_size,
        ParticleGlyph[n],
        particleColumn(ParticleX[n]),
        ParticleOpacity[n],
        ParticleNear[n],
        ParticleGround[n],
      );
    }
  }
  glDrawParticles();
}

// remember the splash characters drawn in this frame with their head brightness
// (see settleSplashHeads)
function rememberSplashHeads() {
  SettleCount = 0;
  for (var n = 0; n < ParticleCount; n++) {
    var head = ParticleHead[n];
    if (!(head > 0) || GlyphBlank[ParticleGlyph[n]]) {
      continue;
    }
    var column = particleColumn(ParticleX[n]);
    var s = SettleCount++;
    SettleX[s] = ParticleX[n];
    SettleY[s] = ParticleY[n];
    SettleSize[s] = ParticleSize[n];
    SettleGlyph[s] = ParticleGlyph[n];
    SettleRed[s] = (1 - ColumnRed[column] / 255) * head;
    SettleGreen[s] = (1 - ColumnGreen[column] / 255) * head;
    SettleBlue[s] = (1 - ColumnBlue[column] / 255) * head;
    SettleOpacity[s] = ParticleOpacity[n];
    SettleNear[s] = ParticleNear[n];
  }
}

// reflect a character in the surface: an upside down copy, mirrored around the line
// where it lands (ground), so the character and its reflection meet where it lands.
// The closer the character is to the surface, the stronger and sharper its
// reflection; further away it fades out and gets blurred.
// x is the centre of the character, baseline its bottom, scale its size compared
// to the rain characters
function reflectCharacter(x, baseline, scale, glyph, column, opacity, nearness, ground) {
  if (GlyphBlank[glyph]) {
    return;
  }
  if (TextAtlasDirty) {
    Update_TextAtlas();
  }
  // how far reflections reach, shorter for characters further back
  var sharpness = reflectionSharpness();
  var reach = reflectionReach(nearness);
  var distance = Math.max(0, ground - baseline);
  var closeness = 1 - distance / reach;
  if (closeness <= 0) {
    return;
  }
  // fading with the distance (less past 100%)
  var fade = closeness + (1 - closeness) * sharpness;
  // stronger further back, like water
  var alpha = Math.min(1, ReflectionStrength) * opacity * fade * (1 - 0.3 * nearness);
  if (alpha < 0.01) {
    return;
  }
  // the character image of TextAtlas, upright and mirrored
  var size = TextAtlasCell * scale;
  var top = baseline - (font_size + TextAtlasPad) * scale;
  var mirroredTop = 2 * ground - (top + size);
  if (mirroredTop >= ScreenHeight) {
    return;
  }
  var n = ReflectCount++;
  ReflectX[n] = x - (font_size / 2 + TextAtlasPad) * scale;
  ReflectY[n] = mirroredTop;
  ReflectSize[n] = size;
  ReflectGlyph[n] = glyph;
  ReflectColumn[n] = column;
  ReflectAlpha[n] = alpha;
  ReflectBlur[n] = (1 - closeness) * (1 - sharpness);
}

// the area of the lit pixels of the clock or the message (block, see TextBlocks)
// in pixels (left, top, right, bottom) and the size of one lit pixel; null when
// there is none
function textArea(block) {
  if (!block || block[1] == 0) {
    return null;
  }
  var left = Infinity;
  var top = Infinity;
  var right = -Infinity;
  var bottom = -Infinity;
  for (var n = block[0]; n < block[0] + block[1]; n++) {
    var r = LitRects[n];
    left = Math.min(left, r[0]);
    top = Math.min(top, r[1]);
    right = Math.max(right, r[0] + r[2]);
    bottom = Math.max(bottom, r[1] + r[3]);
  }
  return { left: left, top: top, right: right, bottom: bottom, cell: LitRects[block[0]][2] };
}
// the reflection of the clock or the message (block, see TextBlocks):
// null when there is none, otherwise its area in pixels (left, top, right, bottom),
// the size of one lit pixel, the line it is mirrored around, how far its
// reflection reaches and how strong it is.
// The text stands at the far line of the plane while it is above it, or on the line
// of its bottom edge when it reaches into the plane.
function textReflection(block) {
  var text = useReflectionPlane ? textArea(block) : null;
  if (!text) {
    return null;
  }
  var planeTop = planeTopY();
  var mirror = Math.max(planeTop, text.bottom);
  var nearness = clamp(0, 1, (mirror - planeTop) / (ScreenHeight - planeTop));
  text.mirror = mirror;
  text.reach = reflectionReach(nearness);
  text.strength = Math.min(1, ReflectionStrength) * (1 - 0.3 * nearness);
  return text;
}
// draw the reflected characters of this frame onto the reflection layer; the layer
// fades like the rain, so the trails are reflected too
function flushReflections() {
  if (TextAtlasDirty) {
    Update_TextAtlas();
  }
  glFlushReflections();
  ReflectCount = 0;
}

// ---------------------------------------------------------------------------
// Rendering
// Both renderers work in screen pixels with the origin at the top left.
// ---------------------------------------------------------------------------

// use the WebGL renderer when it is available (there is no other renderer)
function chooseRenderer() {
  var wantGL = gl != null;
  if (wantGL == useGL) {
    return;
  }
  useGL = wantGL;
  applyCanvasSizes();
  // start again on a black screen
  fontsize_changed = true;
}
// give the WebGL canvas the size of the screen
function applyCanvasSizes() {
  // the 2D canvas is only used to read colors
  c.style.display = "none";
  c.width = 1;
  c.height = 1;
  if (!useGL) {
    return;
  }
  glCanvas.width = ScreenWidth;
  glCanvas.height = ScreenHeight;
  glCanvas.style.display = "block";
  glResizeFrame(ScreenWidth, ScreenHeight);
}
// paint the whole screen black
function renderClear() {
  ReflectionStale = true;
  if (!useGL) {
    return;
  }
  glBindFrame();
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
// darken rectangles with black of the given opacity:
// beginFade(alpha), then fadeRect for each rectangle, then endFade()
var FadeAlpha = 0;
var FadeCount = 0;
function beginFade(alpha) {
  FadeAlpha = alpha;
  FadeCount = 0;
}
function fadeRect(x, y, w, h) {
  // 6 vertices of 6 floats per rectangle
  if (GL.fadeData.length < (FadeCount + 1) * 36) {
    var bigger = new Float32Array(GL.fadeData.length * 2);
    bigger.set(GL.fadeData);
    GL.fadeData = bigger;
  }
  // accept negative sizes
  var x0 = Math.min(x, x + w);
  var x1 = Math.max(x, x + w);
  var y0 = Math.min(y, y + h);
  var y1 = Math.max(y, y + h);
  // cover every pixel the rectangle touches; the shader fades pixels that are
  // only partly covered by that part
  var px0 = Math.floor(x0);
  var px1 = Math.ceil(x1);
  var py0 = Math.floor(y0);
  var py1 = Math.ceil(y1);
  var d = GL.fadeData;
  var o = FadeCount * 36;
  o = glFadeVertex(d, o, px0, py0, x0, y0, x1, y1);
  o = glFadeVertex(d, o, px1, py0, x0, y0, x1, y1);
  o = glFadeVertex(d, o, px0, py1, x0, y0, x1, y1);
  o = glFadeVertex(d, o, px0, py1, x0, y0, x1, y1);
  o = glFadeVertex(d, o, px1, py0, x0, y0, x1, y1);
  o = glFadeVertex(d, o, px1, py1, x0, y0, x1, y1);
  FadeCount++;
}

function glFadeVertex(d, o, x, y, x0, y0, x1, y1) {
  d[o] = x;
  d[o + 1] = y;
  d[o + 2] = x0;
  d[o + 3] = y0;
  d[o + 4] = x1;
  d[o + 5] = y1;
  return o + 6;
}

function endFade() {
  if (useGL && FadeCount > 0) {
    glDrawFade();
  }
}
// show the finished frame
function renderPresent() {
  glPresent();
}
// ---------------------------------------------------------------------------
// WebGL renderer
// The screen image is kept in a texture (GL.frameTexture), because the rain
// builds on the previous frames. Each frame:
// - the fade darkens it with one batch of black rectangles,
// - all drops are drawn in one call as character * color * opacity,
//   like the 2D canvas does with its "multiply" step,
// - the texture is copied to the screen, recoloring the clock or message
//   when "High contrast text" is off, with the formula of the 2D canvas
//   "color" blend mode.
// ---------------------------------------------------------------------------

function initGL() {
  glCanvas = document.createElement("canvas");
  glCanvas.width = 1;
  glCanvas.height = 1;
  glCanvas.style.display = "none";
  c.parentNode.insertBefore(glCanvas, c.nextSibling);
  try {
    gl = glCanvas.getContext("webgl", GLOptions);
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    return;
  }
  // when the graphics driver resets (after sleep, a driver update or a GPU
  // timeout), everything on the GPU is lost: stop drawing (see draw) until it
  // comes back, then make everything again and start the rain again
  glCanvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    gl = null;
    chooseRenderer();
  });
  glCanvas.addEventListener("webglcontextrestored", function () {
    gl = glCanvas.getContext("webgl", GLOptions);
    if (!gl) {
      return;
    }
    GL = {};
    glSetup();
    GL.textAtlasDirty = true;
    BloomStale = true;
    ReflectionStale = true;
    chooseRenderer();
    applyCanvasSizes();
    fontsize_changed = true;
  });
  glSetup();
}

// make everything the WebGL renderer draws with: programs, buffers, textures (at
// the start, and again after the graphics driver was reset)
function glSetup() {

  // positions in screen pixels, origin at the top left
  // the fog layers (see glFog): their atlas, columns / count / nearness of the
  // first / step between them, tile and atlas size in pixels, opacity of the
  // nearest one. fogLayer gives the color and density of layer k at a place on
  // the screen (0-1, origin at the bottom left), fogOpacity its opacity (each
  // layer further back 1% more), fogThrough how much of something at a nearness
  // is seen through the layers in front of it
  var fogShader =
    "uniform sampler2D uFogAtlas;" +
    "uniform vec4 uFogGrid;" +
    "uniform vec4 uFogTile;" +
    "uniform float uFog;" +
    "vec4 fogLayer(float k, vec2 uv) {" +
    "  float row = floor((k + 0.5) / uFogGrid.x);" +
    "  vec2 origin = vec2(k - row * uFogGrid.x, row) * uFogTile.xy;" +
    "  vec2 inTile = clamp(uv * uFogTile.xy, vec2(0.5), uFogTile.xy - 0.5);" +
    "  return texture2D(uFogAtlas, (origin + inTile) / uFogTile.zw);" +
    "}" +
    "float fogOpacity(float k) { return min(1.0, uFog + 0.01 * k); }" +
    "float fogThrough(vec2 uv, float near) {" +
    "  float seen = 1.0;" +
    "  if (uFog <= 0.0) { return seen; }" +
    "  for (int i = 0; i < 25; i++) {" +
    "    float k = float(i);" +
    "    if (k >= uFogGrid.y || uFogGrid.z - k * uFogGrid.w <= near) { break; }" +
    "    seen *= 1.0 - fogLayer(k, uv).a * fogOpacity(k);" +
    "  }" +
    "  return seen;" +
    "}";
  var pixelVertex =
    "uniform vec2 uScreen;" +
    "vec4 toClip(vec2 p) {" +
    "  return vec4(p.x / uScreen.x * 2.0 - 1.0, 1.0 - p.y / uScreen.y * 2.0, 0.0, 1.0);" +
    "}";
  // the clock and the message in the shaders that show the picture: their areas
  // (left, top, right, bottom) and lit pixels (text 0 and 1), whether a point is in
  // their letters, and recolorText, which gives the letters the hue of the rain in
  // their column (with High contrast text off: uRecolor), with the 'color' blend
  // mode of the 2D canvas (W3C Compositing and Blending)
  var textShader =
    "uniform vec4 uTextBox0;" +
    "uniform vec4 uTextBox1;" +
    "uniform sampler2D uTextMask0;" +
    "uniform sampler2D uTextMask1;" +
    "uniform bool uRecolor;" +
    "uniform sampler2D uColumns;" +
    "uniform float uColumnCount;" +
    "uniform float uFont;" +
    "uniform float uShift;" +
    "float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }" +
    "vec3 clipColor(vec3 c) {" +
    "  float l = lum(c);" +
    "  float n = min(min(c.r, c.g), c.b);" +
    "  float x = max(max(c.r, c.g), c.b);" +
    "  if (n < 0.0) { c = l + (c - l) * l / (l - n); }" +
    "  if (x > 1.0) { c = l + (c - l) * (1.0 - l) / (x - l); }" +
    "  return c;" +
    "}" +
    "vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }" +
    // is the point in a lit pixel of a text?
    "bool inLetters(vec2 p, vec4 box, sampler2D mask) {" +
    "  vec2 m = (p - box.xy) / (box.zw - box.xy);" +
    "  return m.x >= 0.0 && m.x < 1.0 && m.y >= 0.0 && m.y < 1.0 && texture2D(mask, m).r > 0.5;" +
    "}" +
    "bool inText(vec2 p) {" +
    "  return inLetters(p, uTextBox0, uTextMask0) || inLetters(p, uTextBox1, uTextMask1);" +
    "}" +
    "vec3 recolorText(vec3 color, float x, float y) {" +
    // only inside the letters of the clock or message (its lit pixels)
    "  if (uRecolor && inText(vec2(x, y))) {" +
    // characters are drawn one column further left (see queueDrop)
    "    float column = clamp(floor((x - uShift) / uFont) + 1.0, 0.0, uColumnCount - 1.0);" +
    "    vec3 rain = texture2D(uColumns, vec2((column + 0.5) / uColumnCount, 0.5)).rgb;" +
    "    color = setLum(rain, lum(color));" +
    "  }" +
    "  return color;" +
    "}";
  var highp =
    "#ifdef GL_FRAGMENT_PRECISION_HIGH\n" +
    "precision highp float;\n" +
    "#else\n" +
    "precision mediump float;\n" +
    "#endif\n";

  GL.fadeProgram = glProgram(
    pixelVertex +
      "attribute vec2 aPos;" +
      // the exact rectangle: left, top, right, bottom
      "attribute vec4 aRect;" +
      "varying vec4 vRect;" +
      "void main() { gl_Position = toClip(aPos); vRect = aRect; }",
    highp +
      "uniform float uAlpha;" +
      "uniform vec2 uScreen;" +
      // screen pixels per pixel of the target (2 for the glow layer)
      "uniform float uPixel;" +
      // 1: give the amount to take away from the target (the last traces 8 bits
      // cannot fade further) instead of the fading
      "uniform float uSubtract;" +
      "varying vec4 vRect;" +
      "void main() {" +
      // how much of this pixel the rectangle covers
      "  vec2 p = vec2(gl_FragCoord.x, uScreen.y / uPixel - gl_FragCoord.y) * uPixel;" +
      "  float h = 0.5 * uPixel;" +
      "  float cx = clamp(min(p.x + h, vRect.z) - max(p.x - h, vRect.x), 0.0, uPixel) / uPixel;" +
      "  float cy = clamp(min(p.y + h, vRect.w) - max(p.y - h, vRect.y), 0.0, uPixel) / uPixel;" +
      "  gl_FragColor = uSubtract > 0.5 ? vec4(vec3(cx * cy / 255.0), 0.0) :" +
      "    vec4(0.0, 0.0, 0.0, uAlpha * cx * cy);" +
      "}",
  );

  GL.dropProgram = glProgram(
    pixelVertex +
      "attribute vec2 aPos;" +
      "attribute vec2 aUV;" +
      // color and nearness (1 for the clock or message: no fog)
      "attribute vec4 aColor;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying vec2 vFogUV;" +
      "void main() {" +
      "  gl_Position = toClip(aPos);" +
      "  vUV = aUV;" +
      "  vColor = aColor;" +
      "  vFogUV = vec2(aPos.x / uScreen.x, 1.0 - aPos.y / uScreen.y);" +
      "}",
    highp +
      fogShader +
      "uniform sampler2D uAtlas;" +
      // 1 when drawing the glow layer: only what the fog lets through glows
      "uniform float uFogGlow;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying vec2 vFogUV;" +
      // the nearness is kept in the alpha of the screen image, for the fog
      "void main() {" +
      "  vec3 color = texture2D(uAtlas, vUV).r * vColor.rgb;" +
      "  if (uFogGlow > 0.5) { color *= fogThrough(vFogUV, vColor.a); }" +
      "  gl_FragColor = vec4(color, vColor.a);" +
      "}",
  );

  GL.presentProgram = glProgram(
    "attribute vec2 aPos;" + "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
    highp +
      "uniform sampler2D uFrame;" +
      "uniform vec2 uScreen;" +
      textShader +
      // 1: draw the picture with the fog into GL.sceneTarget, with how blurred each
      // pixel should be in its alpha, for the fog's blur (see glFogBlur); the glow
      // and the recoloring of the clock and message come after the blur
      "uniform bool uSceneOut;" +
      // Nearness view (Debug mode): the fog layers' nearness (first, step, count)
      "uniform bool uDebugNear;" +
      "uniform vec3 uDebugLayers;" +
      // reflection plane: far line, time in seconds, ripples (x, y, age in seconds
      // or -1 when unused, nearness) and their strength
      "uniform bool uReflect;" +
      "uniform bool uPlane;" +
      "uniform vec3 uPlaneTone;" +
      "uniform float uPlaneTop;" +
      "uniform float uTime;" +
      "uniform vec4 uRipple[32];" +
      "uniform float uRippleStrength[32];" +
      "uniform float uRippleIntensity;" +
      // how long rings last (seconds), how fast they spread (pixels per second),
      // how much they darken and lighten the colors
      "uniform float uRippleLife;" +
      "uniform float uRippleSpeed;" +
      "uniform float uRippleDarkening;" +
      "uniform float uRippleLightening;" +
      "uniform sampler2D uReflection;" +
      // the water simulation: on or off, its heights, and the size of one cell
      "uniform bool uWaveSim;" +
      "uniform sampler2D uWaves;" +
      "uniform vec2 uWaveTexel;" +
      // size of things at the far line of the plane (1 at the bottom of the screen)
      "uniform float uPlaneScale;" +
      // the glow (see glBloom) and how strongly it is added (0 = no bloom)
      "uniform sampler2D uBloom;" +
      "uniform float uBloomStrength;" +
      // distance fog: its strength at the far line (0 = off), its two colors,
      // the nearest drops' line as a part of the plane height
      fogShader +
      "uniform float uPlaneNearest;" +
      // the clock or message: is it reflected, its area (left, top, right, bottom),
      // its lit pixels, the line it is mirrored around, reach and strength
      "uniform bool uTextReflect;" +
      // for the clock and the message (text 0 and 1): reflection (line it is
      // mirrored around, reach, strength; 0: none)
      "uniform vec3 uTextReflection0;" +
      "uniform vec3 uTextReflection1;" +
      // Reflection strength past 100% (see reflectionSharpness)
      "uniform float uSharpness;" +
      // lightning (see updateLightning): how many strikes are playing (up to 3,
      // from the furthest to the nearest; 0: none), and their nearness (x, y, z, one
      // a strike); are their bolts in the bolt texture (see glDrawBolt), and that
      // texture. The flashes (see FlashLayers): the main channels' straight pieces
      // (from x, y to x, y in screen pixels), the first strike's first, and where
      // each strike's end; for each, how far its band of full light reaches from the
      // channel and its light there (0: none), and the widths of its four layers,
      // all in pixels and already closed in for this frame; the layers' parts of
      // the light
      "uniform float uStrikeCount;" +
      "uniform vec3 uStrikeNear;" +
      "uniform float uBoltOn;" +
      "uniform sampler2D uBoltTexture;" +
      // (3 strikes of MaxChannelSegments pieces)
      "uniform vec4 uChannel[192];" +
      "uniform vec3 uChannelEnd;" +
      "uniform vec3 uFlashBand;" +
      "uniform vec3 uFlashLight;" +
      "uniform vec4 uFlashLayers[3];" +
      "uniform vec4 uFlashWeights;" +
      // the flash's grey (Lightning flash intensity)
      "uniform float uFlashWhite;" +
      // a strike's part of a vector (one value a strike)
      "float ofStrike(vec3 v, int s) { return s == 0 ? v.x : s == 1 ? v.y : v.z; }" +
      // distance from a point to the main channel of strike s
      "float channelDistance(vec2 p, int s) {" +
      "  float from = s == 0 ? 0.0 : s == 1 ? uChannelEnd.x : uChannelEnd.y;" +
      "  float to = ofStrike(uChannelEnd, s);" +
      "  float d = 1e9;" +
      "  for (int i = 0; i < 192; i++) {" +
      "    if (float(i) >= to) { break; }" +
      "    if (float(i) < from) { continue; }" +
      "    vec2 a = uChannel[i].xy;" +
      "    vec2 ab = uChannel[i].zw - a;" +
      "    float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);" +
      "    d = min(d, length(p - a - ab * h));" +
      "  }" +
      "  return d;" +
      "}" +
      // the flash of strike s at a point (0-1): full in its band round the channel,
      // then four layers fading out with the distance from the band, the widest
      // reaching the edges of the screen (see FlashLayers)
      "float flashAt(vec2 p, int s) {" +
      "  float light = ofStrike(uFlashLight, s);" +
      "  if (light <= 0.0) { return 0.0; }" +
      "  float over = max(0.0, channelDistance(p, s) - ofStrike(uFlashBand, s));" +
      "  vec4 layers = s == 0 ? uFlashLayers[0] : s == 1 ? uFlashLayers[1] : uFlashLayers[2];" +
      "  vec4 v = over / max(layers, vec4(0.001));" +
      "  return dot(uFlashWeights, exp(-v * v)) * light;" +
      "}" +
      // the flashes of all the strikes at a point (one value a strike)
      "vec3 flashesAt(vec2 p) {" +
      "  vec3 f = vec3(0.0);" +
      "  if (uStrikeCount > 0.0) { f.x = flashAt(p, 0); }" +
      "  if (uStrikeCount > 1.0) { f.y = flashAt(p, 1); }" +
      "  if (uStrikeCount > 2.0) { f.z = flashAt(p, 2); }" +
      "  return f;" +
      "}" +
      // the light of the bolts at a point in screen pixels (origin at the top left),
      // and which strike it belongs to (w: 0-2, -1: none; the texture's alpha)
      "vec4 boltAt(vec2 p) {" +
      "  if (uBoltOn <= 0.0) { return vec4(0.0, 0.0, 0.0, -1.0); }" +
      "  vec4 b = texture2D(uBoltTexture, vec2(p.x, uScreen.y - p.y) / uScreen);" +
      "  return vec4(b.rgb, floor(b.a * 4.0 + 0.5) - 1.0);" +
      "}" +
      // the light of strike s's bolt in what boltAt gave
      "vec3 boltOf(vec4 b, int s) { return abs(b.w - float(s)) < 0.5 ? b.rgb : vec3(0.0); }" +
      // the strike on what is behind it: the bolt's light is added, and the flash
      // shines on it (a screen blend), so what is behind still shows through.
      // amount: how much of the strike is in front of the background here (0-1)
      "vec3 strikeOn(vec3 c, vec3 bolt, float flash, float amount) {" +
      "  vec3 lit = min(c + bolt, vec3(1.0));" +
      "  lit = 1.0 - (1.0 - lit) * (1.0 - uFlashWhite * flash);" +
      "  return mix(c, lit, amount);" +
      "}" +
      // each strike's bolt and flash upside down in the water: the line they are
      // mirrored around (where it strikes), how far the reflection reaches, and its
      // strength (0: none)
      "uniform vec3 uBoltMirror[3];" +
      // the picture at a point in screen pixels (origin at the top left)
      "vec3 picture(vec2 p) {" +
      "  return texture2D(uFrame, vec2(p.x, uScreen.y - p.y) / uScreen).rgb;" +
      "}" +
      // the reflection layer at a point in screen pixels (origin at the top left)
      "vec3 reflected(vec2 p) {" +
      "  return texture2D(uReflection, vec2(p.x, uScreen.y - p.y) / uScreen).rgb;" +
      "}" +
      // how much of the plane is seen at a nearness (0 at the far line, 1 at the
      // bottom of the screen): it fades into the distance
      // the picture with the fog: the background (the plane, or the dark far
      // distance above it) at backNear, the rain and splashes of the screen image
      // at their nearness (objectNear), and between them the fog layers, from the
      // back to the front; each layer covers what is behind it
      // For the fog's blur, the light of what is seen (by lum) is followed: x is all
      // of it, y its blur (the square of the blur radius, in pixels) times its light.
      // The background, the strike and the rain each come in sharp; each layer in
      // front blurs everything behind it by its own radius (uFogBlurLayer times its
      // cover); the fog's own color counts for neither. blur is the radius of this
      // pixel as a part of uFogBlurMax
      "uniform float uFogBlurLayer;" +
      "uniform float uFogBlurMax;" +
      "vec3 placeObject(vec3 result, vec3 object, float coverage, inout vec2 light) {" +
      "  light = light * (1.0 - coverage) + vec2(lum(object), 0.0);" +
      "  return result * (1.0 - coverage) + object;" +
      "}" +
      "vec3 placeStrike(vec3 result, vec3 bolt, float flash, float amount, inout vec2 light) {" +
      "  vec3 lit = strikeOn(result, bolt * amount, flash, 1.0);" +
      "  light.x += max(0.0, lum(lit) - lum(result));" +
      "  return lit;" +
      "}" +
      // place what is further than limit and not placed yet: the strikes (from the
      // furthest, done of them are placed) and the rain, the further first. A strike
      // is in front of the plane from the line where it strikes, coming in over a
      // step like the fog layers. The rain at a strike's own nearness (stored in 8
      // bits) is behind it, so the characters bolt is lit by its own flash
      "vec3 placeBehind(vec3 result, float limit, float step, float backNear, vec3 object, float objectNear," +
      "    float coverage, vec4 bolt, vec3 flash, inout bool placed, inout float done, inout vec2 light) {" +
      "  for (int s = 0; s < 3; s++) {" +
      "    if (float(s) >= uStrikeCount) { break; }" +
      "    if (float(s) < done) { continue; }" +
      "    float near = ofStrike(uStrikeNear, s);" +
      "    if (near >= limit) { break; }" +
      "    if (!placed && objectNear < limit && !(near < objectNear - 0.004)) {" +
      "      result = placeObject(result, object, coverage, light);" +
      "      placed = true;" +
      "    }" +
      "    float amount = clamp((near - backNear) / step + 0.5, 0.0, 1.0);" +
      "    result = placeStrike(result, boltOf(bolt, s), ofStrike(flash, s), amount, light);" +
      "    done += 1.0;" +
      "  }" +
      "  if (!placed && objectNear < limit) {" +
      "    result = placeObject(result, object, coverage, light);" +
      "    placed = true;" +
      "  }" +
      "  return result;" +
      "}" +
      "vec3 withFog(vec3 back, float backNear, vec3 object, float objectNear, vec4 bolt, vec3 flash, out float blur) {" +
      // how much the rain or splash covers what is behind it
      "  float coverage = clamp(max(max(object.r, object.g), object.b) * 4.0, 0.0, 1.0);" +
      "  vec3 result = back;" +
      // (a little more, so an empty pixel is blurred like the background)
      "  vec2 light = vec2(lum(back) + 0.001, 0.0);" +
      "  bool placed = false;" +
      "  float done = 0.0;" +
      "  for (int i = 0; i < 25; i++) {" +
      "    float k = uFogGrid.y - 1.0 - float(i);" +
      "    if (k < 0.0) { break; }" +
      "    float layerNear = uFogGrid.z - k * uFogGrid.w;" +
      // the strikes and the rain that are behind this layer
      "    result = placeBehind(result, layerNear, uFogGrid.w, backNear, object, objectNear, coverage, bolt, flash," +
      "      placed, done, light);" +
      // in front of the plane: from the line where drops at the layer's nearness
      // land, coming in smoothly over a step centred on that line, so the plane
      // has no bands where layers start
      "    float front = clamp((layerNear - backNear) / uFogGrid.w + 0.5, 0.0, 1.0);" +
      "    if (front > 0.0) {" +
      "      vec4 layer = fogLayer(k, gl_FragCoord.xy / uScreen);" +
      "      float cover = layer.a * fogOpacity(k) * front;" +
      "      result = mix(result, layer.rgb, cover);" +
      "      light.y += light.x * cover * uFogBlurLayer * uFogBlurLayer;" +
      "    }" +
      "  }" +
      // in front of every layer
      "  result = placeBehind(result, 1e9, uFogGrid.w, backNear, object, objectNear, coverage, bolt, flash," +
      "    placed, done, light);" +
      "  blur = clamp(sqrt(light.y / light.x) / uFogBlurMax, 0.0, 1.0);" +
      "  return min(result, vec3(1.0));" +
      "}" +
      // without the fog: the strikes in front of or behind the rain, which is added
      // to what is behind it
      "vec3 withStrike(vec3 back, float backNear, vec3 object, float objectNear, vec4 bolt, vec3 flash) {" +
      "  vec3 result = back;" +
      "  for (int s = 0; s < 3; s++) {" +
      "    if (float(s) >= uStrikeCount) { break; }" +
      "    float near = ofStrike(uStrikeNear, s);" +
      "    if (near < objectNear - 0.004) {" +
      "      float amount = clamp((near - backNear) / 0.05 + 0.5, 0.0, 1.0);" +
      "      result = strikeOn(result, boltOf(bolt, s) * amount, ofStrike(flash, s), 1.0);" +
      "    }" +
      "  }" +
      "  result = min(result + object, vec3(1.0));" +
      "  for (int s = 0; s < 3; s++) {" +
      "    if (float(s) >= uStrikeCount) { break; }" +
      "    float near = ofStrike(uStrikeNear, s);" +
      "    if (!(near < objectNear - 0.004)) {" +
      "      float amount = clamp((near - backNear) / 0.05 + 0.5, 0.0, 1.0);" +
      "      result = strikeOn(result, boltOf(bolt, s) * amount, ofStrike(flash, s), 1.0);" +
      "    }" +
      "  }" +
      "  return result;" +
      "}" +
      "float planeHaze(float near) {" +
      "  return 0.15 + 0.85 * smoothstep(0.0, 0.6, near);" +
      "}" +
      // a text upside down in the surface: only its lit pixels, fading out and
      // getting blurred away from the surface
      "vec3 textReflected(float x, float y, vec2 off, vec4 box, sampler2D mask, vec3 r) {" +
      "  if (r.z <= 0.0 || y <= r.x) { return vec3(0.0); }" +
      "  vec2 s = vec2(x, 2.0 * r.x - y) + off;" +
      "  if (!inLetters(s, box, mask)) { return vec3(0.0); }" +
      "  float close = clamp(1.0 - (r.x - s.y) / r.y, 0.0, 1.0);" +
      "  float b = (0.5 + 2.5 * (1.0 - close)) * (1.0 - uSharpness);" +
      "  vec3 text = (2.0 * picture(s) + picture(s + vec2(b, 0.0)) +" +
      "    picture(s - vec2(b, 0.0)) + picture(s + vec2(0.0, b)) +" +
      "    picture(s - vec2(0.0, b))) / 6.0;" +
      "  float fade = close > 0.0 ? mix(close, 1.0, uSharpness) : 0.0;" +
      "  return text * fade * r.z;" +
      "}" +
      "void main() {" +
      "  float x = gl_FragCoord.x;" +
      "  float y = uScreen.y - gl_FragCoord.y;" +
      "  vec4 frame = texture2D(uFrame, gl_FragCoord.xy / uScreen);" +
      "  vec3 color = frame.rgb;" +
      // Nearness view: each pixel's nearness in grey, and in red the lines on the
      // plane where each fog layer meets it (as backNear below)
      "  if (uDebugNear) {" +
      "    vec3 shade = vec3(frame.a);" +
      "    if (uPlane) {" +
      "      for (int k = 0; k < 25; k++) {" +
      "        if (float(k) >= uDebugLayers.z) { break; }" +
      "        float line = uPlaneTop + (uDebugLayers.x - float(k) * uDebugLayers.y) * (uScreen.y - uPlaneTop) * uPlaneNearest;" +
      "        if (abs(y - line) < 0.5) { shade = vec3(1.0, 0.0, 0.0); }" +
      "      }" +
      "    }" +
      "    gl_FragColor = vec4(shade, 1.0);" +
      "    return;" +
      "  }" +
      // the strikes at this point: the light of their bolts and flashes
      "  vec4 bolt = vec4(0.0, 0.0, 0.0, -1.0);" +
      "  vec3 flash = vec3(0.0);" +
      // how much of each flash is seen here (less on the water nearer than its strike)
      "  vec3 flashFront = vec3(1.0);" +
      "  if (uStrikeCount > 0.0) {" +
      "    bolt = boltAt(vec2(x, y));" +
      "    flash = flashesAt(vec2(x, y));" +
      "  }" +
      // what is behind the rain: the plane, or the dark far distance above it
      "  vec3 back = vec3(0.0);" +
      "  float backNear = -1.0;" +
      "  if (uPlane && y > uPlaneTop) {" +
      // 0 at the far line, 1 at the bottom of the screen
      "    float near = (y - uPlaneTop) / (uScreen.y - uPlaneTop);" +
      // small waves from the wind, bigger at the front
      "    float amp = 0.4 + 1.6 * near;" +
      // light and dark bands of the surface, for its grey tone
      "    float shade = 0.06 * sin(y * 0.09 + x * 0.011 + uTime * 0.8) +" +
      "      0.04 * sin(y * 0.05 - x * 0.017 - uTime * 1.3);" +
      "    vec2 off = vec2(" +
      "      amp * (sin(y * 0.31 + uTime * 1.7) + 0.6 * sin(y * 0.77 - uTime * 2.9 + x * 0.013))," +
      "      (0.3 + 0.7 * near) * 0.6 * sin(x * 0.021 + uTime * 1.1 + y * 0.05));" +
      // rings from drops and splash characters touching the surface, flattened
      // by the perspective; they spread over the plane and get weaker as they
      // grow and age. Rings that cross add up, so they are stronger there
      "    float rings = 0.0;" +
      "    float slope = 0.0;" +
      "    if (uWaveSim) {" +
      // the height of the water, and its slope bends the reflection
      // where this pixel is on the plane seen from above (see planeWorldWidth)
      "      float scale = uPlaneScale + (1.0 - uPlaneScale) * near;" +
      "      vec2 w = vec2(0.5 + (x - 0.5 * uScreen.x) * uPlaneScale / (scale * uScreen.x)," +
      "        (1.0 / uPlaneScale - 1.0 / scale) / (1.0 / uPlaneScale - 1.0));" +
      "      float h = texture2D(uWaves, w).r;" +
      "      float hx = texture2D(uWaves, w + vec2(uWaveTexel.x, 0.0)).r -" +
      "        texture2D(uWaves, w - vec2(uWaveTexel.x, 0.0)).r;" +
      "      float hy = texture2D(uWaves, w + vec2(0.0, uWaveTexel.y)).r -" +
      "        texture2D(uWaves, w - vec2(0.0, uWaveTexel.y)).r;" +
      // smaller further back, like the rings themselves
      "      off += vec2(hx, hy * 0.4) * 18.0 * scale * scale * uRippleIntensity;" +
      "      rings = -h * 10.0 * uRippleIntensity;" +
      // with no reflection, the slopes facing the far sky catch its light and the others
      // do not, so the rings stay seen while they spread (at most 30% lighter or darker,
      // or where many rings cross the water turns to black and white chop)
      "      if (!uReflect) { slope = hy * 150.0 * scale * uRippleIntensity; slope = 0.3 * slope / (1.0 + abs(slope)); }" +
      "    }" +
      "    for (int i = 0; i < 32; i++) {" +
      "      if (uWaveSim) { break; }" +
      "      vec4 r = uRipple[i];" +
      "      float life = 1.0 - r.z / uRippleLife;" +
      "      if (r.z < 0.0 || life <= 0.0) { continue; }" +
      "      float squash = 0.15 + 0.25 * r.w;" +
      "      vec2 d = vec2(x - r.x, (y - r.y) / squash);" +
      "      float dist = length(d);" +
      "      float radius = r.z * uRippleSpeed * (0.4 + 0.6 * r.w) * (0.6 + 0.4 * uRippleStrength[i]);" +
      "      float width = 3.0 + 6.0 * r.w + radius * 0.04;" +
      "      float ring = (dist - radius) / width;" +
      "      float fade = life / (1.0 + radius * 0.004);" +
      "      float wave = sin(ring * 3.0) * exp(-ring * ring) * fade * (1.0 + 2.0 * r.w)" +
      "        * uRippleIntensity * uRippleStrength[i];" +
      "      if (dist > 0.001) { off += d / dist * wave * vec2(1.0, squash); }" +
      "      rings += wave;" +
      "    }" +
      // the surface: a subtle grey (lighter and darker with the wind), plus the
      // reflection layer moved by the waves and rings
      "    vec3 surface = uPlaneTone * clamp(1.0 + shade, 0.0, 2.5);" +
      "    if (uReflect) {" +
      "      vec2 src = vec2(x, y) + off;" +
      "      float blur = (0.5 + 1.0 * near) * (1.0 - uSharpness);" +
      "      surface += (2.0 * reflected(src) + reflected(src + vec2(blur, 0.0)) +" +
      "        reflected(src - vec2(blur, 0.0)) + reflected(src + vec2(0.0, blur)) +" +
      "        reflected(src - vec2(0.0, blur))) / 6.0;" +
      "    }" +
      // for each strike: the water nearer than it, below the line where it strikes:
      // the flash there fades out over half the reach of its reflection, while the
      // reflection comes in, so there is no line where the one ends and the other
      // starts. Its bolt and flash upside down, moved by the waves and rings like
      // the rest of the reflection, fading away from the surface like the reflected
      // rain (see reflectCharacter)
      "    vec3 flashMirror = vec3(0.0);" +
      "    for (int s = 0; s < 3; s++) {" +
      "      if (float(s) >= uStrikeCount) { break; }" +
      "      vec3 mirror = s == 0 ? uBoltMirror[0] : s == 1 ? uBoltMirror[1] : uBoltMirror[2];" +
      "      if (y <= mirror.x) { continue; }" +
      "      float front = 1.0 - smoothstep(0.0, 0.5 * mirror.y, y - mirror.x);" +
      "      if (s == 0) { flashFront.x = front; } else if (s == 1) { flashFront.y = front; } else { flashFront.z = front; }" +
      "      if (!uReflect || mirror.z <= 0.0) { continue; }" +
      "      float close = clamp(1.0 - (y - mirror.x) / mirror.y, 0.0, 1.0);" +
      "      float fade = close > 0.0 ? mix(close, 1.0, uSharpness) : 0.0;" +
      "      if (fade <= 0.0) { continue; }" +
      "      vec2 m = vec2(x, 2.0 * mirror.x - y) + off;" +
      "      float seen = flashAt(m, s) * fade * mirror.z * (1.0 - front);" +
      "      if (s == 0) { flashMirror.x = seen; } else if (s == 1) { flashMirror.y = seen; } else { flashMirror.z = seen; }" +
      "      surface = strikeOn(min(surface, vec3(1.0)), boltOf(boltAt(m), s) * fade * mirror.z, seen, 1.0);" +
      "    }" +
      // the clock and the message, upside down
      "    if (uReflect && uTextReflect) {" +
      "      surface += textReflected(x, y, off, uTextBox0, uTextMask0, uTextReflection0);" +
      "      surface += textReflected(x, y, off, uTextBox1, uTextMask1, uTextReflection1);" +
      "    }" +
      // the rings darken their troughs and lighten their crests, more where they
      // are strong (also where rings cross); this keeps the color of the surface
      // and reflection: darker towards black, lighter towards white, black stays black
      "    float level = clamp(rings / 1.5, -1.0, 1.0);" +
      "    float dark = smoothstep(0.03, 0.15, -level) * -level * uRippleDarkening;" +
      "    float light = smoothstep(0.03, 0.15, level) * level * uRippleLightening;" +
      "    surface *= 1.0 - dark;" +
      "    surface = min(surface / max(1.0 - light, 0.001), vec3(1.0));" +
      // the slopes' light, with no reflection (see above): as the rings', but without
      // their threshold, so the rings are seen as long as their slopes are
      "    surface *= 1.0 - max(-slope, 0.0) * uRippleDarkening;" +
      "    surface = min(surface / max(1.0 - max(slope, 0.0) * uRippleLightening, 0.001), vec3(1.0));" +
      // the crests of the rings catch the flash: the flash itself, or its reflection
      // where it has handed over to it (at most 60% of it, so the troughs do not
      // look like holes next to them)
      "    if (uStrikeCount > 0.0) {" +
      "      vec3 caught = max(flashMirror, flash * flashFront);" +
      "      float glint = max(max(caught.x, caught.y), caught.z) * 0.6 * smoothstep(0.05, 0.6, level);" +
      "      surface = 1.0 - (1.0 - surface) * (1.0 - uFlashWhite * glint);" +
      "    }" +
      // the plane fades into the distance towards the far line
      "    surface *= clamp((y - uPlaneTop) / 4.0, 0.0, 1.0) * planeHaze(near);" +
      "    back = surface;" +
      // the nearness of the drops that land on this line (as planeLine), so the
      // fog layers meet the plane where the drops at their distance land
      "    backNear = clamp((y - uPlaneTop) / ((uScreen.y - uPlaneTop) * uPlaneNearest), 0.0, 1.2);" +
      "  }" +
      "  float blur = 0.0;" +
      "  if (uFog > 0.0) {" +
      "    color = withFog(back, backNear, color, frame.a, bolt, flash * flashFront, blur);" +
      "  } else if (uStrikeCount > 0.0) {" +
      "    color = withStrike(back, backNear, color, frame.a, bolt, flash * flashFront);" +
      "  } else {" +
      "    color = min(color + back, vec3(1.0));" +
      "  }" +
      // for the fog's blur: the letters of the clock and the message are never
      // blurred (like the fog, which is always behind them)
      "  if (uSceneOut) {" +
      "    if (inText(vec2(x, y))) { blur = 0.0; }" +
      "    gl_FragColor = vec4(color, blur);" +
      "    return;" +
      "  }" +
      // the glow of the rain
      "  if (uBloomStrength > 0.0) {" +
      "    color = min(color + texture2D(uBloom, gl_FragCoord.xy / uScreen).rgb * uBloomStrength, vec3(1.0));" +
      "  }" +
      "  gl_FragColor = vec4(recolorText(color, x, y), 1.0);" +
      "}",
  );

  // splash characters: smoothly scaled characters blended over the picture
  GL.particleProgram = glProgram(
    pixelVertex +
      "attribute vec2 aPos;" +
      "attribute vec2 aUV;" +
      "attribute vec4 aColor;" +
      // how near it is (for the fog)
      "attribute float aNear;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying float vNear;" +
      "varying vec2 vFogUV;" +
      "void main() {" +
      "  gl_Position = toClip(aPos);" +
      "  vUV = aUV;" +
      "  vColor = aColor;" +
      "  vNear = aNear;" +
      "  vFogUV = vec2(aPos.x / uScreen.x, 1.0 - aPos.y / uScreen.y);" +
      "}",
    highp +
      fogShader +
      "uniform sampler2D uText;" +
      // 1 when drawing the glow layer: only what the fog lets through glows
      "uniform float uFogGlow;" +
      "varying vec2 vFogUV;" +
      // 1: write the nearness (alpha of the screen image, for the fog) where the
      // character covers the picture, instead of drawing it
      "uniform float uDepth;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying float vNear;" +
      "void main() {" +
      "  float a = texture2D(uText, vUV).a * vColor.a;" +
      "  if (uFogGlow > 0.5) { a *= fogThrough(vFogUV, vNear); }" +
      "  if (uDepth > 0.5) {" +
      "    if (a < 0.25) { discard; }" +
      "    gl_FragColor = vec4(0.0, 0.0, 0.0, vNear);" +
      "  } else {" +
      "    gl_FragColor = vec4(vColor.rgb * a, a);" +
      "  }" +
      "}",
  );

  // reflected characters: upside down, sharp or blurred, blended onto the
  // reflection layer
  GL.reflectProgram = glProgram(
    pixelVertex +
      "attribute vec2 aPos;" +
      "attribute vec2 aUV;" +
      "attribute vec4 aColor;" +
      "attribute float aBlur;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying float vBlur;" +
      "void main() { gl_Position = toClip(aPos); vUV = aUV; vColor = aColor; vBlur = aBlur; }",
    highp +
      "uniform sampler2D uSharp;" +
      "uniform sampler2D uBlurred;" +
      "varying vec2 vUV;" +
      "varying vec4 vColor;" +
      "varying float vBlur;" +
      "void main() {" +
      "  float a = mix(texture2D(uSharp, vUV).a, texture2D(uBlurred, vUV).a, vBlur) * vColor.a;" +
      "  gl_FragColor = vec4(vColor.rgb * a, a);" +
      "}",
  );

  if (
    !GL.fadeProgram ||
    !GL.dropProgram ||
    !GL.presentProgram ||
    !GL.particleProgram ||
    !GL.reflectProgram
  ) {
    gl = null;
    return;
  }
  glInitWaves(pixelVertex, highp);
  glInitBloom(highp);
  glInitFog(highp);
  glInitFogBlur(highp, textShader);
  glInitBolt(pixelVertex, highp);
  GL.reflectBuffer = gl.createBuffer();
  GL.textAtlasBlurredTexture = glTexture();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  GL.particleBuffer = gl.createBuffer();
  GL.textAtlasTexture = glTexture();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  GL.textAtlasDirty = true;

  // instanced drawing: each drop is sent to the GPU once, in 12 bytes, and the
  // shader builds its square; without the extension the drops are sent as squares
  GL.instancing = gl.getExtension("ANGLE_instanced_arrays");
  if (GL.instancing) {
    GL.dropInstanceProgram = glProgram(
      pixelVertex +
        // corner of the square: (0,0) to (1,1)
        "attribute vec2 aCorner;" +
        // per drop: top left of the cell, character, font size, color
        "attribute vec2 aCell;" +
        "attribute float aGlyph;" +
        "attribute float aSize;" +
        // color and nearness (1 for the clock or message: no fog)
        "attribute vec4 aColor;" +
        "uniform float uAtlasColumns;" +
        "uniform vec2 uCellUV;" +
        "varying vec2 vUV;" +
        "varying vec4 vColor;" +
        "varying vec2 vFogUV;" +
        "void main() {" +
        "  vec2 p = aCell + aCorner * aSize;" +
        "  gl_Position = toClip(p);" +
        "  float row = floor((aGlyph + 0.5) / uAtlasColumns);" +
        "  vec2 cell = vec2(aGlyph - row * uAtlasColumns, row);" +
        "  vUV = (cell + aCorner) * uCellUV;" +
        "  vColor = aColor;" +
        "  vFogUV = vec2(p.x / uScreen.x, 1.0 - p.y / uScreen.y);" +
        "}",
      highp +
        fogShader +
        "uniform sampler2D uAtlas;" +
        // 1 when drawing the glow layer: only what the fog lets through glows
        "uniform float uFogGlow;" +
        "varying vec2 vUV;" +
        "varying vec4 vColor;" +
        "varying vec2 vFogUV;" +
        // the nearness is kept in the alpha of the screen image, for the fog
        "void main() {" +
        "  vec3 color = texture2D(uAtlas, vUV).r * vColor.rgb;" +
        "  if (uFogGlow > 0.5) { color *= fogThrough(vFogUV, vColor.a); }" +
        "  gl_FragColor = vec4(color, vColor.a);" +
        "}",
    );
    if (GL.dropInstanceProgram) {
      GL.cornerBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, GL.cornerBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
        gl.STATIC_DRAW,
      );
      GL.instanceBuffer = gl.createBuffer();
      glAllocateInstances(4096);
    } else {
      GL.instancing = null;
    }
  }

  GL.fadeData = new Float32Array(64 * 36);
  GL.dropData = new Float32Array(1024 * 48);
  GL.fadeBuffer = gl.createBuffer();
  GL.dropBuffer = gl.createBuffer();
  GL.screenBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.screenBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  GL.atlasTexture = glTexture();
  GL.columnTexture = glTexture();
  GL.frameTexture = glTexture();
  // the reflection layer, the same size as the screen image
  GL.reflectTexture = glTexture();
  GL.frameWidth = 1;
  GL.frameHeight = 1;
  glResizeFrame(1, 1);
  GL.frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, GL.frameBuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    GL.frameTexture,
    0,
  );
  GL.reflectFrameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, GL.reflectFrameBuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    GL.reflectTexture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  GL.atlasDirty = true;
}

// ---------------------------------------------------------------------------
// Distance fog
// Fog layers lie one behind the other between the back and the front (see
// fogLayers). Each frame all of them are drawn into one atlas (GL.fogTarget, one
// tile of a quarter of the screen size per layer): the color (a mix of the two
// fog colors) and density of the clouds. Each layer has clouds of its own that
// slide in a direction of their own, with turbulence of their own for the density
// and for the mix of the colors, as fast as Fog movement; further back they are
// smaller and slower. The
// present shader puts them between the plane and the rain, see withFog.
// The noise comes from a small texture of random values (GL.noiseTexture), which
// is much cheaper than computing it.
// ---------------------------------------------------------------------------

function glInitFog(highp) {
  GL.fogProgram = glProgram(
    "attribute vec2 aPos;" + "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
    highp +
      // columns of the atlas, number of layers, nearness of the first layer and
      // the step between them; size of a tile in pixels
      "uniform vec4 uGrid;" +
      "uniform vec2 uTile;" +
      "uniform float uTime;" +
      // how large things are at the far line (see planeScale)
      "uniform float uFarScale;" +
      "uniform vec3 uColor1;" +
      "uniform vec3 uColor2;" +
      "uniform sampler2D uNoise;" +
      "float hash(float n) { return fract(sin(n) * 43758.5453); }" +
      // smooth noise from the texture of random values
      "float noise(vec2 p) {" +
      "  vec2 i = floor(p);" +
      "  vec2 f = fract(p);" +
      "  f = f * f * (3.0 - 2.0 * f);" +
      "  return texture2D(uNoise, (i + f + 0.5) / 256.0).r;" +
      "}" +
      // five sizes of noise, each turned so they do not line up
      "float clouds(vec2 p) {" +
      "  float sum = 0.0;" +
      "  float amount = 0.5;" +
      "  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);" +
      "  for (int i = 0; i < 5; i++) {" +
      "    sum += amount * noise(p);" +
      "    p = turn * p;" +
      "    amount *= 0.5;" +
      "  }" +
      "  return sum;" +
      "}" +
      "void main() {" +
      "  vec2 cell = floor(gl_FragCoord.xy / uTile);" +
      "  float k = cell.y * uGrid.x + cell.x;" +
      "  if (k >= uGrid.y) { gl_FragColor = vec4(0.0); return; }" +
      "  vec2 p = (gl_FragCoord.xy - cell * uTile) / uTile.y;" +
      // the layer: its nearness and how large things look there
      "  float near = uGrid.z - k * uGrid.w;" +
      "  float scale = uFarScale + (1.0 - uFarScale) * clamp(near, 0.0, 1.0);" +
      "  float t = uTime * scale;" +
      // its own directions: where it slides, how its density and colors swirl
      "  float slide = hash(k * 12.9898 + 1.3) * 6.2832;" +
      "  float swirl = hash(k * 78.233 + 4.1) * 6.2832;" +
      "  float tint = hash(k * 37.719 + 7.7) * 6.2832;" +
      "  vec2 s = p * (2.0 / scale) + vec2(hash(k + 0.5), hash(k + 9.5)) * 100.0;" +
      "  s += vec2(cos(slide), sin(slide)) * t * 0.05;" +
      "  vec2 q = vec2(clouds(s + vec2(cos(swirl), sin(swirl)) * t * 0.04)," +
      "    clouds(s + vec2(5.2, 1.3) - vec2(sin(swirl), cos(swirl)) * t * 0.03));" +
      // a veil everywhere, thicker in the clouds: a layer has no holes, so it
      // covers what is behind it from where it is (also the first one, at the
      // front, which has nothing in front of it to fill its gaps)
      "  float density = 0.4 + 0.6 * smoothstep(0.35, 0.85, clouds(s + 2.2 * q));" +
      "  vec2 r = vec2(clouds(s * 0.6 + 3.0 + vec2(cos(tint), sin(tint)) * t * 0.045)," +
      "    clouds(s * 0.6 + 11.0 - vec2(sin(tint), cos(tint)) * t * 0.035));" +
      "  float mixing = smoothstep(0.35, 0.65, clouds(s * 0.5 + 2.0 * r + 7.0));" +
      "  gl_FragColor = vec4(mix(uColor1, uColor2, mixing), density);" +
      "}",
  );
  if (!GL.fogProgram) {
    return;
  }
  // random values for the noise; repeating, smoothly sampled
  var values = new Uint8Array(256 * 256);
  for (var i = 0; i < values.length; i++) {
    values[i] = Math.floor(Math.random() * 256);
  }
  GL.noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, GL.noiseTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 256, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, values);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  GL.fogTarget = glBloomTarget();
  GL.fogReady = false;
  GL.fog = true;
}

// the fog uniforms of a program with fogShader; glow: whether it draws the glow
// layer (uFogGlow)
function glFogUniforms(info, glow) {
  var fog = GL.fogReady && useFog && planeActive();
  gl.uniform1f(info.uniforms.uFog, fog ? FogIntensity : 0);
  if (info.uniforms.uFogGlow) {
    gl.uniform1f(info.uniforms.uFogGlow, glow && fog ? 1 : 0);
  }
  if (fog) {
    var layers = fogLayers();
    gl.uniform1i(info.uniforms.uFogAtlas, 7);
    gl.uniform4f(info.uniforms.uFogGrid, GL.fogColumns, layers.count, layers.first, layers.step);
    gl.uniform4f(info.uniforms.uFogTile, GL.fogTileWidth, GL.fogTileHeight,
      GL.fogTarget.width, GL.fogTarget.height);
  }
}

// draw the fog layers of this frame into their atlas (bound to texture unit 7)
function glFog() {
  GL.fogReady = false;
  if (!GL.fog || !useFog || !planeActive()) {
    return;
  }
  var layers = fogLayers();
  var columns = Math.ceil(Math.sqrt(layers.count));
  var rows = Math.ceil(layers.count / columns);
  var tileWidth = Math.max(1, Math.ceil(GL.frameWidth / 4));
  var tileHeight = Math.max(1, Math.ceil(GL.frameHeight / 4));
  // the atlas must fit the largest texture of the graphics card
  if (!GL.maxTextureSize) {
    GL.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }
  var fit = Math.min(1, GL.maxTextureSize / (tileWidth * columns), GL.maxTextureSize / (tileHeight * rows));
  tileWidth = Math.max(1, Math.floor(tileWidth * fit));
  tileHeight = Math.max(1, Math.floor(tileHeight * fit));
  var target = GL.fogTarget;
  // not bound for reading while it is drawn into
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  if (target.width != tileWidth * columns || target.height != tileHeight * rows) {
    glSizeBloomTarget(target, tileWidth * columns, tileHeight * rows);
  }
  glBindBloomTarget(target);
  var info = GL.fogProgram;
  glUse(info, GL.screenBuffer, null, { aPos: 2 });
  gl.uniform4f(info.uniforms.uGrid, columns, layers.count, layers.first, layers.step);
  gl.uniform2f(info.uniforms.uTile, tileWidth, tileHeight);
  // the fog moves at the speed of Fog movement (the step is limited, so it does
  // not jump after the wallpaper was paused)
  var now = Date.now();
  FogTime = (FogTime + (Math.min(500, now - LastFogTime) / 1000) * FogMovement) % 100000;
  LastFogTime = now;
  gl.uniform1f(info.uniforms.uTime, FogTime);
  gl.uniform1f(info.uniforms.uFarScale, planeScale());
  gl.uniform3f(info.uniforms.uColor1, FogColor1[0], FogColor1[1], FogColor1[2]);
  gl.uniform3f(info.uniforms.uColor2, FogColor2[0], FogColor2[1], FogColor2[2]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.noiseTexture);
  gl.uniform1i(info.uniforms.uNoise, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  glDone(info);
  gl.activeTexture(gl.TEXTURE7);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.activeTexture(gl.TEXTURE0);
  GL.fogColumns = columns;
  GL.fogTileWidth = tileWidth;
  GL.fogTileHeight = tileHeight;
  GL.fogReady = true;
}

// ---------------------------------------------------------------------------
// Fog blur
// The fog layers blur what is behind them: the rain, splashes, the water and its
// rings, the strike and the fog layers further back. With the fog on, the present
// shader draws the picture into GL.sceneTarget, with how blurred each pixel should
// be in its alpha: every fog layer in front of what it shows blurs it by its own
// radius, FogBlurLayer times the layer's cover there (with Fog intensity), and the
// blurs of all those layers add up (see withFog); the letters of the clock and the
// message are never blurred. Drawing the picture again for each layer would cost
// too much, so three blurred copies are made of it (glFogBlur), at a half, a
// quarter and an eighth of the size, with the radii of FogBlurCopies. Each is
// premultiplied by how blurred its pixels should be: so something sharp in front
// does not spread onto what is behind it, and dividing by the blurred alpha gives
// the color of what should be blurred there. The last pass (glShowFogBlur) goes
// from the sharp picture through the copies to each pixel's own radius, then adds
// the glow and recolors the clock and message.
// ---------------------------------------------------------------------------

function glInitFogBlur(highp, textShader) {
  // one direction of the blur (9 samples of a gaussian curve, uStep: one step), or
  // with uFirst the half-size copy of the picture, premultiplied by its alpha
  // (uStep: one pixel of the picture)
  GL.fogBlurProgram = glProgram(
    "attribute vec2 aPos;" +
      "varying vec2 vUV;" +
      "void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aPos * 0.5 + 0.5; }",
    highp +
      "uniform sampler2D uSource;" +
      "uniform vec2 uStep;" +
      "uniform float uFirst;" +
      "varying vec2 vUV;" +
      // a pixel's weight: full for anything blurred more than a little, so the
      // copies keep the picture's precision; only the sharp things in front are
      // left out
      "vec4 weighted(vec2 uv) {" +
      "  vec4 s = texture2D(uSource, uv);" +
      "  float w = clamp(s.a * 8.0, 0.0, 1.0);" +
      "  return vec4(s.rgb * w, w);" +
      "}" +
      "void main() {" +
      "  if (uFirst > 0.5) {" +
      // the four pixels of the picture under this one, each premultiplied
      "    gl_FragColor = 0.25 * (weighted(vUV + vec2(-0.5, -0.5) * uStep) +" +
      "      weighted(vUV + vec2(0.5, -0.5) * uStep) + weighted(vUV + vec2(-0.5, 0.5) * uStep) +" +
      "      weighted(vUV + vec2(0.5, 0.5) * uStep));" +
      "    return;" +
      "  }" +
      "  vec4 sum = texture2D(uSource, vUV) * 0.2270;" +
      "  sum += (texture2D(uSource, vUV + uStep) + texture2D(uSource, vUV - uStep)) * 0.1945;" +
      "  sum += (texture2D(uSource, vUV + 2.0 * uStep) + texture2D(uSource, vUV - 2.0 * uStep)) * 0.1216;" +
      "  sum += (texture2D(uSource, vUV + 3.0 * uStep) + texture2D(uSource, vUV - 3.0 * uStep)) * 0.0540;" +
      "  sum += (texture2D(uSource, vUV + 4.0 * uStep) + texture2D(uSource, vUV - 4.0 * uStep)) * 0.0162;" +
      "  gl_FragColor = sum;" +
      "}",
  );
  // the picture with the fog's blur, the glow and the recolored clock or message
  GL.fogShowProgram = glProgram(
    "attribute vec2 aPos;" + "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
    highp +
      textShader +
      "uniform vec2 uScreen;" +
      // the picture with each pixel's blur radius in its alpha (a part of
      // uFogBlurMax), its three blurred copies and their radii (pixels), and the glow
      "uniform sampler2D uScene;" +
      "uniform sampler2D uBlur1;" +
      "uniform sampler2D uBlur2;" +
      "uniform sampler2D uBlur3;" +
      "uniform vec3 uBlurRadii;" +
      "uniform float uFogBlurMax;" +
      "uniform sampler2D uBloom;" +
      "uniform float uBloomStrength;" +
      // the color of what should be blurred at a point of a blurred copy (it is
      // premultiplied by how blurred it should be)
      "vec3 blurred(vec4 b, vec3 fallback) {" +
      "  return b.a > 0.004 ? min(b.rgb / b.a, vec3(1.0)) : fallback;" +
      "}" +
      "void main() {" +
      "  float x = gl_FragCoord.x;" +
      "  float y = uScreen.y - gl_FragCoord.y;" +
      "  vec2 uv = gl_FragCoord.xy / uScreen;" +
      "  vec4 scene = texture2D(uScene, uv);" +
      "  vec3 one = blurred(texture2D(uBlur1, uv), scene.rgb);" +
      "  vec3 two = blurred(texture2D(uBlur2, uv), one);" +
      "  vec3 three = blurred(texture2D(uBlur3, uv), two);" +
      // between the copies whose radii are on either side of this pixel's
      "  float r = scene.a * uFogBlurMax;" +
      "  vec3 R = uBlurRadii;" +
      "  vec3 color = r < R.x ? mix(scene.rgb, one, r / R.x) :" +
      "    r < R.y ? mix(one, two, (r - R.x) / (R.y - R.x)) :" +
      "    mix(two, three, clamp((r - R.y) / (R.z - R.y), 0.0, 1.0));" +
      // the glow of the rain
      "  if (uBloomStrength > 0.0) {" +
      "    color = min(color + texture2D(uBloom, uv).rgb * uBloomStrength, vec3(1.0));" +
      "  }" +
      "  gl_FragColor = vec4(recolorText(color, x, y), 1.0);" +
      "}",
  );
  if (!GL.fogBlurProgram || !GL.fogShowProgram) {
    return;
  }
  // made when the fog is first used: the picture, and the three copies with the
  // targets of their first direction (see glResizeFogBlur)
  GL.sceneTarget = null;
  GL.fogBlurTargets = null;
  GL.fogBlurWidth = 0;
  GL.fogBlurHeight = 0;
  GL.fogBlurOn = true;
}

// is the fog's blur used in this frame?
function glFogBlurReady() {
  return !!GL.fogBlurOn && FogBlurLayer > 0 && GL.fogReady && useFog && planeActive() &&
    !(useDebug && DebugNearness);
}

// make the fog's blur textures fit the screen image
function glResizeFogBlur() {
  if (!GL.sceneTarget) {
    GL.sceneTarget = glBloomTarget();
    GL.fogBlurTargets = [];
    for (var n = 0; n < 6; n++) {
      GL.fogBlurTargets.push(glBloomTarget());
    }
  }
  if (GL.fogBlurWidth == GL.frameWidth && GL.fogBlurHeight == GL.frameHeight) {
    return;
  }
  glSizeBloomTarget(GL.sceneTarget, GL.frameWidth, GL.frameHeight);
  // the copies in half floats where the graphics card can draw into them and smooth
  // them, so they keep their gradients without bands
  var type = GL.halfFloat && GL.halfLinear ? GL.halfFloat : gl.UNSIGNED_BYTE;
  for (var n = 0; n < 6; n++) {
    // half size (0 and 1), a quarter (2 and 3), an eighth (4 and 5)
    var part = n < 2 ? 2 : n < 4 ? 4 : 8;
    var width = Math.max(1, Math.ceil(GL.frameWidth / part));
    var height = Math.max(1, Math.ceil(GL.frameHeight / part));
    glSizeBloomTarget(GL.fogBlurTargets[n], width, height, type);
    if (type != gl.UNSIGNED_BYTE &&
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      // not after all: bytes for all of them
      type = gl.UNSIGNED_BYTE;
      n = -1;
    }
  }
  GL.fogBlurWidth = GL.frameWidth;
  GL.fogBlurHeight = GL.frameHeight;
}

// the radii of the three blurred copies (pixels; the last is also the largest
// radius a pixel's alpha can hold)
function fogBlurRadii() {
  var r = [];
  for (var n = 0; n < 3; n++) {
    r.push(Math.max(n == 0 ? 0.5 : r[n - 1] + 0.5, FogBlurCopies[n] * GL.frameHeight));
  }
  return r;
}

// blur the picture into its three copies (GL.fogBlurTargets 0, 2 and 4), each from
// the one before it. The 9 samples spread a Gaussian of about 1.8 steps; a copy
// adds the blur that is missing from the one before (the squares of radii add)
function glFogBlur() {
  var targets = GL.fogBlurTargets;
  var info = GL.fogBlurProgram;
  var radii = fogBlurRadii();
  var steps = [];
  for (var n = 0; n < 3; n++) {
    var before = n == 0 ? 0 : radii[n - 1];
    steps.push(Math.sqrt(radii[n] * radii[n] - before * before) / (1.8 * Math.pow(2, n + 1)));
  }
  glUse(info, GL.screenBuffer, null, { aPos: 2 });
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(info.uniforms.uSource, 0);
  // the half-size copy, premultiplied
  glBindBloomTarget(targets[0]);
  gl.bindTexture(gl.TEXTURE_2D, GL.sceneTarget.texture);
  gl.uniform1f(info.uniforms.uFirst, 1);
  gl.uniform2f(info.uniforms.uStep, 1 / GL.sceneTarget.width, 1 / GL.sceneTarget.height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.uniform1f(info.uniforms.uFirst, 0);
  // from target to target, by a step across and down: the first copy across, then
  // down (back into 0), from it the second (into 2), and from that the third (4)
  var passes = [
    [0, 1, steps[0], 0],
    [1, 0, 0, steps[0]],
    [0, 3, steps[1], 0],
    [3, 2, 0, steps[1]],
    [2, 5, steps[2], 0],
    [5, 4, 0, steps[2]],
  ];
  for (var n = 0; n < passes.length; n++) {
    var from = targets[passes[n][0]];
    var to = targets[passes[n][1]];
    glBindBloomTarget(to);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.uniform2f(info.uniforms.uStep, passes[n][2] / to.width, passes[n][3] / to.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  glDone(info);
}

// show the picture with the fog's blur on the screen (see glInitFogBlur)
function glShowFogBlur(bloom) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  var info = GL.fogShowProgram;
  glUse(info, GL.screenBuffer, null, { aPos: 2 });
  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  var radii = fogBlurRadii();
  gl.uniform3f(info.uniforms.uBlurRadii, radii[0], radii[1], radii[2]);
  gl.uniform1f(info.uniforms.uFogBlurMax, radii[2]);
  var textures = [GL.sceneTarget, GL.fogBlurTargets[0], GL.fogBlurTargets[2], GL.fogBlurTargets[4]];
  var names = ["uScene", "uBlur1", "uBlur2", "uBlur3"];
  // (the fog atlas is bound to unit 7 again when the next frame's fog is drawn)
  var units = [0, 2, 4, 7];
  for (var n = 0; n < 4; n++) {
    gl.activeTexture(gl.TEXTURE0 + units[n]);
    gl.bindTexture(gl.TEXTURE_2D, textures[n].texture);
    gl.uniform1i(info.uniforms[names[n]], units[n]);
  }
  // the glow (unit 5), the rain colors (unit 1) and the letters' masks (units 3
  // and 6) are where the present shader had them
  gl.uniform1f(info.uniforms.uBloomStrength, bloom ? 1 : 0);
  gl.uniform1i(info.uniforms.uBloom, 5);
  gl.uniform1i(info.uniforms.uRecolor, RecolorActive ? 1 : 0);
  if (RecolorActive) {
    gl.uniform1i(info.uniforms.uColumns, 1);
    gl.uniform1f(info.uniforms.uColumnCount, ColumnCount);
    gl.uniform1f(info.uniforms.uFont, font_size);
    gl.uniform1f(info.uniforms.uShift, RainShiftX);
  }
  glTextBoxes(info);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  glDone(info);
  // not bound for reading while they are drawn into in the next frame
  for (var n = 0; n < 4; n++) {
    gl.activeTexture(gl.TEXTURE0 + units[n]);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  gl.activeTexture(gl.TEXTURE0);
}

// the areas of the clock and the message for another program, with the masks that
// glTextMask made in this frame
function glTextBoxes(info) {
  for (var k = 0; k < 2; k++) {
    gl.uniform1i(info.uniforms["uTextMask" + k], k == 0 ? 3 : 6);
    var text = textArea(TextBlocks[k]);
    if (text) {
      gl.uniform4f(info.uniforms["uTextBox" + k], text.left, text.top, text.right, text.bottom);
    } else {
      gl.uniform4f(info.uniforms["uTextBox" + k], -10, -10, -9, -9);
    }
  }
}

// ---------------------------------------------------------------------------
// Lightning bolt
// The glowing bolt of the strike playing now (see updateLightning) is drawn into a
// texture of its own (GL.boltTarget, the size of the screen image) in each frame of
// it: every straight piece of its lines is a quad round the piece, whose pixels get
// a white core (none with Characters bolt) and a glow by their distance to the
// piece. Where pieces overlap the brightest is kept (EXT_blend_minmax), so their
// joints are no brighter than the rest; without the extension they add up. All the
// strikes playing share it: its alpha says which strike a pixel's light belongs to
// (the highest where two overlap), so each is put at its own distance. The
// present shader reads it on texture unit 8, at the strike's distance and mirrored
// on the water. Without a ninth texture unit there is no glowing bolt (the flash
// and the characters bolt still play).
// ---------------------------------------------------------------------------

function glInitBolt(pixelVertex, highp) {
  if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 9) {
    return;
  }
  GL.boltProgram = glProgram(
    pixelVertex +
      "attribute vec2 aPos;" +
      // the piece (from x, y to x, y in screen pixels); its half width at its start and
      // at its end (in between in a straight line), its glow's spread (times the half
      // width) and its brightness; its core: strength (0: no core), where it starts
      // and ends fading (times the half width) and how soft its edge is (pixels, on
      // each side); its glow color; its strike (the place in Strikes, 0-2)
      "attribute vec4 aPiece;" +
      "attribute vec4 aLook;" +
      "attribute vec4 aCore;" +
      "attribute vec3 aGlow;" +
      "attribute float aStrike;" +
      "varying vec2 vPos;" +
      "varying vec4 vPiece;" +
      "varying vec4 vLook;" +
      "varying vec4 vCore;" +
      "varying vec3 vGlow;" +
      "varying float vStrike;" +
      "void main() {" +
      "  gl_Position = toClip(aPos);" +
      "  vPos = aPos;" +
      "  vPiece = aPiece;" +
      "  vLook = aLook;" +
      "  vCore = aCore;" +
      "  vGlow = aGlow;" +
      "  vStrike = aStrike;" +
      "}",
    highp +
      "varying vec2 vPos;" +
      "varying vec4 vPiece;" +
      "varying vec4 vLook;" +
      "varying vec4 vCore;" +
      "varying vec3 vGlow;" +
      "varying float vStrike;" +
      "void main() {" +
      "  vec2 a = vPiece.xy;" +
      "  vec2 ab = vPiece.zw - a;" +
      "  float h = clamp(dot(vPos - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);" +
      "  float d = length(vPos - a - ab * h);" +
      // its half width here, along the piece
      "  float w = mix(vLook.x, vLook.y, h);" +
      "  float core = (1.0 - smoothstep(vCore.y * w - vCore.w, vCore.z * w + vCore.w, d)) * vCore.x;" +
      "  float spread = vLook.z * w;" +
      "  float glow = exp(-d * d / (spread * spread));" +
      "  vec3 light = (vec3(core) + vGlow * glow) * vLook.w;" +
      // which strike this light belongs to, in the alpha ((strike + 1) / 4); only
      // where there is light, so a dark quad does not take over another strike's
      "  float lit = step(0.02, max(max(light.r, light.g), light.b));" +
      "  gl_FragColor = vec4(light, lit * (vStrike + 1.0) / 4.0);" +
      "}",
  );
  if (!GL.boltProgram) {
    return;
  }
  GL.blendMinMax = gl.getExtension("EXT_blend_minmax");
  GL.boltBuffer = gl.createBuffer();
  // made at the first strike (initGL runs before MaxBoltSegments is set)
  GL.boltData = null;
  GL.boltTarget = null;
  GL.boltReady = false;
}

// one corner of a piece's quad (see glDrawBolt)
function glBoltCorner(d, o, x, y, piece, look, strike) {
  d[o] = x;
  d[o + 1] = y;
  for (var i = 0; i < 4; i++) {
    d[o + 2 + i] = piece[i];
  }
  for (var i = 0; i < 11; i++) {
    d[o + 6 + i] = look[i];
  }
  d[o + 17] = strike;
  return o + 18;
}

// the size a line of the bolt comes in with at its start, when it goes on from
// another line's end (see boltLineParts: a route's next part, or a sibling, from its
// parent's last part; a rejoin's path from the bigger of the two that ended there; a
// route's part after a rejoin from the part before), or -1
function boltStartSize(line) {
  var last = function (x) {
    var size = Math.floor(x.size * Math.pow(BoltThinning, x.forks.length) + 0.5);
    return x.leader ? Math.max(1, size) : size;
  };
  if (line.joins) {
    return line.route ? last(line.joins[1]) : Math.max(last(line.joins[0]), last(line.joins[1]));
  }
  if (line.parent && line.at >= 1) {
    return last(line.parent);
  }
  return -1;
}

// draw the bolts of the strikes playing now into their texture (see glInitBolt)
function glDrawBolt() {
  GL.boltReady = false;
  var any = false;
  for (var n = 0; n < Strikes.length; n++) {
    any = any || Strikes[n].light > 0.01 || Strikes[n].branchLight > 0.01;
  }
  if (!GL.boltProgram || !any) {
    return;
  }
  if (!GL.boltTarget) {
    GL.boltTarget = glBloomTarget();
    // 6 corners of 18 floats for every piece
    GL.boltData = new Float32Array(MaxBoltSegments * 6 * 18);
  }
  var target = GL.boltTarget;
  // not bound for reading while it is drawn into
  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  if (target.width != GL.frameWidth || target.height != GL.frameHeight) {
    glSizeBloomTarget(target, GL.frameWidth, GL.frameHeight);
  }
  glBindBloomTarget(target);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  var data = GL.boltData;
  var piece = [0, 0, 0, 0];
  var look = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var count = 0;
  var o = 0;
  for (var n = 0; n < Strikes.length; n++) {
    var s = Strikes[n];
    if (!(s.light > 0.01 || s.branchLight > 0.01)) {
      continue;
    }
    // the main channel's core (the font size of the rain at the strike's distance) is
    // full out to a quarter of its size and gone by 3/4 of it, and its glow reaches 1.2
    // times its size. The other lines (the leaders and the branches: see boltLineParts)
    // are as wide as their size, the size of their characters (the user, 2026-10-22):
    // the core full out to half of it with an edge 1 px soft, the glow BoltGlowSpread
    // times it, BoltGlowLight as bright; where a line thins at a fork, and where it
    // goes on from another line's end at another size (see boltStartSize), its width
    // changes over BoltTaper times the bigger size, not in a step. With Characters
    // bolt the characters are the core, and only a softer glow is drawn
    var coreStrength = useCharacterBolt ? 0 : 1;
    var glowStrength = useCharacterBolt ? 0.6 : 1;
    // the channel's glow: the rain color where the bolt touches the ground, halfway
    // to white; the branches' glow is white
    var column = particleColumn(s.groundX);
    var known = ColumnRed[column] !== undefined;
    var channelGlow = [
      (0.5 + 0.5 * (known ? ColumnRed[column] : 255) / 255) * 0.8 * glowStrength,
      (0.5 + 0.5 * (known ? ColumnGreen[column] : 255) / 255) * 0.8 * glowStrength,
      (0.5 + 0.5 * (known ? ColumnBlue[column] : 255) / 255) * 0.8 * glowStrength,
    ];
    var lines = strikeLines(s);
    for (var l = 0; l < lines.length && count < MaxBoltSegments; l++) {
      var p = lines[l][0];
      var main = lines[l][1];
      var size = lines[l][2];
      var line = lines[l][5], k = lines[l][6];
      // the size it comes in with, and how far it changes over
      var from = size;
      if (!main && line) {
        if (k > 0) {
          from = Math.floor(line.size * Math.pow(BoltThinning, k - 1) + 0.5);
          from = line.leader ? Math.max(1, from) : from;
        } else {
          var start = boltStartSize(line);
          from = start > 0 ? start : size;
        }
      }
      var taper = BoltTaper * Math.max(from, size);
      look[2] = main ? 2.4 : BoltGlowSpread * 2;
      look[3] = main ? s.light : s.branchLight;
      look[4] = coreStrength;
      look[5] = main ? 0.5 : 1;
      look[6] = main ? 1.5 : 1;
      look[7] = main ? 0 : 0.5;
      for (var c = 0; c < 3; c++) {
        look[8 + c] = main ? channelGlow[c] : BoltGlowLight * glowStrength;
      }
      var along = 0;
      for (var i = 0; i + 3 < p.length && count < MaxBoltSegments; i += 2) {
        var ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
        var dx = bx - ax, dy = by - ay;
        var length = Math.sqrt(dx * dx + dy * dy);
        // its half widths at its two ends
        var w0 = (size + (from - size) * Math.max(0, 1 - along / taper)) / 2;
        along += length;
        var w1 = (size + (from - size) * Math.max(0, 1 - along / taper)) / 2;
        look[0] = w0;
        look[1] = w1;
        // the quad reaches as far as the glow can be seen
        var widest = Math.max(w0, w1);
        var margin = Math.max(1.5 * widest + (main ? 0 : 1), 3 * look[2] * widest) + 1;
        if (length > 0.0001) {
          dx /= length;
          dy /= length;
        } else {
          dx = 1;
          dy = 0;
        }
        piece[0] = ax;
        piece[1] = ay;
        piece[2] = bx;
        piece[3] = by;
        // along the piece, past both ends, and across it
        var tx = dx * margin, ty = dy * margin;
        var nx = -dy * margin, ny = dx * margin;
        var x0 = ax - tx, y0 = ay - ty, x1 = bx + tx, y1 = by + ty;
        o = glBoltCorner(data, o, x0 + nx, y0 + ny, piece, look, n);
        o = glBoltCorner(data, o, x0 - nx, y0 - ny, piece, look, n);
        o = glBoltCorner(data, o, x1 + nx, y1 + ny, piece, look, n);
        o = glBoltCorner(data, o, x1 + nx, y1 + ny, piece, look, n);
        o = glBoltCorner(data, o, x0 - nx, y0 - ny, piece, look, n);
        o = glBoltCorner(data, o, x1 - nx, y1 - ny, piece, look, n);
        count++;
      }
    }
  }
  if (count == 0) {
    return;
  }
  var info = GL.boltProgram;
  glUse(info, GL.boltBuffer, data.subarray(0, o), { aPos: 2, aPiece: 4, aLook: 4, aCore: 4, aGlow: 3, aStrike: 1 });
  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  if (GL.blendMinMax) {
    gl.blendEquation(GL.blendMinMax.MAX_EXT);
  }
  gl.drawArrays(gl.TRIANGLES, 0, count * 6);
  gl.blendEquation(gl.FUNC_ADD);
  gl.disable(gl.BLEND);
  glDone(info);
  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.activeTexture(gl.TEXTURE0);
  GL.boltReady = true;
}

// ---------------------------------------------------------------------------
// Bloom
// The glow layer (GL.bloomSource, half the screen size) fades like the rain; the
// new characters of each frame are added to it in the rain color, with the drop
// program (see glBloomCharacters). Each frame it is blurred into BloomLayers
// layers, each at half the size of the one before, which are added up into
// GL.bloomGlow; the present shader adds that to the picture.
// ---------------------------------------------------------------------------

function glInitBloom(highp) {
  // one direction of the blur: 9 samples of a gaussian curve, from a texture of
  // any size into the current target
  GL.bloomBlurProgram = glProgram(
    "attribute vec2 aPos;" +
      "varying vec2 vUV;" +
      "void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aPos * 0.5 + 0.5; }",
    highp +
      "uniform sampler2D uSource;" +
      "uniform vec2 uStep;" +
      "varying vec2 vUV;" +
      "void main() {" +
      "  vec3 sum = texture2D(uSource, vUV).rgb * 0.2270;" +
      "  sum += (texture2D(uSource, vUV + uStep).rgb + texture2D(uSource, vUV - uStep).rgb) * 0.1945;" +
      "  sum += (texture2D(uSource, vUV + 2.0 * uStep).rgb + texture2D(uSource, vUV - 2.0 * uStep).rgb) * 0.1216;" +
      "  sum += (texture2D(uSource, vUV + 3.0 * uStep).rgb + texture2D(uSource, vUV - 3.0 * uStep).rgb) * 0.0540;" +
      "  sum += (texture2D(uSource, vUV + 4.0 * uStep).rgb + texture2D(uSource, vUV - 4.0 * uStep).rgb) * 0.0162;" +
      "  gl_FragColor = vec4(sum, 1.0);" +
      "}",
  );
  // a texture copied (stretched) into the current target, times a weight
  GL.bloomCopyProgram = glProgram(
    "attribute vec2 aPos;" +
      "varying vec2 vUV;" +
      "void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUV = aPos * 0.5 + 0.5; }",
    highp +
      "uniform sampler2D uSource;" +
      "uniform float uWeight;" +
      "varying vec2 vUV;" +
      "void main() { gl_FragColor = vec4(texture2D(uSource, vUV).rgb * uWeight, 1.0); }",
  );
  if (!GL.bloomBlurProgram || !GL.bloomCopyProgram) {
    return;
  }
  // the textures are made by glResizeBloom (initGL runs before BloomLayers is set)
  GL.bloomWidth = 0;
  GL.bloomHeight = 0;
  GL.bloom = true;
}

// a smoothly sampled texture with its frame buffer, for the glow
function glBloomTarget() {
  var texture = glTexture();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return { texture: texture, frameBuffer: gl.createFramebuffer(), width: 0, height: 0 };
}

// type: the texture's type (bytes when not given)
function glSizeBloomTarget(target, width, height, type) {
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type || gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frameBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

// make the glow textures fit the screen (they start black)
function glResizeBloom() {
  if (!GL.bloomSource) {
    // the glow layer, the added up glow, and for each layer: across, done
    GL.bloomSource = glBloomTarget();
    GL.bloomGlow = glBloomTarget();
    GL.bloomAcross = [];
    GL.bloomDone = [];
    for (var n = 0; n < BloomLayers; n++) {
      GL.bloomAcross.push(glBloomTarget());
      GL.bloomDone.push(glBloomTarget());
    }
  }
  var width = Math.max(1, Math.ceil(GL.frameWidth / 2));
  var height = Math.max(1, Math.ceil(GL.frameHeight / 2));
  glSizeBloomTarget(GL.bloomSource, width, height);
  glSizeBloomTarget(GL.bloomGlow, width, height);
  for (var n = 0; n < BloomLayers; n++) {
    var lw = Math.max(1, Math.ceil(width / Math.pow(2, n)));
    var lh = Math.max(1, Math.ceil(height / Math.pow(2, n)));
    glSizeBloomTarget(GL.bloomAcross[n], lw, lh);
    glSizeBloomTarget(GL.bloomDone[n], lw, lh);
  }
  GL.bloomWidth = GL.frameWidth;
  GL.bloomHeight = GL.frameHeight;
}

// is the glow layer in use and ready for this frame?
function glBloomReady() {
  return (
    GL.bloom &&
    Bloom > 0 &&
    !BloomStale &&
    GL.bloomWidth == GL.frameWidth &&
    GL.bloomHeight == GL.frameHeight
  );
}

function glBindBloomTarget(target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.frameBuffer);
  gl.viewport(0, 0, target.width, target.height);
}

// no clock or message: an area off the screen, so no pixel is in its letters
function glNoTextMask(info) {
  for (var k = 0; k < 2; k++) {
    gl.uniform1i(info.uniforms["uTextMask" + k], k == 0 ? 3 : 6);
    gl.uniform4f(info.uniforms["uTextBox" + k], -10, -10, -9, -9);
  }
}
// draw the characters of the queue into the glow layer like the rain, in the rain
// color times their glow strength (see QueueBloom), with the drop program
function glBloomCharacters() {
  if (!GL.bloom || !(Bloom > 0)) {
    BloomStale = true;
    return;
  }
  if (GL.bloomWidth != GL.frameWidth || GL.bloomHeight != GL.frameHeight || BloomStale) {
    glResizeBloom();
    BloomStale = false;
  }
  // (the glow layer is faded with the rain, see glDrawFade)

  // every character, as the rain draws it (replacing its cell, so the glow layer
  // is the rain with each character in the rain color times its glow strength)
  var count = QueueCount;
  var glowing = 0;
  for (var n = 0; n < count; n++) {
    SortX[glowing] = QueueX[n];
    SortY[glowing] = QueueY[n];
    SortSize[glowing] = QueueSize[n];
    // the rain color (no brighter head) times the glow strength
    SortOpacity[glowing] = QueueOpacity[n] * QueueBloom[n];
    SortHead[glowing] = 0;
    SortGlyph[glowing] = QueueGlyph[n];
    SortColumn[glowing] = QueueColumn[n];
    SortBloom[glowing] = 0;
    SortNear[glowing] = QueueNear[n];
    glowing++;
  }
  if (glowing == 0) {
    return;
  }
  // draw them with the drop program into the glow layer
  var a;
  a = QueueX; QueueX = SortX; SortX = a;
  a = QueueY; QueueY = SortY; SortY = a;
  a = QueueSize; QueueSize = SortSize; SortSize = a;
  a = QueueOpacity; QueueOpacity = SortOpacity; SortOpacity = a;
  a = QueueHead; QueueHead = SortHead; SortHead = a;
  a = QueueGlyph; QueueGlyph = SortGlyph; SortGlyph = a;
  a = QueueColumn; QueueColumn = SortColumn; SortColumn = a;
  a = QueueBloom; QueueBloom = SortBloom; SortBloom = a;
  a = QueueNear; QueueNear = SortNear; SortNear = a;
  QueueCount = glowing;
  GL.dropTarget = GL.bloomSource;
  glFlushDrops();
  GL.dropTarget = null;
  a = QueueX; QueueX = SortX; SortX = a;
  a = QueueY; QueueY = SortY; SortY = a;
  a = QueueSize; QueueSize = SortSize; SortSize = a;
  a = QueueOpacity; QueueOpacity = SortOpacity; SortOpacity = a;
  a = QueueHead; QueueHead = SortHead; SortHead = a;
  a = QueueGlyph; QueueGlyph = SortGlyph; SortGlyph = a;
  a = QueueColumn; QueueColumn = SortColumn; SortColumn = a;
  a = QueueBloom; QueueBloom = SortBloom; SortBloom = a;
  a = QueueNear; QueueNear = SortNear; SortNear = a;
  QueueCount = count;
}

// blur the glow layer into its layers and add them up into GL.bloomGlow
function glBloom() {
  if (GL.bloomWidth != GL.frameWidth || GL.bloomHeight != GL.frameHeight || BloomStale) {
    glResizeBloom();
    BloomStale = false;
  }
  var blur = GL.bloomBlurProgram;
  var copy = GL.bloomCopyProgram;
  var spread = Math.max(0.75, font_size / 12);
  var from = GL.bloomSource;
  for (var n = 0; n < BloomLayers; n++) {
    if (!(bloomLayerWeight(n) > 0)) {
      break;
    }
    // each layer starts from the one before (smaller, so blurred further)
    var across = GL.bloomAcross[n];
    var done = GL.bloomDone[n];
    glBindBloomTarget(across);
    glUse(blur, GL.screenBuffer, null, { aPos: 2 });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    gl.uniform1i(blur.uniforms.uSource, 0);
    gl.uniform2f(blur.uniforms.uStep, spread / across.width, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    glBindBloomTarget(done);
    gl.bindTexture(gl.TEXTURE_2D, across.texture);
    gl.uniform2f(blur.uniforms.uStep, 0, spread / done.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    glDone(blur);
    from = done;
  }
  // add up the layers
  glBindBloomTarget(GL.bloomGlow);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  glUse(copy, GL.screenBuffer, null, { aPos: 2 });
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(copy.uniforms.uSource, 0);
  for (var n = 0; n < BloomLayers; n++) {
    var weight = bloomLayerWeight(n);
    if (!(weight > 0)) {
      break;
    }
    gl.bindTexture(gl.TEXTURE_2D, GL.bloomDone[n].texture);
    gl.uniform1f(copy.uniforms.uWeight, weight * BloomLayerGain);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  glDone(copy);
  gl.disable(gl.BLEND);
}

// ---------------------------------------------------------------------------
// Water simulation for the ripples
// The water is simulated on the plane seen from above (see planeWorldWidth), a grid
// of heights with cells about 4 pixels wide and deep at the size of the front. The
// picture shows it in perspective, so rings are flattened, and further back they
// look smaller and spread more slowly; rings moving to the front grow, rings
// moving back shrink. Every impact
// pushes the water down where it lands; in every step each cell is pulled towards
// its neighbours, so waves spread, cross and add up, and slowly die out. The cells
// keep height (red) and speed (green), in two textures used in turns.
// Needs half float textures that can be drawn into; without them the rings of
// Ripples are used instead.
// ---------------------------------------------------------------------------

function glInitWaves(pixelVertex, highp) {
  var half = gl.getExtension("OES_texture_half_float");
  var drawable = gl.getExtension("EXT_color_buffer_half_float");
  if (!half || !drawable) {
    return;
  }
  GL.halfFloat = half.HALF_FLOAT_OES;
  GL.halfLinear = gl.getExtension("OES_texture_half_float_linear");

  // one step of the simulation for every cell
  GL.waveStepProgram = glProgram(
    "attribute vec2 aPos;" + "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
    highp +
      "uniform sampler2D uState;" +
      "uniform vec2 uTexel;" +
      "uniform float uDamping;" +
      "void main() {" +
      "  vec2 uv = gl_FragCoord.xy * uTexel;" +
      "  vec4 s = texture2D(uState, uv);" +
      "  float around = texture2D(uState, uv - vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uState, uv + vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uState, uv - vec2(0.0, uTexel.y)).r +" +
      "    texture2D(uState, uv + vec2(0.0, uTexel.y)).r;" +
      "  float speed = (s.g + (around - 4.0 * s.r) * 0.4) * uDamping;" +
      // the height is damped too: every impact pushes water down, and a level
      // that is lower everywhere has no slope, so it would never spread out or
      // die away; it would build up until the whole plane looks like one ring.
      // Limited, so it can never run away
      "  float height = clamp((s.r + speed) * uDamping, -4.0, 4.0);" +
      "  gl_FragColor = vec4(height, speed, 0.0, 1.0);" +
      "}",
  );
  // the same for a part of a step (see glSimulateWaves): the slopes push by uPush,
  // and the speed is scaled by uSpeedScale (when the parts changed). A program of its
  // own, so the whole steps stay exactly as they always were
  GL.waveSplitProgram = glProgram(
    "attribute vec2 aPos;" + "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
    highp +
      "uniform sampler2D uState;" +
      "uniform vec2 uTexel;" +
      "uniform float uDamping;" +
      "uniform float uPush;" +
      "uniform float uSpeedScale;" +
      "void main() {" +
      "  vec2 uv = gl_FragCoord.xy * uTexel;" +
      "  vec4 s = texture2D(uState, uv);" +
      "  float around = texture2D(uState, uv - vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uState, uv + vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uState, uv - vec2(0.0, uTexel.y)).r +" +
      "    texture2D(uState, uv + vec2(0.0, uTexel.y)).r;" +
      "  float speed = (s.g * uSpeedScale + (around - 4.0 * s.r) * uPush) * uDamping;" +
      "  float height = clamp((s.r + speed) * uDamping, -4.0, 4.0);" +
      "  gl_FragColor = vec4(height, speed, 0.0, 1.0);" +
      "}",
  );
  // impacts: small round dents added to the height
  GL.impulseProgram = glProgram(
    "attribute vec2 aPos;" +
      "attribute float aStrength;" +
      "uniform float uSize;" +
      "varying float vStrength;" +
      "void main() {" +
      "  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);" +
      "  gl_PointSize = uSize;" +
      "  vStrength = aStrength;" +
      "}",
    highp +
      "varying float vStrength;" +
      "void main() {" +
      "  vec2 p = gl_PointCoord - 0.5;" +
      "  gl_FragColor = vec4(-vStrength * exp(-dot(p, p) * 16.0), 0.0, 0.0, 0.0);" +
      "}",
  );
  if (!GL.waveStepProgram || !GL.waveSplitProgram || !GL.impulseProgram) {
    return;
  }
  GL.waveTextures = [glTexture(), glTexture()];
  GL.waveFrameBuffers = [gl.createFramebuffer(), gl.createFramebuffer()];
  GL.impulseBuffer = gl.createBuffer();
  GL.waveCurrent = 0;
  GL.waveWidth = 0;
  GL.waveHeight = 0;
  if (!glResizeWaves(4, 4)) {
    return;
  }
  GL.waves = true;
}

// make the water grid the given size (it starts calm); false if it cannot be used
function glResizeWaves(width, height) {
  var filter = GL.halfLinear ? gl.LINEAR : gl.NEAREST;
  for (var n = 0; n < 2; n++) {
    gl.bindTexture(gl.TEXTURE_2D, GL.waveTextures[n]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, GL.halfFloat, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL.waveFrameBuffers[n]);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      GL.waveTextures[n],
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  GL.waveWidth = width;
  GL.waveHeight = height;
  return true;
}

// add the impacts of this frame and move the water on by the rain time since
// the last frame; how fast and how long the waves last come from the settings
function glSimulateWaves() {
  var top = planeTopY();
  var planeHeight = Math.max(1, ScreenHeight - top);
  var worldWidth = planeWorldWidth();
  var worldDepth = planeWorldDepth();
  // cells of 4 pixels, larger when the grid would get too big
  var cell = Math.max(4, worldWidth / 1024, worldDepth / 1024);
  var width = Math.max(4, Math.ceil(worldWidth / cell));
  var height = Math.max(4, Math.ceil(worldDepth / cell));
  // (ReflectionStale only with the reflection: without it nothing clears the reflection
  // layer, so the flag stays set, and the water was made calm again in every frame)
  if (width != GL.waveWidth || height != GL.waveHeight || (ReflectionStale && useReflectionPlane)) {
    glResizeWaves(width, height);
  }

  // impacts: dents added to the current heights
  if (ImpulseCount > 0) {
    // created here: initGL runs before MaxImpulses is set
    if (!GL.impulseData) {
      GL.impulseData = new Float32Array(MaxImpulses * 3);
    }
    var d = GL.impulseData;
    var smin = planeScale();
    var centre = ScreenWidth / 2;
    for (var n = 0; n < ImpulseCount; n++) {
      // from the screen to the plane seen from above (as in the present shader)
      var near = Math.max(0, Math.min(1, (ImpulseY[n] - top) / planeHeight));
      var scale = smin + (1 - smin) * near;
      d[n * 3] = 0.5 + (ImpulseX[n] - centre) / scale / worldWidth;
      d[n * 3 + 1] = (1 / smin - 1 / scale) / (1 / smin - 1);
      d[n * 3 + 2] = ImpulseStrength[n];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL.waveFrameBuffers[GL.waveCurrent]);
    gl.viewport(0, 0, GL.waveWidth, GL.waveHeight);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    var info = GL.impulseProgram;
    glUse(info, GL.impulseBuffer, d.subarray(0, ImpulseCount * 3), { aPos: 2, aStrength: 1 });
    gl.uniform1f(info.uniforms.uSize, 9);
    gl.drawArrays(gl.POINTS, 0, ImpulseCount);
    glDone(info);
    gl.disable(gl.BLEND);
    ImpulseCount = 0;
  }

  // steps: 60 per second at the default speed. When frames come at least as often,
  // each step is split into parts (more than one a frame), so the water moves in
  // every frame: a part moves the water by its share of a step (the push of the
  // slopes by the square of it, its speed by it), and the damping is per part, so
  // the waves spread as fast and last as long
  var base = 60 * RippleSpeed;
  var parts = FrameRate >= base ? Math.floor(FrameRate / base) + 1 : 1;
  var rate = base * parts;
  // the speed in the water is kept per part: the first step after a change of
  // parts scales it
  var speedScale = GL.waveParts ? GL.waveParts / parts : 1;
  GL.waveParts = parts;
  var steps = Math.floor(WaveTime * rate);
  WaveTime -= steps / rate;
  if (steps > 16 * parts) {
    steps = 16 * parts;
    WaveTime = 0;
  }
  WaveSteps += steps;
  WaterTime += steps / rate;
  // waves lose 99% of their height in the set duration
  var damping = Math.pow(0.01, 1 / (RippleLife * rate));
  for (var s = 0; s < steps; s++) {
    var scale = s == 0 ? speedScale : 1;
    var split = parts > 1 || scale != 1;
    var info = split ? GL.waveSplitProgram : GL.waveStepProgram;
    var next = 1 - GL.waveCurrent;
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL.waveFrameBuffers[next]);
    gl.viewport(0, 0, GL.waveWidth, GL.waveHeight);
    glUse(info, GL.screenBuffer, null, { aPos: 2 });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, GL.waveTextures[GL.waveCurrent]);
    gl.uniform1i(info.uniforms.uState, 0);
    gl.uniform2f(info.uniforms.uTexel, 1 / GL.waveWidth, 1 / GL.waveHeight);
    gl.uniform1f(info.uniforms.uDamping, damping);
    if (split) {
      gl.uniform1f(info.uniforms.uPush, 0.4 / (parts * parts));
      gl.uniform1f(info.uniforms.uSpeedScale, scale);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    glDone(info);
    GL.waveCurrent = next;
  }
}

function glShader(type, source) {
  var shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return null;
  }
  return shader;
}

// compile a program and look up its attributes and uniforms
function glProgram(vertexSource, fragmentSource) {
  var vertex = glShader(gl.VERTEX_SHADER, vertexSource);
  var fragment = glShader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) {
    return null;
  }
  var program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return null;
  }
  var result = { program: program, attributes: {}, uniforms: {} };
  var count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (var i = 0; i < count; i++) {
    var name = gl.getActiveAttrib(program, i).name;
    result.attributes[name] = gl.getAttribLocation(program, name);
  }
  count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (var i = 0; i < count; i++) {
    var name = gl.getActiveUniform(program, i).name;
    result.uniforms[name] = gl.getUniformLocation(program, name);
  }
  return result;
}

// a texture that shows its pixels exactly, without smoothing
function glTexture() {
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

// make the screen image and reflection layer textures the given size
// (their content is lost)
function glResizeFrame(width, height) {
  var textures = [GL.frameTexture, GL.reflectTexture];
  for (var n = 0; n < textures.length; n++) {
    gl.bindTexture(gl.TEXTURE_2D, textures[n]);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }
  GL.frameWidth = width;
  GL.frameHeight = height;
  ReflectionStale = true;
}

// draw into the screen image texture
// the shown copies of the screen image, the reflection layer and the glow layer for
// a gliding rain (see glComposeShown): made the first time they are needed, then
// resized in place
function glSizeShown() {
  if (!GL.shownFrameTexture) {
    GL.shownFrameTexture = glTexture();
    GL.shownReflectTexture = glTexture();
    GL.shownFrameBuffer = gl.createFramebuffer();
    GL.shownReflectFrameBuffer = gl.createFramebuffer();
    GL.shownBloom = glBloomTarget();
    GL.shownWidth = 0;
    GL.shownHeight = 0;
  }
  if (GL.shownWidth != GL.frameWidth || GL.shownHeight != GL.frameHeight) {
    var pairs = [[GL.shownFrameTexture, GL.shownFrameBuffer], [GL.shownReflectTexture, GL.shownReflectFrameBuffer]];
    for (var n = 0; n < pairs.length; n++) {
      gl.bindTexture(gl.TEXTURE_2D, pairs[n][0]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GL.frameWidth, GL.frameHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pairs[n][1]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pairs[n][0], 0);
    }
    GL.shownWidth = GL.frameWidth;
    GL.shownHeight = GL.frameHeight;
  }
  GL.shownBloomOn = glBloomReady();
  if (GL.shownBloomOn &&
    (GL.shownBloom.width != GL.bloomSource.width || GL.shownBloom.height != GL.bloomSource.height)) {
    glSizeBloomTarget(GL.shownBloom, GL.bloomSource.width, GL.bloomSource.height);
  }
}

// copy what a frame buffer shows into a texture of the same size
function glCopyLayer(frameBuffer, texture, width, height) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height);
}

// swap the screen image, the reflection layer and the glow layer with their shown
// copies, so everything drawn and shown uses the copies (and back)
function glSwapShown() {
  var a = GL.frameTexture;
  GL.frameTexture = GL.shownFrameTexture;
  GL.shownFrameTexture = a;
  a = GL.frameBuffer;
  GL.frameBuffer = GL.shownFrameBuffer;
  GL.shownFrameBuffer = a;
  a = GL.reflectTexture;
  GL.reflectTexture = GL.shownReflectTexture;
  GL.shownReflectTexture = a;
  a = GL.reflectFrameBuffer;
  GL.reflectFrameBuffer = GL.shownReflectFrameBuffer;
  GL.shownReflectFrameBuffer = a;
  if (GL.shownBloomOn) {
    a = GL.bloomSource;
    GL.bloomSource = GL.shownBloom;
    GL.shownBloom = a;
  }
}

// make the shown copies of the screen image: copy the layers, swap them in
// (glSwapShown; the caller swaps them back after showing them) and draw into them,
// for a gliding rain (glide), the drop heads, the splashes and their reflections
// phase (0 to 1) of a step on, and this frame's characters bolt (see BoltStrikes)
function glComposeShown(phase, glide) {
  glSizeShown();
  glCopyLayer(GL.frameBuffer, GL.shownFrameTexture, GL.frameWidth, GL.frameHeight);
  if (useReflectionPlane) {
    glCopyLayer(GL.reflectFrameBuffer, GL.shownReflectTexture, GL.frameWidth, GL.frameHeight);
  }
  if (GL.shownBloomOn) {
    glCopyLayer(GL.bloomSource.frameBuffer, GL.shownBloom.texture, GL.bloomSource.width, GL.bloomSource.height);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  glSwapShown();
  Gliding = true;
  // nothing fades: the copy is only drawn over
  var fade = FrameFade;
  FrameFade = 0;
  if (glide) {
    queueGlidingDrops(phase);
  }
  for (var i = 0; i < BoltStrikes.length; i++) {
    queueCharacterBolt(BoltStrikes[i]);
  }
  if (QueueCount > 0) {
    flushDrops();
  }
  if (glide && ParticleCount > 0) {
    keepParticles();
    moveParticlesBy((phase * speed) / 1000.0);
    renderParticles();
    restoreParticles();
  }
  if (useReflectionPlane && ReflectCount > 0) {
    flushReflections();
  }
  FrameFade = fade;
  Gliding = false;
  GL.shownPhase = phase;
  GL.shownReady = true;
}

function glBindFrame() {
  if (GL.dropTarget) {
    // the drops of the glow layer (see glBloomCharacters)
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL.dropTarget.frameBuffer);
    gl.viewport(0, 0, GL.dropTarget.width, GL.dropTarget.height);
    return;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, GL.frameBuffer);
  gl.viewport(0, 0, GL.frameWidth, GL.frameHeight);
}

// use a program with the given vertex data (attribute name: number of floats);
// the GPU buffer is only made bigger when needed, otherwise it is reused,
// so no GPU memory is allocated in a normal frame
function glUse(info, buffer, data, layout) {
  gl.useProgram(info.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (data) {
    if (!buffer.capacity || buffer.capacity < data.byteLength) {
      buffer.capacity = data.byteLength * 2;
      gl.bufferData(gl.ARRAY_BUFFER, buffer.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }
  var stride = 0;
  for (var name in layout) {
    stride += layout[name] * 4;
  }
  var offset = 0;
  for (var name in layout) {
    var location = info.attributes[name];
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, layout[name], gl.FLOAT, false, stride, offset);
    offset += layout[name] * 4;
  }
}

// switch off the vertex data of a program after drawing
function glDone(info) {
  for (var name in info.attributes) {
    gl.disableVertexAttribArray(info.attributes[name]);
  }
}

function glDrawFade() {
  glBindFrame();
  if (GL.fadeTarget) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, GL.fadeTarget);
  }
  // new color = old color * (1 - alpha)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
  glUse(GL.fadeProgram, GL.fadeBuffer, GL.fadeData.subarray(0, FadeCount * 36), {
    aPos: 2,
    aRect: 4,
  });
  gl.uniform2f(GL.fadeProgram.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.uniform1f(GL.fadeProgram.uniforms.uAlpha, FadeAlpha);
  gl.uniform1f(GL.fadeProgram.uniforms.uPixel, 1);
  glFadePasses();
  if (!GL.fadeTarget && glBloomReady()) {
    // the glow layer fades exactly like the rain, so it stays where the rain
    // does not fade (the clock or message)
    glBindBloomTarget(GL.bloomSource);
    gl.uniform1f(GL.fadeProgram.uniforms.uPixel, GL.frameWidth / GL.bloomSource.width);
    glFadePasses();
    glBindFrame();
  }
  glDone(GL.fadeProgram);
  gl.disable(gl.BLEND);
}

// draw the fade rectangles into the current target: first new = old * (1 - alpha),
// then take away 1/255, because 8 bits cannot fade the last traces further (a dark
// 3/255 times 0.9 rounds back to 3/255), so the trails would never quite go away
// and build up into a faint pattern
function glFadePasses() {
  var info = GL.fadeProgram;
  // the alpha (the nearness of what the screen image shows) stays
  gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  gl.uniform1f(info.uniforms.uSubtract, 0);
  gl.drawArrays(gl.TRIANGLES, 0, FadeCount * 6);
  if (FadeAlpha > 0) {
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(info.uniforms.uSubtract, 1);
    gl.drawArrays(gl.TRIANGLES, 0, FadeCount * 6);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  }
}

function glUploadAtlas() {
  gl.bindTexture(gl.TEXTURE_2D, GL.atlasTexture);
  // drops smaller than Font size Max scale the characters down smoothly
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, GlyphAtlas);
  GL.atlasDirty = false;
}

// memory for the per-drop data of instanced drawing, 12 bytes per drop:
// x, y (16 bit), character (16 bit), font size (16 bit), red, green, blue, nearness (8 bit)
function glAllocateInstances(count) {
  GL.instanceBytes = new ArrayBuffer(count * 12);
  GL.instanceShorts = new Int16Array(GL.instanceBytes);
  GL.instanceGlyphs = new Uint16Array(GL.instanceBytes);
  GL.instanceColors = new Uint8Array(GL.instanceBytes);
  GL.instanceCount = count;
}

// draw all queued drops in one call (see queueDrop); each cell is replaced by
// character * color * opacity, as in the 2D canvas version of flushDrops
function glFlushDrops() {
  if (GL.atlasDirty) {
    glUploadAtlas();
  }
  if (GL.instancing) {
    glFlushDropsInstanced();
    return;
  }
  // 6 vertices of 8 floats per drop
  if (GL.dropData.length < QueueCount * 48) {
    GL.dropData = new Float32Array(QueueCount * 48 * 2);
  }
  var d = GL.dropData;
  var o = 0;
  var cellU = font_size / GlyphAtlas.width;
  var cellV = font_size / GlyphAtlas.height;
  for (var n = 0; n < QueueCount; n++) {
    var x0 = QueueX[n];
    var y0 = QueueY[n];
    var x1 = x0 + QueueSize[n];
    var y1 = y0 + QueueSize[n];
    var glyph = QueueGlyph[n];
    var u0 = (glyph % GlyphAtlasColumns) * cellU;
    var v0 = Math.floor(glyph / GlyphAtlasColumns) * cellV;
    var u1 = u0 + cellU;
    var v1 = v0 + cellV;
    queueColor(n);
    var r = QueueRGB[0] / 255;
    var g = QueueRGB[1] / 255;
    var b = QueueRGB[2] / 255;
    var near = QueueNear[n];
    o = glVertex(d, o, x0, y0, u0, v0, r, g, b, near);
    o = glVertex(d, o, x1, y0, u1, v0, r, g, b, near);
    o = glVertex(d, o, x0, y1, u0, v1, r, g, b, near);
    o = glVertex(d, o, x0, y1, u0, v1, r, g, b, near);
    o = glVertex(d, o, x1, y0, u1, v0, r, g, b, near);
    o = glVertex(d, o, x1, y1, u1, v1, r, g, b, near);
  }

  glBindFrame();
  glUse(GL.dropProgram, GL.dropBuffer, d.subarray(0, o), {
    aPos: 2,
    aUV: 2,
    aColor: 4,
  });
  gl.uniform2f(GL.dropProgram.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  glFogUniforms(GL.dropProgram, GL.dropTarget != null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.atlasTexture);
  gl.uniform1i(GL.dropProgram.uniforms.uAtlas, 0);
  gl.drawArrays(gl.TRIANGLES, 0, QueueCount * 6);
  glDone(GL.dropProgram);

  QueueCount = 0;
}

// the same as glFlushDrops, with 12 bytes per drop instead of 6 vertices
function glFlushDropsInstanced() {
  if (GL.instanceCount < QueueCount) {
    glAllocateInstances(QueueCount * 2);
  }
  var shorts = GL.instanceShorts;
  var glyphs = GL.instanceGlyphs;
  var colors = GL.instanceColors;
  for (var n = 0; n < QueueCount; n++) {
    shorts[n * 6] = QueueX[n];
    shorts[n * 6 + 1] = QueueY[n];
    glyphs[n * 6 + 2] = QueueGlyph[n];
    glyphs[n * 6 + 3] = QueueSize[n];
    queueColor(n);
    colors[n * 12 + 8] = QueueRGB[0];
    colors[n * 12 + 9] = QueueRGB[1];
    colors[n * 12 + 10] = QueueRGB[2];
    colors[n * 12 + 11] = Math.round(Math.max(0, Math.min(1, QueueNear[n])) * 255);
  }

  glBindFrame();
  var info = GL.dropInstanceProgram;
  var ext = GL.instancing;
  var a = info.attributes;
  gl.useProgram(info.program);

  gl.bindBuffer(gl.ARRAY_BUFFER, GL.cornerBuffer);
  gl.enableVertexAttribArray(a.aCorner);
  gl.vertexAttribPointer(a.aCorner, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, GL.instanceBuffer);
  var bytes = new Uint8Array(GL.instanceBytes, 0, QueueCount * 12);
  if (!GL.instanceBuffer.capacity || GL.instanceBuffer.capacity < bytes.byteLength) {
    GL.instanceBuffer.capacity = GL.instanceBytes.byteLength;
    gl.bufferData(gl.ARRAY_BUFFER, GL.instanceBuffer.capacity, gl.DYNAMIC_DRAW);
  }
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, bytes);
  gl.enableVertexAttribArray(a.aCell);
  gl.vertexAttribPointer(a.aCell, 2, gl.SHORT, false, 12, 0);
  ext.vertexAttribDivisorANGLE(a.aCell, 1);
  gl.enableVertexAttribArray(a.aGlyph);
  gl.vertexAttribPointer(a.aGlyph, 1, gl.UNSIGNED_SHORT, false, 12, 4);
  ext.vertexAttribDivisorANGLE(a.aGlyph, 1);
  gl.enableVertexAttribArray(a.aSize);
  gl.vertexAttribPointer(a.aSize, 1, gl.UNSIGNED_SHORT, false, 12, 6);
  ext.vertexAttribDivisorANGLE(a.aSize, 1);
  gl.enableVertexAttribArray(a.aColor);
  gl.vertexAttribPointer(a.aColor, 4, gl.UNSIGNED_BYTE, true, 12, 8);
  ext.vertexAttribDivisorANGLE(a.aColor, 1);

  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.uniform1f(info.uniforms.uAtlasColumns, GlyphAtlasColumns);
  glFogUniforms(info, GL.dropTarget != null);
  gl.uniform2f(
    info.uniforms.uCellUV,
    font_size / GlyphAtlas.width,
    font_size / GlyphAtlas.height,
  );
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.atlasTexture);
  gl.uniform1i(info.uniforms.uAtlas, 0);
  ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, QueueCount);

  // attribute locations are shared by all programs: switch the per-drop mode off
  ext.vertexAttribDivisorANGLE(a.aCell, 0);
  ext.vertexAttribDivisorANGLE(a.aGlyph, 0);
  ext.vertexAttribDivisorANGLE(a.aSize, 0);
  ext.vertexAttribDivisorANGLE(a.aColor, 0);
  glDone(info);

  QueueCount = 0;
}

// draw the splash characters (see renderParticles), blended over the picture:
// new color = character color * coverage + old color * (1 - coverage)
function glDrawParticles() {
  if (GL.textAtlasDirty) {
    gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, TextAtlas);
    gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasBlurredTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, TextAtlasBlurred);
    GL.textAtlasDirty = false;
  }
  // 6 vertices of 9 floats per character
  if (!GL.particleData || GL.particleData.length < MaxParticles * 54) {
    GL.particleData = new Float32Array(MaxParticles * 54);
  }
  var d = GL.particleData;
  var info = GL.particleProgram;
  glBindFrame();
  gl.enable(gl.BLEND);

  // the characters of the last frame lose their head brightness: what they were
  // brighter than the rain color is taken away again (faded by this frame, like
  // them), so only the newest character of each trail is brightened
  if (SettleCount > 0) {
    var o = 0;
    var kept = 1 - FrameFade;
    for (var s = 0; s < SettleCount; s++) {
      o = glParticleQuad(d, o, SettleX[s], SettleY[s], SettleSize[s], SettleGlyph[s],
        SettleRed[s], SettleGreen[s], SettleBlue[s], SettleOpacity[s] * kept, SettleNear[s]);
    }
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    // (the alpha, the nearness of the picture, stays)
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    glUse(info, GL.particleBuffer, d.subarray(0, o), { aPos: 2, aUV: 2, aColor: 4, aNear: 1 });
    gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
    gl.uniform1f(info.uniforms.uDepth, 0);
    glFogUniforms(info, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasTexture);
    gl.uniform1i(info.uniforms.uText, 0);
    gl.drawArrays(gl.TRIANGLES, 0, SettleCount * 6);
    gl.blendEquation(gl.FUNC_ADD);
  }

  var o = 0;
  for (var n = 0; n < ParticleCount; n++) {
    var column = particleColumn(ParticleX[n]);
    var r = ColumnRed[column] / 255;
    var g = ColumnGreen[column] / 255;
    var b = ColumnBlue[column] / 255;
    // brightened like a drop head, for its distance
    var head = ParticleHead[n];
    r += (1 - r) * head;
    g += (1 - g) * head;
    b += (1 - b) * head;
    o = glParticleQuad(d, o, ParticleX[n], ParticleY[n], ParticleSize[n], ParticleGlyph[n],
      r, g, b, ParticleOpacity[n], ParticleNear[n]);
  }
  if (!Gliding) {
    // (a gliding copy keeps the ones of the screen image, see glComposeShown)
    rememberSplashHeads();
  }

  // (the alpha, the nearness of the picture, stays)
  gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  glUse(info, GL.particleBuffer, d.subarray(0, o), { aPos: 2, aUV: 2, aColor: 4, aNear: 1 });
  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.uniform1f(info.uniforms.uDepth, 0);
  glFogUniforms(info, false);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasTexture);
  gl.uniform1i(info.uniforms.uText, 0);
  gl.drawArrays(gl.TRIANGLES, 0, ParticleCount * 6);
  // then their nearness where they cover the picture, for the fog
  gl.disable(gl.BLEND);
  gl.colorMask(false, false, false, true);
  gl.uniform1f(info.uniforms.uDepth, 1);
  gl.drawArrays(gl.TRIANGLES, 0, ParticleCount * 6);
  gl.uniform1f(info.uniforms.uDepth, 0);
  gl.colorMask(true, true, true, true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  if (glBloomReady()) {
    // into the glow layer too, with the opacity (which also scales the color in
    // the shader) times the glow strength
    for (var n = 0; n < ParticleCount; n++) {
      var strength = ParticleBloom[n];
      for (var v = 0; v < 6; v++) {
        d[(n * 6 + v) * 9 + 7] *= strength;
      }
    }
    glUse(info, GL.particleBuffer, d.subarray(0, o), { aPos: 2, aUV: 2, aColor: 4, aNear: 1 });
    glBindBloomTarget(GL.bloomSource);
    glFogUniforms(info, true);
    gl.drawArrays(gl.TRIANGLES, 0, ParticleCount * 6);
    glFogUniforms(info, false);
  }
  glDone(info);
  gl.disable(gl.BLEND);
}

// upload TextAtlas and its blurred copy when they changed
function glUploadTextAtlas() {
  if (!GL.textAtlasDirty) {
    return;
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, TextAtlas);
  gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasBlurredTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, TextAtlasBlurred);
  GL.textAtlasDirty = false;
}

// the WebGL version of flushReflections: fade the plane part of the reflection
// layer, then blend the upside down characters onto it
function glFlushReflections() {
  var top = Math.floor(planeTopY());
  gl.bindFramebuffer(gl.FRAMEBUFFER, GL.reflectFrameBuffer);
  gl.viewport(0, 0, GL.frameWidth, GL.frameHeight);
  if (ReflectionStale && !Gliding) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    ReflectionStale = false;
  }
  if (FrameFade > 0) {
    GL.fadeTarget = GL.reflectFrameBuffer;
    beginFade(FrameFade);
    fadeRect(0, top, ScreenWidth, ScreenHeight - top);
    endFade();
    GL.fadeTarget = null;
  }
  if (ReflectCount == 0) {
    return;
  }
  glUploadTextAtlas();

  // 6 vertices of 9 floats per character
  if (!GL.reflectData || GL.reflectData.length < ReflectCount * 54) {
    GL.reflectData = new Float32Array(ReflectCount * 54 * 2);
  }
  var d = GL.reflectData;
  var o = 0;
  var cellU = TextAtlasCell / TextAtlas.width;
  var cellV = TextAtlasCell / TextAtlas.height;
  for (var n = 0; n < ReflectCount; n++) {
    var x0 = ReflectX[n];
    var y0 = ReflectY[n];
    var x1 = x0 + ReflectSize[n];
    var y1 = y0 + ReflectSize[n];
    var glyph = ReflectGlyph[n];
    var u0 = (glyph % GlyphAtlasColumns) * cellU;
    var v0 = Math.floor(glyph / GlyphAtlasColumns) * cellV;
    var u1 = u0 + cellU;
    var v1 = v0 + cellV;
    var column = ReflectColumn[n];
    var r = ColumnRed[column] / 255;
    var g = ColumnGreen[column] / 255;
    var b = ColumnBlue[column] / 255;
    var a = ReflectAlpha[n];
    var blur = ReflectBlur[n];
    // upside down: the top of the image shows the bottom of the character
    o = glReflectVertex(d, o, x0, y0, u0, v1, r, g, b, a, blur);
    o = glReflectVertex(d, o, x1, y0, u1, v1, r, g, b, a, blur);
    o = glReflectVertex(d, o, x0, y1, u0, v0, r, g, b, a, blur);
    o = glReflectVertex(d, o, x0, y1, u0, v0, r, g, b, a, blur);
    o = glReflectVertex(d, o, x1, y0, u1, v1, r, g, b, a, blur);
    o = glReflectVertex(d, o, x1, y1, u1, v0, r, g, b, a, blur);
  }

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  var info = GL.reflectProgram;
  glUse(info, GL.reflectBuffer, d.subarray(0, o), {
    aPos: 2,
    aUV: 2,
    aColor: 4,
    aBlur: 1,
  });
  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasTexture);
  gl.uniform1i(info.uniforms.uSharp, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, GL.textAtlasBlurredTexture);
  gl.uniform1i(info.uniforms.uBlurred, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.drawArrays(gl.TRIANGLES, 0, ReflectCount * 6);
  glDone(info);
  gl.disable(gl.BLEND);
}

// set up the reflections of the clock and the message for the present shader (the
// masks of their letters come from glTextMask)
function glTextReflection(info) {
  var any = false;
  for (var k = 0; k < 2; k++) {
    var text = textReflection(TextBlocks[k]);
    var name = "uTextReflection" + k;
    if (text) {
      gl.uniform3f(info.uniforms[name], text.mirror, text.reach, text.strength);
      any = true;
    } else {
      gl.uniform3f(info.uniforms[name], 0, 1, 0);
    }
  }
  gl.uniform1i(info.uniforms.uTextReflect, any ? 1 : 0);
}
// the letters of the clock or message for the present shader: a small texture with
// one texel per lit pixel of the text (see textArea), used to recolor only the
// letters and to reflect them
function glTextMask(info) {
  for (var k = 0; k < 2; k++) {
    glTextMaskOf(info, k);
  }
}

// the mask of text k (see TextBlocks) on texture unit 3 (text 0) or 6 (text 1)
function glTextMaskOf(info, k) {
  var unit = k == 0 ? 3 : 6;
  gl.uniform1i(info.uniforms["uTextMask" + k], unit);
  var text = textArea(TextBlocks[k]);
  if (!text) {
    gl.uniform4f(info.uniforms["uTextBox" + k], -10, -10, -9, -9);
    return;
  }
  var block = TextBlocks[k];
  var columns = Math.max(1, Math.round((text.right - text.left) / text.cell));
  var rows = Math.max(1, Math.round((text.bottom - text.top) / text.cell));
  if (!GL.textMaskData || GL.textMaskData.length < columns * rows * 4) {
    GL.textMaskData = new Uint8Array(columns * rows * 4);
  }
  var mask = GL.textMaskData;
  for (var n = 0; n < columns * rows * 4; n++) {
    mask[n] = 0;
  }
  for (var n = block[0]; n < block[0] + block[1]; n++) {
    var r = LitRects[n];
    var col = Math.round((r[0] - text.left) / text.cell);
    var row = Math.round((r[1] - text.top) / text.cell);
    if (col >= 0 && col < columns && row >= 0 && row < rows) {
      mask[(row * columns + col) * 4] = 255;
    }
  }
  if (!GL.textMaskTextures) {
    GL.textMaskTextures = [glTexture(), glTexture()];
  }
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, GL.textMaskTextures[k]);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    columns,
    rows,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    mask.subarray(0, columns * rows * 4),
  );
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.uniform4f(info.uniforms["uTextBox" + k], text.left, text.top, text.right, text.bottom);
  gl.activeTexture(gl.TEXTURE0);
}

function glReflectVertex(d, o, x, y, u, v, r, g, b, a, blur) {
  d[o] = x;
  d[o + 1] = y;
  d[o + 2] = u;
  d[o + 3] = v;
  d[o + 4] = r;
  d[o + 5] = g;
  d[o + 6] = b;
  d[o + 7] = a;
  d[o + 8] = blur;
  return o + 9;
}

// the 6 vertices of a splash character (centre x, baseline y, font size) for the
// particle program
function glParticleQuad(d, o, x, y, fontSize, glyph, r, g, b, a, near) {
  var scale = fontSize / font_size;
  var size = TextAtlasCell * scale;
  var x0 = x - (font_size / 2 + TextAtlasPad) * scale;
  var y0 = y - (font_size + TextAtlasPad) * scale;
  var x1 = x0 + size;
  var y1 = y0 + size;
  var cellU = TextAtlasCell / TextAtlas.width;
  var cellV = TextAtlasCell / TextAtlas.height;
  var u0 = (glyph % GlyphAtlasColumns) * cellU;
  var v0 = Math.floor(glyph / GlyphAtlasColumns) * cellV;
  var u1 = u0 + cellU;
  var v1 = v0 + cellV;
  o = glParticleVertex(d, o, x0, y0, u0, v0, r, g, b, a, near);
  o = glParticleVertex(d, o, x1, y0, u1, v0, r, g, b, a, near);
  o = glParticleVertex(d, o, x0, y1, u0, v1, r, g, b, a, near);
  o = glParticleVertex(d, o, x0, y1, u0, v1, r, g, b, a, near);
  o = glParticleVertex(d, o, x1, y0, u1, v0, r, g, b, a, near);
  o = glParticleVertex(d, o, x1, y1, u1, v1, r, g, b, a, near);
  return o;
}

function glParticleVertex(d, o, x, y, u, v, r, g, b, a, near) {
  d[o] = x;
  d[o + 1] = y;
  d[o + 2] = u;
  d[o + 3] = v;
  d[o + 4] = r;
  d[o + 5] = g;
  d[o + 6] = b;
  d[o + 7] = a;
  d[o + 8] = near;
  return o + 9;
}

function glVertex(d, o, x, y, u, v, r, g, b, near) {
  d[o] = x;
  d[o + 1] = y;
  d[o + 2] = u;
  d[o + 3] = v;
  d[o + 4] = r;
  d[o + 5] = g;
  d[o + 6] = b;
  d[o + 7] = near;
  return o + 8;
}

// copy the screen image to the screen
function glPresent() {
  var bloom = GL.bloom && Bloom > 0;
  if (bloom) {
    glBloom();
  } else {
    BloomStale = true;
  }
  var waveSim = ripplesActive() && GL.waves;
  if (waveSim) {
    glSimulateWaves();
  }
  // the bolt of the strike playing now, into its texture
  glDrawBolt();
  // with the fog, the picture goes into a texture first, to be blurred
  var fogBlur = glFogBlurReady();
  if (fogBlur) {
    glResizeFogBlur();
    glBindBloomTarget(GL.sceneTarget);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  }
  var info = GL.presentProgram;
  glUse(info, GL.screenBuffer, null, { aPos: 2 });
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, GL.frameTexture);
  gl.uniform1i(info.uniforms.uFrame, 0);
  gl.uniform2f(info.uniforms.uScreen, GL.frameWidth, GL.frameHeight);
  gl.uniform1i(info.uniforms.uRecolor, RecolorActive ? 1 : 0);
  gl.uniform1i(info.uniforms.uReflect, useReflectionPlane ? 1 : 0);
  gl.uniform1i(info.uniforms.uSceneOut, fogBlur ? 1 : 0);
  // Nearness view (Debug mode): the nearness in greys, with the fog layers' lines
  var nearView = useDebug && DebugNearness;
  gl.uniform1i(info.uniforms.uDebugNear, nearView ? 1 : 0);
  if (nearView) {
    var layers = fogLayers();
    gl.uniform3f(info.uniforms.uDebugLayers, layers.first, layers.step, useFog ? layers.count : 0);
  }
  if (fogBlur) {
    gl.uniform1f(info.uniforms.uFogBlurLayer, FogBlurLayer * GL.frameHeight);
    gl.uniform1f(info.uniforms.uFogBlurMax, fogBlurRadii()[2]);
  }
  if (RecolorActive || useReflectionPlane || fogBlur) {
    glTextMask(info);
  } else {
    glNoTextMask(info);
  }
  gl.uniform1i(info.uniforms.uPlane, planeActive() ? 1 : 0);
  gl.uniform1i(info.uniforms.uWaveSim, waveSim ? 1 : 0);
  gl.uniform1f(info.uniforms.uBloomStrength, bloom ? 1 : 0);
  glFogUniforms(info, false);
  gl.uniform1f(info.uniforms.uPlaneNearest, PlaneNearest);
  gl.uniform1f(info.uniforms.uSharpness, reflectionSharpness());
  gl.uniform1f(info.uniforms.uPlaneTop, planeTopY());
  // seconds, wrapping every ~2.8 hours (still exact to a millisecond in a float)
  gl.uniform1f(info.uniforms.uTime, (Date.now() % 10000000) / 1000.0);
  if (bloom) {
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, GL.bloomGlow.texture);
    gl.uniform1i(info.uniforms.uBloom, 5);
    gl.activeTexture(gl.TEXTURE0);
  }
  if (waveSim) {
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, GL.waveTextures[GL.waveCurrent]);
    gl.uniform1i(info.uniforms.uWaves, 4);
    gl.uniform2f(info.uniforms.uWaveTexel, 1 / GL.waveWidth, 1 / GL.waveHeight);
    gl.activeTexture(gl.TEXTURE0);
  }
  if (planeActive()) {
    var now = Date.now();
    gl.uniform3f(info.uniforms.uPlaneTone, PlaneTone[0], PlaneTone[1], PlaneTone[2]);
    gl.uniform1f(info.uniforms.uPlaneTop, planeTopY());
    gl.uniform1f(info.uniforms.uPlaneScale, planeScale());
    gl.uniform1f(info.uniforms.uRippleIntensity, RippleIntensity);
    gl.uniform1f(info.uniforms.uRippleLife, RippleLife);
    // at the default speed, rings of the nearest drops spread by 12% of the
    // screen width per second
    gl.uniform1f(info.uniforms.uRippleSpeed, ScreenWidth * 0.12 * RippleSpeed);
    gl.uniform1f(info.uniforms.uRippleDarkening, RippleDarkening);
    gl.uniform1f(info.uniforms.uRippleLightening, RippleLightening);
    gl.uniform1f(info.uniforms.uTime, (now % 1000000) / 1000.0);
    if (!GL.rippleData) {
      GL.rippleData = new Float32Array(MaxRipples * 4);
      GL.rippleStrength = new Float32Array(MaxRipples);
    }
    for (var i = 0; i < MaxRipples; i++) {
      var r = Ripples[i];
      GL.rippleData[i * 4] = r ? r[0] : 0;
      GL.rippleData[i * 4 + 1] = r ? r[1] : 0;
      GL.rippleData[i * 4 + 2] = r ? (now - r[2]) / 1000.0 : -1;
      GL.rippleData[i * 4 + 3] = r ? r[3] : 0;
      GL.rippleStrength[i] = r ? r[4] : 0;
    }
    gl.uniform4fv(info.uniforms["uRipple[0]"], GL.rippleData);
    gl.uniform1fv(info.uniforms["uRippleStrength[0]"], GL.rippleStrength);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, GL.reflectTexture);
    gl.uniform1i(info.uniforms.uReflection, 2);
    if (useReflectionPlane) {
      glTextReflection(info);
    } else {
      gl.uniform1i(info.uniforms.uTextReflect, 0);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  if (RecolorActive) {
    // the color of every column, one pixel each
    var count = ColumnCount;
    if (!GL.columnData || GL.columnData.length != count * 4) {
      GL.columnData = new Uint8Array(count * 4);
      GL.columnTextureWidth = 0;
    }
    var colors = GL.columnData;
    for (var i = 0; i < count; i++) {
      colors[i * 4] = ColumnRed[i];
      colors[i * 4 + 1] = ColumnGreen[i];
      colors[i * 4 + 2] = ColumnBlue[i];
      colors[i * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, GL.columnTexture);
    if (GL.columnTextureWidth != count) {
      // new size: allocate the texture
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        count,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        colors,
      );
      GL.columnTextureWidth = count;
    } else {
      // same size: only update the colors
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        count,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        colors,
      );
    }
    gl.uniform1i(info.uniforms.uColumns, 1);
    gl.uniform1f(info.uniforms.uColumnCount, count);
    gl.uniform1f(info.uniforms.uFont, font_size);
    gl.uniform1f(info.uniforms.uShift, RainShiftX);
    gl.activeTexture(gl.TEXTURE0);
  }
  glLightningUniforms(info);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  glDone(info);
  if (fogBlur) {
    glFogBlur();
    glShowFogBlur(bloom);
  }
}

// the strikes of this frame for the present shader: their bolts (in their texture,
// see glDrawBolt) and flashes, from the furthest to the nearest (as Strikes)
function glLightningUniforms(info) {
  var count = Math.min(3, Strikes.length);
  gl.uniform1f(info.uniforms.uStrikeCount, count);
  gl.uniform1f(info.uniforms.uBoltOn, GL.boltReady ? 1 : 0);
  if (count == 0) {
    return;
  }
  if (GL.boltProgram) {
    gl.uniform1i(info.uniforms.uBoltTexture, 8);
  }
  if (!GL.mirrorData) {
    // made here: initGL runs before MaxChannelSegments is set
    GL.channelData = new Float32Array(3 * MaxChannelSegments * 4);
    GL.mirrorData = new Float32Array(3 * 3);
    GL.layerData = new Float32Array(3 * 4);
  }
  var near = [0, 0, 0], ends = [0, 0, 0], bands = [0, 0, 0], lights = [0, 0, 0];
  var segments = 0;
  for (var n = 0; n < count; n++) {
    var s = Strikes[n];
    near[n] = s.nearness;
    // mirrored on the water around where it strikes, reaching and fading like the
    // reflected rain at its distance (see reflectCharacter)
    GL.mirrorData[n * 3] = s.groundY;
    GL.mirrorData[n * 3 + 1] = reflectionReach(s.nearness);
    GL.mirrorData[n * 3 + 2] = useReflectionPlane && planeActive()
      ? Math.min(1, ReflectionStrength) * (1 - 0.3 * s.nearness) : 0;
    if (s.flash > 0.01 && !(useDebug && DebugNoFlash)) {
      // the flash: the main channel's pieces, and its band and layers, which close
      // in on the channel as it fades
      var main = s.main;
      for (var i = 0, k = 0; i + 3 < main.length && k < MaxChannelSegments; i += 2, k++) {
        for (var c = 0; c < 4; c++) {
          GL.channelData[segments * 4 + c] = main[i + c];
        }
        segments++;
      }
      var size = s.flashSize;
      bands[n] = s.flashBand * size;
      lights[n] = s.flash * FlashPeak;
      for (var w = 0; w < 4; w++) {
        GL.layerData[n * 4 + w] = s.flashWidths[w] * size;
      }
    }
    ends[n] = segments;
  }
  for (var n = count; n < 3; n++) {
    ends[n] = segments;
  }
  gl.uniform3f(info.uniforms.uStrikeNear, near[0], near[1], near[2]);
  gl.uniform4fv(info.uniforms["uChannel[0]"], GL.channelData);
  gl.uniform3f(info.uniforms.uChannelEnd, ends[0], ends[1], ends[2]);
  gl.uniform3f(info.uniforms.uFlashBand, bands[0], bands[1], bands[2]);
  gl.uniform3f(info.uniforms.uFlashLight, lights[0], lights[1], lights[2]);
  gl.uniform4fv(info.uniforms["uFlashLayers[0]"], GL.layerData);
  gl.uniform3fv(info.uniforms["uBoltMirror[0]"], GL.mirrorData);
  gl.uniform4f(info.uniforms.uFlashWeights, FlashWeights[0], FlashWeights[1], FlashWeights[2], FlashWeights[3]);
  gl.uniform1f(info.uniforms.uFlashWhite, LightningFlashWhite);
}

function lerp(value1, value2, amount) {
  amount = amount < 0 ? 0 : amount;
  amount = amount > 1 ? 1 : amount;
  return value1 + (value2 - value1) * amount;
}

function clamp(min, max, value) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function wallpaperAudioListener(audioArray) {
  // a simulated music source (Debug mode) takes the place of the real audio
  if (useDebug && DebugMusicSource != "real") {
    return FrequencyArray;
  }
  AudioArrays++;
  return (FrequencyArray = audioArray);
}

var letters = (letters = {
  A: [
    [0, 1, 0],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
  ],
  B: [
    [1, 1, 0],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ],
  C: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  D: [
    [1, 1, 0],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 0],
  ],
  E: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  F: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 0, 0],
    [1, 0, 0],
  ],
  G: [
    [0, 1, 1, 0],
    [1, 0, 0, 0],
    [1, 0, 1, 1],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
  ],
  H: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
  ],
  I: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  J: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  K: [
    [1, 0, 0, 1],
    [1, 0, 1, 0],
    [1, 1, 0, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 1],
  ],
  L: [
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  M: [
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
  ],
  N: [
    [1, 0, 0, 1],
    [1, 1, 0, 1],
    [1, 0, 1, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
  ],
  O: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  P: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
  ],
  Q: [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 1, 1],
    [1, 1, 1, 1],
  ],
  R: [
    [1, 1, 0],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
  ],
  S: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  U: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  V: [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  W: [
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  X: [
    [1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0],
    [0, 0, 1, 0, 0],
    [0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1],
  ],
  Y: [
    [1, 0, 1],
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  Z: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  0: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  1: [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  2: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  3: [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  4: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  5: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  6: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  7: [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  8: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  9: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  ":": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "!": [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 1, 0],
  ],
  "?": [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 0, 0],
    [0, 1, 0],
  ],
  " ": [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
});

// width and height of a string drawn by drawString, in character cells
function measureString(string, size) {
  string = string.toUpperCase();
  var width = 0;
  var height = 0;
  for (var i = 0; i < string.length; i++) {
    var letter = letters[string.charAt(i)];
    if (letter) {
      var letterWidth = 0;
      for (var y = 0; y < letter.length; y++) {
        letterWidth = Math.max(letterWidth, letter[y].length);
      }
      // letter plus one column of spacing
      width += (letterWidth + 1) * size;
      height = Math.max(height, letter.length * size);
    }
  }
  // no spacing after the last letter
  return [Math.max(0, width - size), height];
}

// top-left cell that places the centre of a string at a percentage of the screen,
// keeping the whole string on screen
function percentagePosition(string, size, percentX, percentY) {
  var cells = measureString(string, size);
  var screenColumns = Math.floor(ScreenWidth / TextUnit);
  var screenRows = Math.floor(ScreenHeight / TextUnit);
  var posX = Math.floor((screenColumns * percentX) / 100.0 - cells[0] / 2.0);
  var posY = Math.floor((screenRows * percentY) / 100.0 - cells[1] / 2.0);
  posX = Math.max(0, Math.min(screenColumns - cells[0], posX));
  posY = Math.max(0, Math.min(screenRows - cells[1], posY));
  return [posX, posY];
}

// fade the unlit pixels of a string (in its area) and remember its lit pixels (see
// isLit); size is the cells per pixel of a letter, the offsets the top left cell,
// shiftX / shiftY its OLED pixel shift. Gives its area in pixels (left, top,
// right, bottom); the rest of the screen is faded by fadeAround
function drawString(string, size, X_offset, Y_offset, shiftX, shiftY) {
  // top left corner in pixels, including the OLED pixel shift
  var X_pixels = X_offset * TextUnit + shiftX;
  var Y_pixels = Y_offset * TextUnit + shiftY;
  var needed = [];
  string = string.toUpperCase(); // because I only did uppercase letters
  for (var i = 0; i < string.length; i++) {
    var letter = letters[string.charAt(i)];
    if (letter) {
      // because there's letters I didn't do
      needed.push(letter);
    }
  }

  var max_currY = 0;
  var currX = X_pixels;
  for (i = 0; i < needed.length; i++) {
    letter = needed[i];
    var currY = Y_pixels;
    var addX = 0;
    for (var y = 0; y < letter.length; y++) {
      // blend column right from letter
      fadeRect(
        currX + letter[y].length * (size * TextUnit),
        currY + TextUnit / 4.5,
        size * TextUnit,
        size * TextUnit,
      );

      var row = letter[y];
      for (var x = 0; x < row.length; x++) {
        // blend pixel
        if (!row[x]) {
          fadeRect(
            currX + x * (size * TextUnit),
            currY + TextUnit / 4.5,
            size * TextUnit,
            size * TextUnit,
          );
        } else {
          // remember the lit pixel, see isLit
          LitRects[LitRectCount++] = [
            currX + x * (size * TextUnit),
            currY + TextUnit / 4.5,
            size * TextUnit,
            size * TextUnit,
          ];
        }
      }
      addX = Math.max(addX, row.length * (size * TextUnit));
      currY += size * TextUnit;

      if (currY > max_currY) {
        max_currY = currY;
      }
    }
    currX += size * TextUnit + addX;
  }

  return [X_pixels, Y_pixels + TextUnit / 4.5, currX, max_currY];
}

// fade the screen outside the areas of the clock and the message (left, top,
// right, bottom each): in bands between their top and bottom edges, the parts of
// each band not covered by an area
function fadeAround(boxes) {
  var edges = [0, ScreenHeight];
  for (var n = 0; n < boxes.length; n++) {
    edges.push(clamp(0, ScreenHeight, boxes[n][1]), clamp(0, ScreenHeight, boxes[n][3]));
  }
  edges.sort(function (a, b) {
    return a - b;
  });
  for (var e = 0; e + 1 < edges.length; e++) {
    var top = edges[e];
    var bottom = edges[e + 1];
    if (bottom <= top) {
      continue;
    }
    // the areas in this band, from left to right
    var covered = [];
    for (var n = 0; n < boxes.length; n++) {
      var box = boxes[n];
      if (box[1] < bottom && box[3] > top && box[2] > box[0]) {
        covered.push([box[0], box[2]]);
      }
    }
    covered.sort(function (a, b) {
      return a[0] - b[0];
    });
    var x = 0;
    for (var c = 0; c < covered.length; c++) {
      if (covered[c][0] > x) {
        fadeRect(x, top, covered[c][0] - x, bottom - top);
      }
      x = Math.max(x, covered[c][1]);
    }
    if (x < ScreenWidth) {
      fadeRect(x, top, ScreenWidth - x, bottom - top);
    }
  }
}

// the size (cells per pixel of a letter) that makes a string a percentage of the
// screen width wide; 0 hides it
function relativeTextSize(string, percent) {
  var cells = measureString(string, 1)[0];
  if (!(cells > 0) || !(percent > 0)) {
    return 0;
  }
  return ((percent / 100) * ScreenWidth) / (cells * TextUnit);
}

// draw every character once into a grid on a single canvas, one font_size cell each,
// so the rain is drawn from one texture instead of one texture per character
function Update_GlyphAtlas() {
  GlyphCount = characters.length;
  GlyphAtlasColumns = Math.max(1, Math.ceil(Math.sqrt(GlyphCount)));
  var atlasRows = Math.max(1, Math.ceil(GlyphCount / GlyphAtlasColumns));
  GlyphAtlas.width = GlyphAtlasColumns * font_size;
  GlyphAtlas.height = atlasRows * font_size;
  var TextCtx = GlyphAtlas.getContext("2d");

  // Black background
  TextCtx.fillStyle = "rgba(0,0,0,1.0)";
  TextCtx.fillRect(0, 0, GlyphAtlas.width, GlyphAtlas.height);

  // white text
  TextCtx.font = font_size + "px consolas";
  TextCtx.fillStyle = "rgba(255,255,255,1.0)";
  for (var i = 0; i < GlyphCount; i++) {
    var cellX = (i % GlyphAtlasColumns) * font_size;
    var cellY = Math.floor(i / GlyphAtlasColumns) * font_size;
    // keep wide characters inside their own cell
    TextCtx.save();
    TextCtx.beginPath();
    TextCtx.rect(cellX, cellY, font_size, font_size);
    TextCtx.clip();
    TextCtx.fillText(characters[i], cellX, cellY + font_size);
    TextCtx.restore();
  }

  // find the characters that left their cell completely black
  var pixels = TextCtx.getImageData(
    0,
    0,
    GlyphAtlas.width,
    GlyphAtlas.height,
  ).data;
  GlyphBlank = [];
  for (var i = 0; i < GlyphCount; i++) {
    var cellX = (i % GlyphAtlasColumns) * font_size;
    var cellY = Math.floor(i / GlyphAtlasColumns) * font_size;
    var blank = true;
    for (var y = cellY; y < cellY + font_size && blank; y++) {
      for (var x = cellX; x < cellX + font_size; x++) {
        var p = (y * GlyphAtlas.width + x) * 4;
        if (pixels[p] || pixels[p + 1] || pixels[p + 2]) {
          blank = false;
          break;
        }
      }
    }
    GlyphBlank[i] = blank;
  }

  // upload the new characters to the WebGL renderer before they are drawn
  GL.atlasDirty = true;
  TextAtlasDirty = true;
}

// move a shift by step pixels, going the other way if it would leave the range
function applyShiftStep(shift, step) {
  if (Math.abs(shift + step) > OLEDPixelShift) {
    step = -step;
  }
  return shift + step;
}

// every 10 seconds move the rain columns by 1 pixel left or right,
// and the clock and the message by 1 pixel in any direction, to protect OLED screens
function shiftPixels() {
  if (OLEDPixelShift == 0) {
    return;
  }

  RainShiftX = applyShiftStep(RainShiftX, Math.random() < 0.5 ? -1 : 1);

  // the clock and the message each to one of their 8 neighbouring pixels
  var step = neighbourStep();
  ClockShiftX = applyShiftStep(ClockShiftX, step[0]);
  ClockShiftY = applyShiftStep(ClockShiftY, step[1]);
  step = neighbourStep();
  MessageShiftX = applyShiftStep(MessageShiftX, step[0]);
  MessageShiftY = applyShiftStep(MessageShiftY, step[1]);
}

// a random step to one of the 8 neighbouring pixels
function neighbourStep() {
  var stepX = 0;
  var stepY = 0;
  while (stepX == 0 && stepY == 0) {
    stepX = Math.floor(Math.random() * 3) - 1;
    stepY = Math.floor(Math.random() * 3) - 1;
  }
  return [stepX, stepY];
}

// The frame rate. The lowest of Frame cap, Wallpaper Engine's FPS and the monitor's
// refresh rate is the target; the wallpaper draws at the highest rate this PC holds
// (FrameRate), measured as it goes (see followFrameRate), on the browser's animation
// frames (see setFrameTimer). The fog, the water, the lightning and its reflection
// move in every frame; the rain, the splashes and their reflections in every
// RainEvery-th frame, by the rain time since they last moved: several steps at once
// when that is longer than a rain step, or a part of a step (they glide, see
// glComposeShown) when it is shorter. The rain falls at the same speed at any rate
var FrameRate = 24;
var RainEvery = 1;
// how many frames have been drawn, and did the last one move the rain?
var FrameNumber = 0;
var LastFrameMovedRain = true;
// the part of a rain step shown since the last whole step (0 to 1, when gliding)
var RainPhase = 0;
// the frame rate measured over windows of RateWindow ms: when a window falls short
// of RateHolds of FrameRate, the rain first moves in fewer frames (if that helps),
// then the frame rate goes down to what was measured; after RateWait seconds of
// windows that hold, a better rate is tried for one window (the wait doubles, up
// to RateWaitMost, each time that fails)
var RateWindow = 2000;
var RateHolds = 0.92;
var RateWaitLeast = 6;
var RateWaitMost = 60;
var RateWait = RateWaitLeast;
var RateWindowStart = 0;
var RateWindowFrames = 0;
var RateGood = 0;
// the rate being tried: what to go back to, and why it is tried ("every": moving
// the rain in fewer frames, "up": a better rate), with the rate measured before
var RateTrial = null;
// the rate measured in the last window
var ShownRate = 0;
// the lowest frame rate, and the lowest rate the rain moves at (frames a second)
var FrameRateLeast = 10;
var RainRateLeast = 24;

// the lowest of the frame cap setting, Wallpaper Engine's FPS and the monitor's
// refresh rate; FrameRateSource says which one it is
var FrameRateSource = "Frame cap";
function frameRateLimit() {
  var limit = FrameCap;
  FrameRateSource = "Frame cap";
  if (WallpaperEngineFPS > 0 && WallpaperEngineFPS < limit) {
    limit = WallpaperEngineFPS;
    FrameRateSource = "Wallpaper Engine";
  }
  if (RefreshRate > 0 && RefreshRate < limit) {
    limit = RefreshRate;
    FrameRateSource = "Refresh rate";
  }
  return limit;
}

// The monitor's refresh rate (0 = not known yet): the browser's animation frames come
// once for every refresh of the screen, so the time between RefreshCount of them
// (the middle one, as some come late) gives it (see rafFrame). Measured after the
// first window of the frame rate measurement and again every RefreshEvery windows (a
// minute), in case it moved to another monitor. Only the times after an animation
// frame whose own frame took less than half of it count: after a longer one, the
// next animation frame waits for the work, not for the screen. Rates under
// RefreshLeast are not taken: a hidden page gets animation frames rarely
var RefreshRate = 0;
var RefreshCount = 60;
var RefreshEvery = 30;
var RefreshLeast = 23;
var RefreshTimes = new Float64Array(RefreshCount);
var RefreshSamples = 0;
var RefreshLast = 0;
var RefreshMeasuring = false;
var RefreshWindows = RefreshEvery - 1;

// measure the refresh rate on the next animation frames (see rafFrame)
function measureRefreshRate() {
  if (RefreshMeasuring) {
    return;
  }
  RefreshMeasuring = true;
  RefreshSamples = 0;
  RefreshLast = 0;
}

// one animation frame of the measurement: the time since the one before (when the
// frame drawn on that one, RafLastWork ms, took less than half of it)
function followRefresh(time) {
  if (RefreshLast > 0 && RafLastWork < (time - RefreshLast) * 0.5) {
    RefreshTimes[RefreshSamples++] = time - RefreshLast;
  }
  RefreshLast = time;
  if (RefreshSamples < RefreshCount) {
    return;
  }
  RefreshMeasuring = false;
  Array.prototype.sort.call(RefreshTimes, function (a, b) {
    return a - b;
  });
  var middle = RefreshTimes[Math.floor(RefreshCount / 2)];
  var rate = middle > 0 ? Math.round(1000 / middle) : 0;
  if (rate >= RefreshLeast && rate != RefreshRate) {
    RefreshRate = rate;
    startTimer();
  }
}

// does the rain glide (move by parts of a step)? When it moves more often than
// once a step
function rainGlides() {
  return FrameRate / RainEvery > 1000.0 / speed;
}

// (re)start drawing with the current speed and frame rate limit: the frame rate
// starts at the target again
function startTimer() {
  FrameRate = frameRateLimit();
  RainEvery = 1;
  RateTrial = null;
  RateGood = 0;
  RateWait = RateWaitLeast;
  RateWindowStart = 0;
  StepTime = 0;
  RainPhase = 0;
  LastFrameTime = Date.now();
  setFrameTimer();
}

// The frames come on the browser's animation frames (requestAnimationFrame), which
// come once for every refresh of the screen, so every frame drawn is shown: a frame
// is drawn on the first animation frame on which one is due at FrameRate (RafNext,
// within RafEarly ms), and none is caught up after a delay. They stop while
// Wallpaper Engine has paused the wallpaper (and the browser stops them while the
// page is hidden)
var RafOn = false;
var RafWaiting = false;
var RafNext = 0;
var RafEarly = 2;
// how long the frame drawn on the last animation frame took (0: none drawn), and
// the animation frames of the current window of the frame rate measurement
var RafLastWork = 0;
var RafTicks = 0;
// the animation frames a second in the last window
var TickRate = 0;

// (re)start the frames at the current frame rate
function setFrameTimer() {
  RafNext = 0;
  RafOn = !isPaused;
  if (RafOn && !RafWaiting && window.requestAnimationFrame) {
    RafWaiting = true;
    window.requestAnimationFrame(rafFrame);
  }
}

// one animation frame: the next one is asked for, the refresh rate measured, and a
// frame drawn when one is due
function rafFrame(time) {
  RafWaiting = false;
  if (!RafOn) {
    return;
  }
  RafWaiting = true;
  window.requestAnimationFrame(rafFrame);
  if (RefreshMeasuring) {
    followRefresh(time);
  }
  RafTicks++;
  RafLastWork = 0;
  var interval = 1000.0 / FrameRate;
  if (!RafNext) {
    RafNext = time;
  }
  if (time < RafNext - RafEarly) {
    return;
  }
  RafNext += interval;
  if (time - RafNext > interval) {
    RafNext = time + interval;
  }
  var started = performance.now();
  frame();
  RafLastWork = performance.now() - started;
}

// the most frames the rain may skip: it keeps moving at least RainRateLeast times
// a second
function rainEveryMost() {
  return Math.max(1, Math.floor(FrameRate / RainRateLeast));
}

// a lower frame rate: the refresh rate (or, while it is not known, the animation
// frames a second) divided by a whole number, so frames stay evenly spaced on the
// refreshes, the highest one up to what was measured; without either, a little under
// the one measured, so it holds
function lowerFrameRate(shown) {
  var rate = Math.floor(shown * 0.95);
  var base = RefreshRate > 0 ? RefreshRate : TickRate;
  if (base >= FrameRateLeast) {
    var k = 1;
    while (base / k > Math.min(FrameRate - 1, shown * 1.02)) {
      k++;
    }
    rate = base / k;
  }
  FrameRate = Math.max(FrameRateLeast, Math.min(FrameRate - 1, rate));
  RainEvery = Math.min(RainEvery, rainEveryMost());
}

// a higher frame rate to try: the next refresh rate divided by a whole number (when
// the refresh rate is known), otherwise 10% more; at most the target
function higherFrameRate() {
  var rate = Math.ceil(FrameRate * 1.1);
  if (RefreshRate > 0) {
    var k = Math.max(1, Math.floor(RefreshRate / FrameRate));
    while (k > 1 && RefreshRate / k <= FrameRate) {
      k--;
    }
    rate = RefreshRate / k;
  }
  return Math.min(frameRateLimit(), rate);
}

// count the frame, and every RateWindow ms compare the frames drawn with the frame
// rate: go down when it does not hold, try a better one after a while when it does
function followFrameRate(now) {
  if (!RateWindowStart || now < RateWindowStart) {
    RateWindowStart = now;
    RateWindowFrames = 0;
    return;
  }
  RateWindowFrames++;
  var elapsed = now - RateWindowStart;
  if (elapsed < RateWindow) {
    return;
  }
  var shown = (RateWindowFrames * 1000) / elapsed;
  RateWindowStart = now;
  RateWindowFrames = 0;
  ShownRate = shown;
  TickRate = (RafTicks * 1000) / elapsed;
  RafTicks = 0;
  RefreshWindows++;
  if (RefreshWindows >= RefreshEvery) {
    RefreshWindows = 0;
    measureRefreshRate();
  }
  var holds = shown >= FrameRate * RateHolds;
  var trial = RateTrial;
  RateTrial = null;
  var changed = false;
  if (trial && trial.why == "up") {
    if (holds) {
      // a better rate holds: try the next one soon
      RateWait = RateWaitLeast;
      RateGood = 0;
      return;
    }
    // it does not: back, and wait longer before trying again
    FrameRate = trial.rate;
    RainEvery = trial.every;
    RateWait = Math.min(RateWaitMost, RateWait * 2);
    RateGood = 0;
    setFrameTimer();
    return;
  }
  if (holds) {
    RateGood += elapsed / 1000;
    if (RateGood >= RateWait && (RainEvery > 1 || FrameRate < frameRateLimit())) {
      // try a better rate: the rain in more frames first, then more frames
      RateTrial = { why: "up", rate: FrameRate, every: RainEvery };
      if (RainEvery > 1) {
        RainEvery--;
      } else {
        FrameRate = higherFrameRate();
      }
      RateGood = 0;
      changed = true;
    }
  } else {
    RateGood = 0;
    if (trial && trial.why == "every" && shown < trial.shown * 1.03) {
      // moving the rain in fewer frames did not help: back, and a lower rate
      RainEvery = trial.every;
      lowerFrameRate(Math.max(shown, trial.shown));
    } else if (RainEvery < rainEveryMost()) {
      // the rain in fewer frames, if that helps
      RateTrial = { why: "every", rate: FrameRate, every: RainEvery, shown: shown };
      RainEvery++;
    } else {
      lowerFrameRate(shown);
    }
    changed = true;
  }
  if (changed) {
    setFrameTimer();
  }
}

// draw one frame (see frameSteps), with what Debug mode adds around it
function frame() {
  if (useDebug && DebugFreeze) {
    // frozen: nothing moves, and no time is caught up afterwards
    StepTime = 0;
    LastFrameTime = Date.now();
    RateWindowStart = 0;
    debugPanel(0);
    return;
  }
  if (!useDebug) {
    frameSteps();
    return;
  }
  var started = performance.now();
  debugMusicSource();
  frameSteps();
  debugPanel(performance.now() - started);
}

// draw one frame. The rain moves in every RainEvery-th frame, by the rain time
// since it last moved: the whole steps, and when it glides, the part of a step
// after them (RainPhase)
function frameSteps() {
  var now = Date.now();
  followFrameRate(now);
  var elapsed = now - LastFrameTime;
  StepTime += elapsed;
  LastFrameTime = now;
  FrameNumber++;
  var glides = rainGlides();
  // the water follows the rain steps when the rain moves in every frame by whole
  // steps (as the rain), otherwise the time since the last frame
  FrameWaterSeconds = glides || RainEvery > 1 ? Math.min(0.5, Math.max(0, elapsed / 1000.0)) : -1;
  var moves = FrameNumber % RainEvery == 0;
  LastFrameMovedRain = moves;
  if (!moves) {
    draw(0);
    return;
  }
  var steps = Math.floor(StepTime / speed);
  // don't try to catch up after a long delay
  var maxSteps = Math.ceil((1000.0 * RainEvery) / FrameRate / speed) + 1;
  if (steps > maxSteps) {
    steps = maxSteps;
    StepTime = 0;
  } else {
    StepTime -= steps * speed;
  }
  RainPhase = glides ? Math.min(1, StepTime / speed) : 0;
  draw(steps);
}

// Debug mode (p615_setting_DebugMode): readouts and switches for testing and
// fine-tuning. Each of them works only while Debug mode is on
var useDebug = false;
var DebugMusicReadout = false;
// "real" (Wallpaper Engine's audio), or a simulated music: one of audiogen.js's kinds
var DebugMusicSource = "real";
var DebugMusicStart = 0;
// Strike now: its last value (null before the first), and a strike waiting to start
var DebugStrikeNow = null;
var DebugStrikePending = false;
var DebugStrikeNearness = 0.5;
var DebugPerformance = false;
var DebugNearness = false;
var DebugNoFlash = false;
var DebugNoSplashes = false;
var DebugFreeze = false;
var DebugOledReadout = false;
// Steady start: the drops start as the settled rain, with its trails (see steadyLook)
var DebugSteadyStart = false;

// the readouts: one panel, made once, its text renewed every half second
var DebugPanel = null;
var DebugPanelEvery = 500;
var DebugPanelTime = 0;
var DebugFrames = 0;
var DebugJsTime = 0;
// the music readout: this frame's loudness and threshold, the best peak score
// since the panel was renewed, and the times of the last music strikes (a ring)
var DebugLoudness = 0;
var DebugThreshold = 0;
var DebugScoreMost = 0;
var DebugStrikeTimes = new Float64Array(256);
var DebugStrikeAt = 0;
var DebugStrikeWindow = 30;

// is any readout shown?
function debugReadouts() {
  return useDebug && (DebugMusicReadout || DebugPerformance || DebugOledReadout);
}

// show or hide the panel of the readouts
function debugShowPanel() {
  var shown = debugReadouts();
  if (shown && !DebugPanel) {
    DebugPanel = document.createElement("pre");
    DebugPanel.id = "debug-panel";
    var style = DebugPanel.style;
    style.position = "fixed";
    style.left = "8px";
    style.top = "8px";
    style.margin = "0";
    style.padding = "6px 8px";
    style.zIndex = "10";
    style.pointerEvents = "none";
    style.font = "12px/1.35 Consolas, monospace";
    style.color = "#9f9";
    style.background = "rgba(0, 0, 0, 0.7)";
    (document.body || document.documentElement).appendChild(DebugPanel);
  }
  if (DebugPanel) {
    DebugPanel.style.display = shown ? "block" : "none";
  }
  if (!shown) {
    DebugPanelTime = 0;
  }
}

// a music strike started now
function debugMusicStrike() {
  if (useDebug) {
    DebugStrikeTimes[DebugStrikeAt] = Date.now();
    DebugStrikeAt = (DebugStrikeAt + 1) % DebugStrikeTimes.length;
  }
}

// count the frame, and renew the readouts' text every DebugPanelEvery
function debugPanel(jsTime) {
  if (!debugReadouts()) {
    return;
  }
  DebugFrames++;
  DebugJsTime += jsTime;
  var now = Date.now();
  if (DebugPanelTime && now - DebugPanelTime < DebugPanelEvery) {
    return;
  }
  var lines = [];
  if (DebugMusicReadout) {
    var strikes = 0;
    for (var i = 0; i < DebugStrikeTimes.length; i++) {
      if (DebugStrikeTimes[i] > 0 && now - DebugStrikeTimes[i] <= DebugStrikeWindow * 1000) {
        strikes++;
      }
    }
    lines.push("Music (" + (DebugMusicSource == "real" ? "real audio" : "simulated " + DebugMusicSource) +
      (musicDriven() ? ")" : ", idle)"));
    lines.push("  loudness " + DebugLoudness.toFixed(3) + "  floor " + MusicFloor.toFixed(3));
    lines.push("  best peak score " + DebugScoreMost.toFixed(3) + "  threshold " + DebugThreshold.toFixed(3));
    lines.push("  tempo " + (MusicTempo > 0 ? Math.round(MusicTempo) + " bpm" : "-") +
      "  x" + tempoFactor().toFixed(2));
    lines.push("  song energy x" + energyFactor().toFixed(2) + "  brightness x" + brightnessFactor().toFixed(2));
    lines.push("  music strikes in the last " + DebugStrikeWindow + " s: " + strikes);
    // the rain the music sets now: its drop target, that as a Rain density (the density
    // that gives as many drops without music), and the drops falling (those finishing
    // their fall apart, see balanceDrops)
    var settled = DropCapacity * RainScale;
    lines.push("  rain target " + RainTarget + " drops (density " +
      (settled > 0 ? (RainDensity * RainTarget) / settled : 0).toFixed(1) + " of " + RainDensity + "), " +
      RainCount + " falling (" + RainDraining + " finishing), " + RainPending + " waiting above");
  }
  if (DebugPerformance) {
    var elapsed = now - DebugPanelTime;
    lines.push("Performance");
    lines.push("  " + (DebugPanelTime && elapsed > 0 ? (DebugFrames * 1000 / elapsed).toFixed(1) : "-") +
      " fps (limit " + frameRateLimit() + ")" + (DebugFreeze ? ", frozen" : ""));
    var limit = frameRateLimit();
    lines.push("  frame cap " + limit + " (" + FrameRateSource + "): Frame cap " + FrameCap + ", Wallpaper Engine " +
      (WallpaperEngineFPS > 0 ? WallpaperEngineFPS : "-") + ", refresh rate " + (RefreshRate > 0 ? RefreshRate + " Hz" : "-"));
    lines.push("  holding " + FrameRate + " fps (measured " + ShownRate.toFixed(1) + "), rain in every " +
      (RainEvery == 1 ? "frame" : RainEvery + " frames") + (rainGlides() ? ", gliding" : ""));
    lines.push("  JS " + (DebugFrames ? DebugJsTime / DebugFrames : 0).toFixed(2) + " ms a frame");
    lines.push("  screen " + ScreenWidth + "x" + ScreenHeight + ", drops " + RainCount +
      ", splashes " + ParticleCount + ", strikes " + Strikes.length);
  }
  if (DebugOledReadout) {
    lines.push("OLED pixel shift (at most " + OLEDPixelShift + ")");
    lines.push("  rain " + RainShiftX + ", clock " + ClockShiftX + ", " + ClockShiftY +
      ", message " + MessageShiftX + ", " + MessageShiftY);
  }
  var text = lines.join("\n");
  if (DebugPanel && DebugPanel.textContent != text) {
    DebugPanel.textContent = text;
  }
  DebugPanelTime = now;
  DebugFrames = 0;
  DebugJsTime = 0;
  DebugScoreMost = 0;
}

// a simulated music source: Wallpaper Engine's 128 audio values (64 for the left
// channel, 64 for the right, low to high frequencies), made by audiogen.js (AudioGen,
// the same synthetic music as the tests', with its own random numbers, so the rain's
// do not change), into one array, a new one at most DebugMusicRate times a second, as
// Wallpaper Engine sends them. DebugMusicGen: the music being played (made again,
// from its start, when the source changes)
var DebugMusicArray = new Float32Array(128);
var DebugMusicRate = 30;
var DebugMusicMade = 0;
var DebugMusicGen = null;

// this frame's audio values of the simulated music, as the real audio
function debugMusicSource() {
  if (DebugMusicSource == "real" || !window.AudioGen) {
    return;
  }
  var now = Date.now();
  if (DebugMusicMade && now - DebugMusicMade < 1000 / DebugMusicRate) {
    return;
  }
  if (!DebugMusicGen) {
    DebugMusicGen = AudioGen(DebugMusicSource);
  }
  DebugMusicMade = now;
  AudioArrays++;
  DebugMusicGen((now - DebugMusicStart) / 1000, DebugMusicArray);
  FrequencyArray = DebugMusicArray;
}

// a simulated music ends: silence until the real audio comes
function debugMusicStop() {
  if (DebugMusicSource != "real" && FrequencyArray === DebugMusicArray) {
    for (var i = 0; i < DebugMusicArray.length; i++) {
      DebugMusicArray[i] = 0;
    }
  }
}

startTimer();
setInterval(shiftPixels, 10000);
