const MIN_DB = 30;
const MAX_DB = 100;

const els = {
  startButton: document.getElementById("startButton"),
  pauseButton: document.getElementById("pauseButton"),
  dbValue: document.getElementById("dbValue"),
  noiseBar: document.getElementById("noiseBar"),
  thresholdInput: document.getElementById("thresholdInput"),
  thresholdValue: document.getElementById("thresholdValue"),
  thresholdLine: document.getElementById("thresholdLine"),
  levelStatus: document.getElementById("levelStatus"),
  helpText: document.getElementById("helpText"),
  graph: document.getElementById("historyGraph")
};

const graphContext = els.graph.getContext("2d");

let audioContext;
let analyser;
let microphone;
let audioData;
let animationFrame;
let isPaused = false;
let currentDb = null;
let visualDb = null;
let visualTick = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function percentForDb(db) {
  return ((clamp(db, MIN_DB, MAX_DB) - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = els.graph.getBoundingClientRect();
  els.graph.width = Math.max(1, Math.round(rect.width * ratio));
  els.graph.height = Math.max(1, Math.round(rect.height * ratio));
  graphContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawGraph();
}

function threshold() {
  return Number(els.thresholdInput.value);
}

function updateThreshold() {
  const value = threshold();
  els.thresholdValue.textContent = value;
  els.thresholdLine.style.left = `${percentForDb(value)}%`;
  drawGraph();
}

function classifyLevel(db) {
  const limit = threshold();
  if (db > limit) return { label: "Too loud", className: "loud" };
  if (db > limit - 8) return { label: "Getting high", className: "warning" };
  return { label: "Good level", className: "quiet" };
}

function renderLevel(db) {
  const rounded = Math.round(db);
  const state = classifyLevel(rounded);
  currentDb = rounded;
  visualDb = visualDb === null ? rounded : visualDb + (rounded - visualDb) * 0.08;
  els.dbValue.textContent = rounded;
  els.noiseBar.style.width = `${percentForDb(visualDb)}%`;
  els.noiseBar.classList.toggle("warning", state.className === "warning");
  els.noiseBar.classList.toggle("loud", state.className === "loud");
  els.levelStatus.className = `status-pill ${state.className === "quiet" ? "" : state.className}`;
  els.levelStatus.textContent = state.label;
  visualTick += 0.12;
  drawGraph();
}

function drawGraph() {
  const width = els.graph.clientWidth;
  const height = els.graph.clientHeight;
  const padding = 18;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const limitY = height - padding - (percentForDb(threshold()) / 100) * plotHeight;

  graphContext.clearRect(0, 0, width, height);
  graphContext.fillStyle = "#fbfcfa";
  graphContext.fillRect(0, 0, width, height);

  graphContext.strokeStyle = "#d9dfd8";
  graphContext.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    graphContext.beginPath();
    graphContext.moveTo(0, y);
    graphContext.lineTo(width, y);
    graphContext.stroke();
  }

  graphContext.strokeStyle = "#17201c";
  graphContext.setLineDash([7, 7]);
  graphContext.beginPath();
  graphContext.moveTo(0, limitY);
  graphContext.lineTo(width, limitY);
  graphContext.stroke();
  graphContext.setLineDash([]);

  if (currentDb === null) {
    drawIdleBars(padding, plotWidth, height, plotHeight);
    return;
  }

  const barCount = clamp(Math.floor(plotWidth / 16), 18, 44);
  const gap = 5;
  const barWidth = Math.max(7, (plotWidth - gap * (barCount - 1)) / barCount);
  const levelPercent = percentForDb(visualDb ?? currentDb) / 100;
  const state = classifyLevel(currentDb);

  graphContext.fillStyle = state.className === "loud"
    ? "#c84335"
    : state.className === "warning"
      ? "#c77b1e"
      : "#237c5c";

  for (let index = 0; index < barCount; index += 1) {
    const distanceFromCenter = Math.abs(index - (barCount - 1) / 2) / (barCount / 2);
    const centerBoost = 1 - distanceFromCenter * 0.38;
    const pulse = 0.88 + Math.sin(visualTick + index * 0.72) * 0.08 + Math.cos(index * 1.7) * 0.04;
    const normalizedHeight = clamp(levelPercent * centerBoost * pulse, 0.04, 1);
    const barHeight = Math.max(10, normalizedHeight * plotHeight);
    const x = padding + index * (barWidth + gap);
    const y = height - padding - barHeight;
    drawRoundedBar(x, y, barWidth, barHeight, Math.min(5, barWidth / 2));
  }
}

function drawIdleBars(padding, plotWidth, height, plotHeight) {
  const bars = 32;
  const gap = 6;
  const barWidth = (plotWidth - gap * (bars - 1)) / bars;
  graphContext.fillStyle = "rgba(35, 124, 92, 0.18)";

  for (let index = 0; index < bars; index += 1) {
    const wave = 0.32 + Math.sin(index * 0.78) * 0.16 + Math.cos(index * 0.35) * 0.1;
    const barHeight = Math.max(10, plotHeight * wave);
    const x = padding + index * (barWidth + gap);
    const y = height - padding - barHeight;
    drawRoundedBar(x, y, barWidth, barHeight, Math.min(5, barWidth / 2));
  }
}

function drawRoundedBar(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  graphContext.beginPath();
  graphContext.moveTo(x + r, y);
  graphContext.lineTo(x + width - r, y);
  graphContext.quadraticCurveTo(x + width, y, x + width, y + r);
  graphContext.lineTo(x + width, y + height);
  graphContext.lineTo(x, y + height);
  graphContext.lineTo(x, y + r);
  graphContext.quadraticCurveTo(x, y, x + r, y);
  graphContext.closePath();
  graphContext.fill();
}

function estimateDbFromWaveform() {
  analyser.getByteTimeDomainData(audioData);
  let sumSquares = 0;
  for (const sample of audioData) {
    const normalized = (sample - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / audioData.length);
  const db = 20 * Math.log10(rms || 0.00001) + 96;
  return clamp(db, MIN_DB, MAX_DB);
}

function readMicrophone() {
  if (!isPaused) {
    renderLevel(estimateDbFromWaveform());
  }
  animationFrame = requestAnimationFrame(readMicrophone);
}

function updatePauseButton() {
  els.pauseButton.textContent = isPaused ? "Play" : "Pause";
  els.pauseButton.setAttribute("aria-pressed", String(isPaused));
}

async function startMicrophone() {
  isPaused = false;
  updatePauseButton();
  window.cancelAnimationFrame(animationFrame);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    microphone = audioContext.createMediaStreamSource(stream);
    microphone.connect(analyser);
    audioData = new Uint8Array(analyser.fftSize);
    els.startButton.textContent = "Listening";
    els.helpText.textContent = "Move the acceptable noise level slider to set the classroom target.";
    readMicrophone();
  } catch {
    els.helpText.textContent = "Microphone access was blocked or unavailable. Check browser permissions, then try again.";
  }
}

function togglePause() {
  isPaused = !isPaused;
  updatePauseButton();
  els.helpText.textContent = isPaused
    ? "Noise level display paused. Press Play to resume live updates."
    : "Live noise level updates resumed.";
}

els.startButton.addEventListener("click", startMicrophone);
els.pauseButton.addEventListener("click", togglePause);
els.thresholdInput.addEventListener("input", updateThreshold);
window.addEventListener("resize", resizeCanvas);

updatePauseButton();
updateThreshold();
resizeCanvas();
