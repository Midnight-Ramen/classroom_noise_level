const MIN_DB = 30;
const MAX_DB = 100;
const HISTORY_LENGTH = 90;

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
const history = Array.from({ length: HISTORY_LENGTH }, () => null);

let audioContext;
let analyser;
let microphone;
let audioData;
let animationFrame;
let isPaused = false;

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
  els.dbValue.textContent = rounded;
  els.noiseBar.style.width = `${percentForDb(rounded)}%`;
  els.noiseBar.classList.toggle("warning", state.className === "warning");
  els.noiseBar.classList.toggle("loud", state.className === "loud");
  els.levelStatus.className = `status-pill ${state.className === "quiet" ? "" : state.className}`;
  els.levelStatus.textContent = state.label;
  history.push(rounded);
  history.shift();
  drawGraph();
}

function drawGraph() {
  const width = els.graph.clientWidth;
  const height = els.graph.clientHeight;
  const limitY = height - (percentForDb(threshold()) / 100) * height;
  const firstValueIndex = history.findIndex((value) => value !== null);

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

  if (firstValueIndex < 0 || history.filter((value) => value !== null).length < 2) return;

  graphContext.strokeStyle = "#237c5c";
  graphContext.lineWidth = 3;
  graphContext.lineJoin = "round";
  graphContext.lineCap = "round";
  graphContext.beginPath();

  history.forEach((db, index) => {
    if (db === null) return;
    const x = (index / (HISTORY_LENGTH - 1)) * width;
    const y = height - (percentForDb(db) / 100) * height;
    if (index === firstValueIndex) {
      graphContext.moveTo(x, y);
    } else {
      graphContext.lineTo(x, y);
    }
  });
  graphContext.stroke();
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
