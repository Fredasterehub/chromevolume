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

function drawVuIcon(canvas, ctx, size, data, numBars) {
  var bars = numBars === undefined ? 8 : numBars;
  var segmentsPerBar = 4;
  var segmentGap = 1;
  var barHeight = size / bars;
  var segmentWidth = (size - segmentGap * (segmentsPerBar - 1)) / segmentsPerBar;
  var barIndex;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (barIndex = 0; barIndex < bars; barIndex += 1) {
    var sampleIndex = barIndex * 4;
    var barValue = sampleIndex < data.length ? data[sampleIndex] : 0;
    var litSegments = Math.round((barValue / 255) * segmentsPerBar);
    var barY = barIndex * barHeight;
    var hue = Math.round((barIndex / (bars - 1)) * 120);
    var s;

    for (s = 0; s < litSegments; s += 1) {
      var segX = s * (segmentWidth + segmentGap);
      ctx.fillStyle = 'hsl(' + hue + ', 100%, 45%)';
      ctx.fillRect(segX, barY, segmentWidth, barHeight);
    }
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

    drawVuIcon(vuCanvas16, vuCtx16, 16, freqData, 8);
    drawVuIcon(vuCanvas32, vuCtx32, 32, freqData, 8);

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
  }, 66);
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
