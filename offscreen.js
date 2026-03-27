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

var BAR_HUES = [120, 120, 60, 60, 30, 30, 0, 0];

function drawVuIcon(canvas, ctx, size, data, numBars) {
  var bars = numBars === undefined ? 8 : numBars;
  var gap = 1;
  var barWidth = (size - gap * (bars - 1)) / bars;
  var peak = 0;
  var i, litBars, hue;

  for (i = 0; i < data.length; i += 1) {
    if (data[i] > peak) {
      peak = data[i];
    }
  }

  litBars = Math.round((peak / 255) * bars);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (i = 0; i < bars; i += 1) {
    var x = Math.round(i * (barWidth + gap));
    var bw = Math.round(barWidth);
    hue = BAR_HUES[i];
    if (i < litBars) {
      ctx.fillStyle = 'hsl(' + hue + ', 100%, 50%)';
    } else {
      ctx.fillStyle = 'hsl(' + hue + ', 100%, 11%)';
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
