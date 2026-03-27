function makeTanhSoftClip(ceiling, nSamples) {
  var resolvedCeiling = ceiling === undefined ? 0.95 : ceiling;
  var resolvedSamples = nSamples === undefined ? 512 : nSamples;
  var curve = new Float32Array(resolvedSamples);
  var i;

  for (i = 0; i < resolvedSamples; i += 1) {
    var x = (i * 2) / resolvedSamples - 1;
    curve[i] = Math.tanh(x * 3) * resolvedCeiling;
  }

  return curve;
}

function createSignalChain(audioCtx) {
  var gainNode = audioCtx.createGain();
  var softClipper = audioCtx.createWaveShaper();
  var limiter = audioCtx.createDynamicsCompressor();
  var analyser = audioCtx.createAnalyser();

  gainNode.gain.value = 1.0;

  softClipper.curve = makeTanhSoftClip(0.95, 512);
  softClipper.oversample = '2x';

  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  analyser.fftSize = 64;

  gainNode.connect(softClipper);
  softClipper.connect(limiter);
  limiter.connect(analyser);

  return { gainNode: gainNode, softClipper: softClipper, limiter: limiter, analyser: analyser };
}
