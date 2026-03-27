var audioCtx = null;
var source = null;
var chain = null;
var stream = null;
var currentGain = 1.0;
var vuCanvas16 = null;
var vuCanvas32 = null;
var vuCtx16 = null;
var vuCtx32 = null;
var freqData = null;
var vuIntervalId = null;
var drmTimerId = null;
var drmWarningSent = false;

function isFreqDataSilent() {
  var i;

  if (!freqData) {
    return true;
  }

  for (i = 0; i < freqData.length; i += 1) {
    if (freqData[i] !== 0) {
      return false;
    }
  }

  return true;
}

var NUM_BARS = 12;

// Color stops: emerald green → chartreuse → gold → amber → crimson
var BAR_COLORS = [
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

// Smoothed bar levels for fluid animation
var smoothedLevels = new Float32Array(NUM_BARS);
var SMOOTH_RISE = 0.45;
var SMOOTH_FALL = 0.18;
var DIM_SAT_FACTOR = 0.25;

function mapFreqBinsToBar(data, barIndex, numBars) {
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

function updateSmoothedLevels(data, numBars) {
  for (var i = 0; i < numBars; i += 1) {
    var raw = mapFreqBinsToBar(data, i, numBars) / 255;
    if (raw > smoothedLevels[i]) {
      smoothedLevels[i] += (raw - smoothedLevels[i]) * SMOOTH_RISE;
    } else {
      smoothedLevels[i] += (raw - smoothedLevels[i]) * SMOOTH_FALL;
    }
  }
}

function drawVuIcon(canvas, ctx, size, numBars) {
  var bars = numBars === undefined ? NUM_BARS : numBars;
  var gap = 1;
  var totalGaps = gap * (bars - 1);
  var barWidth = (size - totalGaps) / bars;
  var i, c, level, lit;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (i = 0; i < bars; i += 1) {
    level = smoothedLevels[i];
    lit = level > 0.08;

    var x = Math.round(i * (barWidth + gap));
    var bw = Math.round((i + 1) * (barWidth + gap) - gap) - x;
    c = BAR_COLORS[i] || BAR_COLORS[BAR_COLORS.length - 1];

    if (lit) {
      var brightness = c.lLit + (level * 12);
      var sat = c.s + (level * 8);
      if (sat > 100) sat = 100;
      if (brightness > 70) brightness = 70;
      ctx.fillStyle = 'hsl(' + c.h + ',' + sat + '%,' + brightness + '%)';
    } else {
      ctx.fillStyle = 'hsl(' + c.h + ',' + Math.round(c.s * DIM_SAT_FACTOR) + '%,' + c.lDim + '%)';
    }
    ctx.fillRect(x, 0, bw, size);
  }
}

function startVuLoop() {
  stopVuLoop();

  if (!chain || !chain.analyser || !freqData) {
    return;
  }

  vuIntervalId = setInterval(function () {
    chain.analyser.getByteFrequencyData(freqData);
    if (isFreqDataSilent()) {
      return;
    }

    updateSmoothedLevels(freqData, NUM_BARS);
    drawVuIcon(vuCanvas16, vuCtx16, 16, NUM_BARS);
    drawVuIcon(vuCanvas32, vuCtx32, 32, NUM_BARS);

    var raw16 = vuCtx16.getImageData(0, 0, 16, 16);
    var raw32 = vuCtx32.getImageData(0, 0, 32, 32);
    chrome.runtime.sendMessage({
      type: 'VU_UPDATE',
      imageData: {
        '16': { data: Array.from(raw16.data), width: 16, height: 16 },
        '32': { data: Array.from(raw32.data), width: 32, height: 32 }
      },
      freqBins: Array.from(freqData)
    });
  }, 50);
}

function stopVuLoop() {
  if (vuIntervalId !== null) {
    clearInterval(vuIntervalId);
    vuIntervalId = null;
  }
}

async function handleStreamInit(msg) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: msg.streamId
        }
      },
      video: false
    });
    audioCtx = new AudioContext();
    await audioCtx.resume();
    source = audioCtx.createMediaStreamSource(stream);
    chain = createSignalChain(audioCtx);
    freqData = new Uint8Array(chain.analyser.frequencyBinCount);
    vuCanvas16 = new OffscreenCanvas(16, 16);
    vuCanvas32 = new OffscreenCanvas(32, 32);
    vuCtx16 = vuCanvas16.getContext('2d');
    vuCtx32 = vuCanvas32.getContext('2d');
    source.connect(chain.gainNode);
    chain.analyser.connect(audioCtx.destination);
    chain.gainNode.gain.value = currentGain;
    stream.getAudioTracks()[0].onended = handleStreamEnd;
    chrome.runtime.sendMessage({ type: 'STREAM_READY' });
    startVuLoop();
    drmWarningSent = false;
    drmTimerId = setTimeout(function () {
      if (!drmWarningSent && isFreqDataSilent()) {
        drmWarningSent = true;
        chrome.runtime.sendMessage({ type: 'DRM_WARNING' });
      }
    }, 2000);
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'STREAM_ERROR', error: e.message });
  }
}

function handleStreamEnd() {
  chrome.runtime.sendMessage({ type: 'STREAM_ENDED' });
  teardown();
}

function teardown() {
  stopVuLoop();
  if (drmTimerId !== null) {
    clearTimeout(drmTimerId);
    drmTimerId = null;
  }
  if (audioCtx) {
    audioCtx.close();
  }
  if (stream) {
    stream.getTracks().forEach(function (t) {
      t.stop();
    });
  }
  audioCtx = null;
  source = null;
  chain = null;
  stream = null;
  freqData = null;
  vuCanvas16 = null;
  vuCanvas32 = null;
  vuCtx16 = null;
  vuCtx32 = null;
  currentGain = 1.0;
  drmWarningSent = false;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'STREAM_INIT') {
    handleStreamInit(msg).then(function () {
      sendResponse();
    }).catch(function () {
      sendResponse();
    });
    return true;
  }

  if (msg.type === 'SET_GAIN') {
    currentGain = msg.gain;
    if (chain && audioCtx) {
      chain.gainNode.gain.setValueAtTime(msg.gain, audioCtx.currentTime);
    }
  }

  if (msg.type === 'CAPTURE_STOP') {
    teardown();
  }

  return false;
});

window.addEventListener('beforeunload', teardown);
