let activeState = { tabId: null, gain: 1.0, active: false };

async function resetActionIcon() {
  await chrome.action.setIcon({
    path: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png'
    }
  });
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Tab audio capture and volume control'
    });
  }
}

async function startCapture(tabId) {
  await ensureOffscreenDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  chrome.runtime.sendMessage({ type: 'STREAM_INIT', streamId: streamId });
  activeState.tabId = tabId;
}

async function stopCapture() {
  chrome.runtime.sendMessage({ type: 'CAPTURE_STOP' });
  activeState = { tabId: null, gain: 1.0, active: false };
  await resetActionIcon();
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) {}
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  const senderUrl = sender && sender.url ? sender.url : '';
  const isPopup = senderUrl.indexOf('popup.html') !== -1;
  const isOffscreen = senderUrl.indexOf('offscreen.html') !== -1;

  if (isPopup && msg.type === 'GET_STATE') {
    sendResponse({ type: 'STATE', active: activeState.active, gain: activeState.gain, tabId: activeState.tabId });
    return;
  }

  if (isPopup && msg.type === 'CAPTURE_START') {
    void (async function () {
      if (activeState.active && activeState.tabId === msg.tabId) {
        return;
      }
      if (activeState.active && activeState.tabId !== msg.tabId) {
        await stopCapture();
      }
      await startCapture(msg.tabId);
    })();
  }

  if (isPopup && msg.type === 'SET_GAIN') {
    activeState.gain = msg.gain;
    chrome.runtime.sendMessage({ type: 'SET_GAIN', gain: msg.gain });
  }

  if (isOffscreen && msg.type === 'STREAM_READY') {
    activeState.active = true;
    chrome.runtime.sendMessage({ type: 'STATE', active: true, gain: activeState.gain, tabId: activeState.tabId });
    chrome.runtime.sendMessage({ type: 'SET_GAIN', gain: activeState.gain });
  }

  if (isOffscreen && msg.type === 'STREAM_ERROR') {
    activeState.active = false;
    activeState.tabId = null;
    void resetActionIcon();
    try {
      chrome.offscreen.closeDocument();
    } catch (e) {}
  }

  if (isOffscreen && msg.type === 'STREAM_ENDED') {
    activeState.active = false;
    activeState.tabId = null;
    void resetActionIcon();
    try {
      chrome.offscreen.closeDocument();
    } catch (e) {}
    activeState.gain = 1.0;
  }

  if (isOffscreen && msg.type === 'VU_UPDATE') {
    void chrome.action.setIcon({ imageData: msg.imageData });
  }

  if (isOffscreen && msg.type === 'DRM_WARNING') {
    chrome.runtime.sendMessage({ type: 'DRM_WARNING' });
  }

  return true;
});
