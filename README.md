<p align="center">
  <br />
  <br />
  <strong>🔊 ChromeVolume</strong>
  <br />
  <em>Clean audio amplification beyond 100% for any Chrome tab.</em>
  <br />
  <br />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-4A90D9?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/size-~16_KB-2ECC71?style=flat-square" alt="~16 KB" />
  <img src="https://img.shields.io/badge/dependencies-zero-F39C12?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/build_step-none-9B59B6?style=flat-square" alt="No Build Step" />
  <img src="https://img.shields.io/badge/license-MIT-E74C3C?style=flat-square" alt="MIT License" />
</p>

---

## 🎯 The Problem

Browser audio is frequently too quiet. Poorly mastered content, quiet streams, noisy environments. Existing volume-booster extensions are bloated, gimmicky, paywalled, and distort.

ChromeVolume is the opposite: a single-purpose tool that amplifies audio cleanly, respects the user, and gets out of the way.

## 🏗️ How It Works

ChromeVolume uses a three-component Manifest V3 architecture to capture tab audio, route it through a mastering-grade signal chain, and output it at up to **200%** volume.

### 🧩 Architecture

```
  🎛️ popup.js          ⚙️ service-worker.js        🔉 offscreen.js
     (UI)        <-->      (orchestrator)      <-->    (audio engine)
                                 │
                          tabCapture API
                                 │
                                 ▼
```

### 🔗 Signal Chain

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   🎤 MediaStreamSource    ← tab audio capture                  │
  │        │                                                        │
  │        ▼                                                        │
  │   📈 GainNode              ← 0–200%, cubic taper               │
  │        │                                                        │
  │        ▼                                                        │
  │   🌊 WaveShaperNode        ← tanh soft clip, 0.95 ceiling, 2×  │
  │        │                                                        │
  │        ▼                                                        │
  │   🧱 DynamicsCompressor    ← −1 dBFS, 20:1, knee 0            │
  │        │                                                        │
  │        ▼                                                        │
  │   📊 AnalyserNode          ← VU meter data, fftSize 64         │
  │        │                                                        │
  │        ▼                                                        │
  │   🔊 destination           ← speakers                          │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

> ⏱️ Total added latency: **~7–9 ms** — imperceptible for media playback.

## 🎶 Why It Sounds Clean

VLC — the gold standard for volume amplification — uses a bare float multiply with **no limiter**. Gain above 100% is unprotected; distortion prevention is delegated entirely to the OS and hardware.

ChromeVolume improves on this with a two-stage protection chain:

| Stage | Node | What it does |
|:---:|:---|:---|
| 🟢 | **Tanh soft clipper** | Gently rounds peaks that would otherwise clip |
| 🔴 | **Brick-wall limiter** | 20:1 ratio at −1 dBFS catches anything the soft clipper misses |

The result: **loud, clean output** with no harsh digital distortion — even at 200%.

The volume curve uses **cubic taper** (`gain = slider³`), the same approach VLC uses. Fine-grained control at low volumes where the ear is most sensitive, and a natural, perceptually smooth ramp to full boost.

## 📦 Install

| Step | Action |
|:---:|:---|
| **1** | 📥 Clone or download this repository |
| **2** | 🌐 Open `chrome://extensions` in Chrome |
| **3** | 🔧 Enable **Developer mode** (top right) |
| **4** | 📂 Click **Load unpacked** and select the project folder |

> 💡 That's it. No build step. No dependencies to install.

## 🎮 Usage

Click the ChromeVolume icon in the toolbar. Audio capture begins automatically on the active tab.

| Input | How |
|:---|:---|
| 🎚️ **Slider** | Drag to set volume anywhere from 0% to 200% |
| ➕ ➖ **Step buttons** | Tap `+` or `−` for precise 5% increments |
| 🖱️ **Mouse wheel** | Scroll up to increase, down to decrease |

The toolbar icon becomes a **live VU meter** while audio is active — 8 bars, 🟢 green through 🟡 yellow to 🔴 red, rendered at **15 fps**. At a glance, you know the boost level and whether you're pushing into the danger zone.

> 🔄 Navigate away or close the tab and everything resets. No state persists. Every stream starts fresh.

## ✨ Features

| | Feature |
|:---:|:---|
| 🔊 | Full-range volume: **0%** (mute) to **200%** (VLC-equivalent ceiling) |
| 🔗 | Three-stage signal chain: gain → soft clip → brick-wall limiter |
| 📊 | Real-time VU meter toolbar icon with silent-frame guard |
| 🛡️ | DRM detection — warns after 2 seconds of silence on protected content |
| 📐 | Cubic taper volume curve for perceptually smooth control |
| 🎛️ | Three input methods: slider, step arrows, mouse wheel |
| 🖥️ | Cross-platform wheel handling with deltaMode normalization & trackpad throttle |
| 🔄 | Popup state recovery on reopen via service worker state sync |
| 🧹 | Graceful stream lifecycle: teardown on navigation, tab close, or track end |

## ⚡ Tech

| | |
|:---|:---|
| 🏷️ **Platform** | Chrome Extension, Manifest V3 |
| 📝 **Language** | Vanilla JavaScript |
| 🏗️ **Framework** | None |
| 🔨 **Build step** | None |
| 📦 **Dependencies** | Zero |
| 🔐 **Permissions** | `tabCapture` · `offscreen` |
| 📁 **Files** | 8 source files + 4 icons |
| 📏 **Total size** | ~16 KB |
| 🖼️ **UI** | HTML / CSS / JS popup |
| 🎧 **Audio engine** | Web Audio API |

## 🗂️ File Map

```
📄 manifest.json        → Extension manifest
⚙️ service-worker.js    → Orchestrator: tab capture, offscreen lifecycle, message relay
📄 offscreen.html       → Minimal shell for audio engine
🔉 offscreen.js         → Audio engine: signal chain, VU meter, DRM detection
🎵 audio.js             → Signal chain factory: soft clipper curve + node wiring
📄 popup.html           → Popup DOM
🎛️ popup.js             → UI logic: slider, step arrows, wheel, state recovery
🎨 popup.css            → Ma-inspired styling
🖼️ icons/               → Static toolbar icons (16, 32, 48, 128 px)
```

## 🪷 Design

The interface follows ***Ma*** — the Japanese concept of negative space. Emptiness is intentional. Every pixel earns its place. The popup is a percentage, a slider, and two buttons floating in deliberate stillness. No gradients, no shadows, no decorative chrome.

> 🎯 A precision instrument, not software.

## 📜 License

**MIT** — free and open source.

---

<p align="center">
  <sub>🎵 Made for people who just want it louder.</sub>
  <br />
  <sub>Built with <a href="https://github.com/Fredasterehub/kiln"><strong>Kiln</strong></a></sub>
</p>
