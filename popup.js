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

function drawPopupVu(data) {
  var numBars = 8;
  var segmentsPerBar = 4;
  var segmentGap = 1;
  var w = vuMeterCanvas.width;
  var h = vuMeterCanvas.height;
  var barHeight = h / numBars;
  var segmentWidth = (w - segmentGap * (segmentsPerBar - 1)) / segmentsPerBar;

  vuMeterCtx.clearRect(0, 0, w, h);

  for (var barIndex = 0; barIndex < numBars; barIndex += 1) {
    var sampleIndex = barIndex * 4;
    var barValue = sampleIndex < data.length ? data[sampleIndex] : 0;
    var litSegments = Math.round((barValue / 255) * segmentsPerBar);
    var barY = barIndex * barHeight;
    var hue = Math.round((barIndex / (numBars - 1)) * 120);

    for (var s = 0; s < litSegments; s += 1) {
      var segX = s * (segmentWidth + segmentGap);
      vuMeterCtx.fillStyle = 'hsl(' + hue + ', 100%, 45%)';
      vuMeterCtx.fillRect(segX, barY, segmentWidth, barHeight);
    }
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
