// Shared constants -- keep in sync
const GAIN_MAX = 2.0;
const GAIN_MIN = 0.0;
const DISPLAY_MAX = 200;
const STEP_SIZE = 5;
const WHEEL_THROTTLE_MS = 50;
const MAX_DELTA = 100;
const PIXELS_PER_LINE = 20;

const slider = document.getElementById('slider');
const display = document.getElementById('display');
const stepDown = document.getElementById('step-down');
const stepUp = document.getElementById('step-up');
const status = document.getElementById('status');

function sliderToGain(sliderPercent) {
  return Math.pow(sliderPercent / 200, 3) * 2.0;
}

function gainToSliderPercent(gain) {
  return Math.round(Math.pow(gain / 2.0, 1 / 3) * 200);
}

function setVolume(sliderPercent) {
  sliderPercent = Math.max(0, Math.min(DISPLAY_MAX, Math.round(sliderPercent)));
  slider.value = sliderPercent;
  display.textContent = sliderPercent + '%';
  chrome.runtime.sendMessage({ type: 'SET_GAIN', gain: sliderToGain(sliderPercent) });
}

// Slider input
slider.addEventListener('input', function () {
  setVolume(parseInt(slider.value, 10));
});

// Step arrows -- mousedown with preventDefault to avoid focus theft
stepDown.addEventListener('mousedown', function (e) {
  e.preventDefault();
  setVolume(parseInt(slider.value, 10) - STEP_SIZE);
});

stepUp.addEventListener('mousedown', function (e) {
  e.preventDefault();
  setVolume(parseInt(slider.value, 10) + STEP_SIZE);
});

// Wheel handler -- passive:false, throttle, deltaMode normalization, delta clamp
var lastWheelTime = 0;

document.getElementById('popup').addEventListener('wheel', function (e) {
  e.preventDefault();

  var now = Date.now();
  if (now - lastWheelTime < WHEEL_THROTTLE_MS) {
    return;
  }
  lastWheelTime = now;

  var delta = e.deltaY;
  if (e.deltaMode === 1) {
    delta *= PIXELS_PER_LINE;
  } else if (e.deltaMode === 2) {
    delta *= 600;
  }

  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));

  // Negative deltaY = scroll up = increase volume
  var direction = delta < 0 ? 1 : -1;
  setVolume(parseInt(slider.value, 10) + direction * STEP_SIZE);
}, { passive: false });

// Popup lifecycle -- state recovery
document.addEventListener('DOMContentLoaded', async function () {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  if (!tab || !tab.id) {
    return;
  }
  var currentTabId = tab.id;

  chrome.runtime.sendMessage({ type: 'GET_STATE' }, function (response) {
    if (response && response.active && response.tabId === currentTabId) {
      var val = gainToSliderPercent(response.gain);
      slider.value = val;
      display.textContent = val + '%';
    } else {
      chrome.runtime.sendMessage({ type: 'CAPTURE_START', tabId: currentTabId });
    }
  });
});

var vuMeterCanvas = document.getElementById('vu-meter');
var vuMeterCtx = vuMeterCanvas.getContext('2d');

var POPUP_NUM_BARS = 12;

// Color stops: emerald green → chartreuse → gold → amber → crimson
var POPUP_BAR_COLORS = [
  { h: 142, s: 85, lLit: 45, lDim: 10 },
  { h: 134, s: 82, lLit: 44, lDim: 10 },
  { h: 120, s: 80, lLit: 43, lDim: 10 },
  { h: 96,  s: 80, lLit: 44, lDim: 9 },
  { h: 72,  s: 85, lLit: 46, lDim: 9 },
  { h: 54,  s: 90, lLit: 48, lDim: 10 },
  { h: 42,  s: 92, lLit: 46, lDim: 9 },
  { h: 32,  s: 90, lLit: 44, lDim: 9 },
  { h: 22,  s: 88, lLit: 44, lDim: 8 },
  { h: 12,  s: 85, lLit: 42, lDim: 8 },
  { h: 4,   s: 82, lLit: 46, lDim: 8 },
  { h: 0,   s: 80, lLit: 48, lDim: 8 }
];

var popupSmoothed = new Float32Array(POPUP_NUM_BARS);
var POPUP_SMOOTH_RISE = 0.65;
var POPUP_SMOOTH_FALL = 0.3;
var POPUP_DIM_SAT_FACTOR = 0.25;

function popupMapBin(data, barIndex, numBars) {
  var binCount = data.length;
  var start = Math.floor((barIndex / numBars) * binCount);
  var end = Math.floor(((barIndex + 1) / numBars) * binCount);
  if (end <= start) end = start + 1;
  if (end > binCount) end = binCount;
  var sum = 0;
  var count = 0;
  for (var j = start; j < end; j += 1) {
    sum += data[j];
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function drawRoundedBar(ctx, x, y, w, h, radius) {
  var r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawPopupVu(data) {
  var numBars = POPUP_NUM_BARS;
  var w = vuMeterCanvas.width;
  var h = vuMeterCanvas.height;
  var pad = 2;
  var innerW = w - pad * 2;
  var barWidth = innerW / numBars;
  var barRadius = 1.5;
  var i, c, raw, level;

  vuMeterCtx.clearRect(0, 0, w, h);

  // Dark background fill
  vuMeterCtx.fillStyle = '#f5f3f0';
  vuMeterCtx.beginPath();
  vuMeterCtx.roundRect(0, 0, w, h, 2);
  vuMeterCtx.fill();

  // Find overall peak to determine how many bars should be active
  var peak = 0;
  for (var j = 0; j < data.length; j += 1) {
    if (data[j] > peak) peak = data[j];
  }
  var peakNorm = peak / 255;
  var litCount = Math.round(peakNorm * numBars);

  for (i = 0; i < numBars; i += 1) {
    raw = popupMapBin(data, i, numBars) / 255;
    var target;
    if (i < litCount) {
      target = 0.5 + peakNorm * 0.3 + raw * 0.2;
      if (target > 1) target = 1;
    } else {
      target = raw * 0.15;
    }
    if (target > popupSmoothed[i]) {
      popupSmoothed[i] += (target - popupSmoothed[i]) * POPUP_SMOOTH_RISE;
    } else {
      popupSmoothed[i] += (target - popupSmoothed[i]) * POPUP_SMOOTH_FALL;
    }
    level = popupSmoothed[i];

    var x = pad + Math.round(i * barWidth);
    var bw = Math.round((i + 1) * barWidth) - Math.round(i * barWidth);
    c = POPUP_BAR_COLORS[i] || POPUP_BAR_COLORS[POPUP_BAR_COLORS.length - 1];

    // Continuous brightness driven by level — no on/off threshold
    var brightness = c.lDim + level * (c.lLit + 20 - c.lDim);
    var sat = Math.round(c.s * POPUP_DIM_SAT_FACTOR + level * c.s * (1 - POPUP_DIM_SAT_FACTOR));
    if (brightness > 65) brightness = 65;
    if (sat > 100) sat = 100;

    // Glow scales with level
    vuMeterCtx.save();
    if (level > 0.15) {
      vuMeterCtx.shadowColor = 'hsla(' + c.h + ',' + sat + '%,' + (brightness + 10) + '%,' + (level * 0.4) + ')';
      vuMeterCtx.shadowBlur = level * 6;
    }
    vuMeterCtx.fillStyle = 'hsl(' + c.h + ',' + sat + '%,' + brightness + '%)';
    drawRoundedBar(vuMeterCtx, x, 2, bw, h - 4, barRadius);
    vuMeterCtx.restore();
  }
}

// Listen for STATE broadcasts (e.g. after STREAM_READY)
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg.type === 'STATE' && msg.active) {
    var val = gainToSliderPercent(msg.gain);
    slider.value = val;
    display.textContent = val + '%';
    status.textContent = '';
  }

  if (msg.type === 'VU_DATA' && msg.freqBins) {
    drawPopupVu(msg.freqBins);
  }

  if (msg.type === 'DRM_WARNING') {
    status.textContent = 'DRM-protected content detected.';
  }

  if (msg.type === 'STREAM_ERROR') {
    status.textContent = 'Cannot capture audio from this tab.';
  }

  if (msg.type === 'STREAM_ENDED') {
    status.textContent = 'Audio stream ended.';
  }
});
