/* ============================================================
   ErgoAI — Lógica de la aplicación (Kesta 2+)
   ------------------------------------------------------------
   Este archivo maneja:
   1. La pantalla de carga (splash)
   2. La conexión con la cámara ESP32-CAM (IP que tú escribes)
   3. La detección de postura con IA (MediaPipe Pose), corriendo
      directo en tu navegador — no hay servidor externo.
   4. El cálculo REAL de racha / progreso, guardado en este
      navegador (localStorage). Si limpias los datos del navegador
      o usas otra computadora, se reinicia — es una limitación
      honesta de esta primera versión sin servidor propio.
   5. Pintar todo eso en la interfaz.

   NOTA PARA JOHEL: este archivo se escribió sin poder probarlo
   contra tu ESP32-CAM real. La arquitectura es correcta y es la
   misma que usan tutoriales reales de MediaPipe + ESP32-CAM, pero
   revisa el mensaje que te dejé en el chat para el checklist de
   prueba y los puntos donde algo podría necesitar un ajuste.
   ============================================================ */

(() => {
  'use strict';

  // ---------- Elementos del DOM ----------
  const splash = document.getElementById('splash');
  const app = document.getElementById('app');
  const statusCard = document.getElementById('statusCard');
  const statusValueEl = document.getElementById('statusValue');
  const statusSubEl = document.getElementById('statusSub');
  const statusIconEl = statusCard.querySelector('.status-icon');
  const cameraPill = document.getElementById('cameraPill');
  const cameraPillText = cameraPill.querySelector('.pill-text');
  const demoBtn = document.getElementById('demoToggle');

  const cameraSetup = document.getElementById('cameraSetup');
  const cameraSourceTabs = document.getElementById('cameraSourceTabs');
  const webcamPanel = document.getElementById('webcamPanel');
  const esp32Panel = document.getElementById('esp32Panel');
  const webcamConnectBtn = document.getElementById('webcamConnectBtn');
  const webcamVideo = document.getElementById('webcamVideo');
  const cameraForm = document.getElementById('cameraForm');
  const cameraIpInput = document.getElementById('cameraIpInput');
  const cameraError = document.getElementById('cameraError');
  const cameraStreamImg = document.getElementById('cameraStream');
  const poseCanvas = document.getElementById('poseCanvas');
  const poseCtx = poseCanvas.getContext('2d');
  const changeIpBtn = document.getElementById('changeIpBtn');
  const calibrateRow = document.getElementById('calibrateRow');
  const calibrateBtn = document.getElementById('calibrateBtn');
  const calibrateStatus = document.getElementById('calibrateStatus');

  const ringProgress = document.getElementById('ringProgress');
  const ringValueEl = document.getElementById('ringValue');
  const streakDaysEl = document.getElementById('streakDays');
  const recordTodayEl = document.getElementById('recordToday');
  const recordHistoricEl = document.getElementById('recordHistoric');
  const weekRow = document.getElementById('weekRow');

  // ============================================================
  // Utilidades pequeñas y reutilizables
  // ============================================================
  function todayKey(date = new Date()) {
    // "2026-08-05" — usamos la fecha LOCAL, no UTC, para que el día
    // cambie a medianoche de tu zona horaria, no la de Greenwich.
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function crossfadeText(el, newText) {
    el.style.transition = 'opacity .18s ease';
    el.style.opacity = 0;
    setTimeout(() => {
      el.textContent = newText;
      el.style.opacity = 1;
    }, 180);
  }

  function popIcon(el, newEmoji) {
    el.classList.remove('icon-pop');
    el.textContent = newEmoji;
    void el.offsetWidth; // fuerza al navegador a "notar" el reinicio de la animación
    el.classList.add('icon-pop');
  }

  function animateValue(el, end, duration, suffix = '') {
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
      el.textContent = Math.round(end * eased) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const RING_RADIUS = 70;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;

  function setRingPercent(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - clamped / 100)}`;
  }

  // ============================================================
  // 1. PANTALLA DE CARGA
  // ============================================================
  const MIN_SPLASH_MS = 1100;
  const loadStart = performance.now();

  function reveal() {
    const wait = Math.max(MIN_SPLASH_MS - (performance.now() - loadStart), 0);
    setTimeout(() => {
      splash.classList.add('splash--hide');
      app.classList.add('app--visible');
      renderFromStorage(); // pinta los datos guardados (reales) apenas aparece
    }, wait);
  }
  if (document.readyState === 'complete') reveal();
  else window.addEventListener('load', reveal);

  // ============================================================
  // 2. HISTORIAL Y RACHA REAL (guardado en localStorage)
  // ============================================================
  const STORAGE_KEY = 'ergoai_history_v1';

  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveHistory(hist) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
  }

  let history = loadHistory();
  let currentStreakSeconds = 0; // racha actual sin cortes de mala postura

  function ensureToday() {
    const key = todayKey();
    if (!history[key]) {
      history[key] = { goodSeconds: 0, totalSeconds: 0, bestStreakSeconds: 0 };
    }
    return history[key];
  }

  // Se llama una vez por segundo mientras la cámara está conectada
  function recordSample(isGood) {
    const day = ensureToday();
    day.totalSeconds += 1;
    if (isGood) {
      day.goodSeconds += 1;
      currentStreakSeconds += 1;
      if (currentStreakSeconds > day.bestStreakSeconds) {
        day.bestStreakSeconds = currentStreakSeconds;
      }
    } else {
      currentStreakSeconds = 0;
    }
    saveHistory(history);
    renderFromStorage();
  }

  // Un día cuenta como "bueno" si al menos el 50% del tiempo medido fue buena postura
  function isGoodDay(day) {
    return !!day && day.totalSeconds > 0 && day.goodSeconds / day.totalSeconds >= 0.5;
  }

  function consecutiveGoodDays() {
    let count = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const key = todayKey(cursor);
      if (!isGoodDay(history[key])) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function bestHistoricStreakDays() {
    const keys = Object.keys(history).sort();
    let best = 0, run = 0, prevDate = null;
    keys.forEach((key) => {
      const date = new Date(key);
      if (isGoodDay(history[key])) {
        run = prevDate && date - prevDate === 86400000 ? run + 1 : 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
      prevDate = date;
    });
    return best;
  }

  function renderFromStorage() {
    const day = ensureToday();
    const percentToday = day.totalSeconds > 0 ? Math.round((day.goodSeconds / day.totalSeconds) * 100) : 0;

    setRingPercent(percentToday);
    animateValue(ringValueEl, percentToday, 900, '%');
    animateValue(recordTodayEl, Math.round(day.bestStreakSeconds / 60), 700, ' min');
    animateValue(recordHistoricEl, bestHistoricStreakDays(), 700, ' días');
    streakDaysEl.textContent = consecutiveGoodDays();

    renderWeekRow();
  }

  function renderWeekRow() {
    weekRow.innerHTML = '';
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayLetters = ['D', 'L', 'M', 'M', 'J', 'V', 'S']; // Date.getDay(): 0 = domingo
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // lunes de esta semana

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = todayKey(d);
      const day = history[key];
      const isFuture = key > todayKey(today);

      const pill = document.createElement('div');
      pill.className = 'day-pill';
      const letter = dayLetters[d.getDay()];
      const name = dayNames[d.getDay()];

      if (isFuture || !day || day.totalSeconds === 0) {
        pill.classList.add('empty');
        pill.title = `${name}: sin datos todavía`;
        pill.textContent = letter;
      } else {
        const ratio = day.goodSeconds / day.totalSeconds;
        const good = ratio >= 0.5;
        pill.classList.add(good ? 'good' : 'bad');
        pill.title = `${name}: ${Math.round(ratio * 100)}% en buena postura`;
        pill.innerHTML = `<span class="day-icon">${good ? '✓' : '✕'}</span>${letter}`;
      }
      weekRow.appendChild(pill);
    }
  }

  // ============================================================
  // 3. TARJETA DE ESTADO — la actualizan o el botón demo (sin
  //    cámara) o la IA en vivo (con cámara conectada)
  // ============================================================
  let demoMalaPostura = false;
  let cameraConnected = false;

  function applyStatus(isGood) {
    statusCard.classList.toggle('bad', !isGood);
    crossfadeText(statusValueEl, isGood ? 'Buena Postura' : 'Mala Postura');
    crossfadeText(statusSubEl, isGood
      ? 'Sigue así, tu espalda te lo agradece'
      : 'Endereza tu espalda, ¡tú puedes!');
    popIcon(statusIconEl, isGood ? '🧍' : '🙇');
  }

  demoBtn.addEventListener('click', () => {
    if (cameraConnected) return; // con cámara real, el botón demo ya no manda
    demoMalaPostura = !demoMalaPostura;
    applyStatus(!demoMalaPostura);
    demoBtn.textContent = demoMalaPostura
      ? '👁️ Vista previa: Buena Postura'
      : '👁️ Vista previa: Mala Postura';
  });

  // ---------- Brillo que sigue al cursor en las tarjetas grandes ----------
  function attachCursorGlow(el) {
    if (!el) return;
    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    });
  }
  attachCursorGlow(statusCard);
  attachCursorGlow(document.getElementById('streakModule'));

  // ============================================================
  // 4. CONEXIÓN CON LA CÁMARA (cualquier dispositivo) + IA
  // ============================================================
  const IP_STORAGE_KEY = 'ergoai_camera_ip';
  const CALIBRATION_KEY = 'ergoai_calibrated_angle';
  const CALIBRATION_MS = 3000; // cuánto dura la calibración
  const CALIBRATION_MARGIN = 12; // grados de margen sobre TU ángulo calibrado
  // Se usa solo si nunca has calibrado — un número genérico de partida.
  const DEFAULT_ANGLE_THRESHOLD = 20;
  // Cuántos cuadros seguidos se necesitan para confirmar un cambio de
  // estado — evita que la tarjeta "parpadee" por un movimiento de un instante.
  const DEBOUNCE_FRAMES = 8;

  let pose = null;
  let poseLoopRunning = false;
  let goodStreakFrames = 0;
  let badStreakFrames = 0;
  let confirmedGood = true;
  let secondTickInterval = null;
  let webcamStream = null;
  let activeSource = null; // { el: <video>|<img>, type: 'webcam' | 'esp32' }
  let calibratedAngle = parseFloat(localStorage.getItem(CALIBRATION_KEY)) || null;
  let calibrating = false;
  let calibrationSamples = [];

  if (calibratedAngle) {
    calibrateStatus.textContent = `Calibrada: ${calibratedAngle.toFixed(0)}° de referencia`;
  }

  function showCameraError(msg) {
    cameraError.textContent = msg;
    cameraError.hidden = false;
  }
  function hideCameraError() {
    cameraError.hidden = true;
  }

  function setCameraPillState(connected, sourceType) {
    cameraConnected = connected;
    cameraPill.classList.toggle('connected', connected);
    cameraPillText.textContent = connected
      ? (sourceType === 'webcam' ? 'Cámara del dispositivo conectada' : 'ESP32-CAM conectada')
      : 'Cámara desconectada';
    demoBtn.style.display = connected ? 'none' : '';
  }

  // ---------- Pestañas: elegir de dónde viene el video ----------
  cameraSourceTabs.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.source-tab');
    if (!tabBtn) return;
    cameraSourceTabs.querySelectorAll('.source-tab').forEach((t) => t.classList.remove('active'));
    tabBtn.classList.add('active');
    const source = tabBtn.dataset.source;
    webcamPanel.hidden = source !== 'webcam';
    esp32Panel.hidden = source !== 'esp32';
    hideCameraError();
  });

  // ---------- Opción A: cámara de este dispositivo (funciona ahora mismo,
  //            sin necesitar la ESP32-CAM — sirve para probar que la IA
  //            de verdad reconoce tu postura) ----------
  webcamConnectBtn.addEventListener('click', async () => {
    hideCameraError();
    webcamConnectBtn.disabled = true;
    webcamConnectBtn.textContent = 'Pidiendo permiso…';
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      webcamVideo.srcObject = webcamStream;
      await webcamVideo.play();
      onCameraConnected({ el: webcamVideo, type: 'webcam' });
    } catch (err) {
      const msg = err && err.name === 'NotAllowedError'
        ? 'Le negaste el permiso de cámara al navegador. Dale clic al ícono de cámara/candado en la barra de direcciones para permitirlo, y vuelve a intentar.'
        : 'No se pudo activar la cámara de este dispositivo (¿otra aplicación la está usando?).';
      showCameraError(msg);
    } finally {
      webcamConnectBtn.disabled = false;
      webcamConnectBtn.textContent = 'Activar cámara';
    }
  });

  // ---------- Opción B: ESP32-CAM por WiFi ----------
  const savedIp = localStorage.getItem(IP_STORAGE_KEY);
  if (savedIp) cameraIpInput.value = savedIp;

  cameraForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ip = cameraIpInput.value.trim();
    if (!ip) return;
    connectEsp32(ip);
  });

  function connectEsp32(ip) {
    hideCameraError();
    localStorage.setItem(IP_STORAGE_KEY, ip);
    cameraStreamImg.crossOrigin = 'anonymous';
    cameraStreamImg.onload = () => onCameraConnected({ el: cameraStreamImg, type: 'esp32' });
    cameraStreamImg.onerror = () => {
      showCameraError('No se pudo conectar. Revisa que la ESP32-CAM esté encendida, en la misma red WiFi, y que la IP sea correcta.');
    };
    // Se agrega "?t=" para evitar que el navegador reutilice una conexión vieja
    cameraStreamImg.src = `http://${ip}/?t=${Date.now()}`;
  }

  // ---------- Desconectar (sirve para cualquiera de las dos fuentes) ----------
  changeIpBtn.addEventListener('click', disconnectCamera);

  function disconnectCamera() {
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    cameraStreamImg.src = '';
    activeSource = null;
    setCameraPillState(false);
    cameraSetup.classList.remove('is-connected');
    poseCanvas.hidden = true;
    changeIpBtn.hidden = true;
    calibrateRow.hidden = true;
  }

  function onCameraConnected(source) {
    activeSource = source;
    setCameraPillState(true, source.type);
    cameraSetup.classList.add('is-connected');
    poseCanvas.hidden = false;
    changeIpBtn.hidden = false;
    calibrateRow.hidden = false;

    if (!secondTickInterval) {
      secondTickInterval = setInterval(() => {
        if (cameraConnected) recordSample(confirmedGood);
      }, 1000);
    }

    initPoseIfNeeded();
    if (!poseLoopRunning) {
      poseLoopRunning = true;
      requestAnimationFrame(poseLoop);
    }
  }

  function initPoseIfNeeded() {
    if (pose) return;
    if (typeof Pose === 'undefined') {
      showCameraError('No se pudo cargar el motor de IA (MediaPipe). Revisa tu conexión a internet y recarga la página.');
      return;
    }
    pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onPoseResults);
  }

  // Funciona igual sin importar si la fuente es la webcam (<video>) o la
  // ESP32-CAM (<img>) — así el mismo pipeline sirve para "cualquier dispositivo".
  function sourceHasFrame() {
    if (!activeSource) return false;
    const el = activeSource.el;
    return activeSource.type === 'webcam' ? el.readyState >= 2 : !!el.naturalWidth;
  }

  function poseLoop() {
    requestAnimationFrame(poseLoop);
    if (!cameraConnected || !pose || !sourceHasFrame()) return;
    pose.send({ image: activeSource.el }).catch(() => {
      // Si un cuadro falla lo saltamos, no interrumpimos el ciclo completo
    });
  }

  // ---------- Calibración: que la IA aprenda TU buena postura ----------
  calibrateBtn.addEventListener('click', () => {
    if (calibrating) return;
    calibrating = true;
    calibrationSamples = [];
    calibrateBtn.disabled = true;
    const startTime = performance.now();

    function tickCountdown() {
      const remaining = CALIBRATION_MS - (performance.now() - startTime);
      if (remaining > 0) {
        calibrateStatus.textContent = `Mantén una buena postura… ${Math.ceil(remaining / 1000)}s`;
        requestAnimationFrame(tickCountdown);
      }
    }
    tickCountdown();
    setTimeout(finishCalibration, CALIBRATION_MS);
  });

  function finishCalibration() {
    calibrating = false;
    calibrateBtn.disabled = false;
    if (calibrationSamples.length < 5) {
      calibrateStatus.textContent = 'No detecté suficiente cuerpo — acércate a la cámara o mejora la luz, e intenta de nuevo.';
      return;
    }
    const avg = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length;
    calibratedAngle = avg;
    localStorage.setItem(CALIBRATION_KEY, avg.toFixed(2));
    calibrateStatus.textContent = `Calibrada: ${avg.toFixed(0)}° de referencia`;
  }

  function currentThreshold() {
    return calibratedAngle !== null ? calibratedAngle + CALIBRATION_MARGIN : DEFAULT_ANGLE_THRESHOLD;
  }

  function onPoseResults(results) {
    // Dibuja la vista previa con el esqueleto detectado encima
    poseCtx.save();
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    poseCtx.drawImage(results.image, 0, 0, poseCanvas.width, poseCanvas.height);
    if (results.poseLandmarks && window.drawConnectors) {
      drawConnectors(poseCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#16c9c9', lineWidth: 2 });
      drawLandmarks(poseCtx, results.poseLandmarks, { color: '#ff7a29', radius: 2 });
    }
    poseCtx.restore();

    if (!results.poseLandmarks) return;

    const angleDeg = computeNeckAngle(results.poseLandmarks);
    if (calibrating) calibrationSamples.push(angleDeg);

    const isGoodFrame = angleDeg <= currentThreshold();

    if (isGoodFrame) {
      goodStreakFrames += 1;
      badStreakFrames = 0;
    } else {
      badStreakFrames += 1;
      goodStreakFrames = 0;
    }

    if (isGoodFrame && !confirmedGood && goodStreakFrames >= DEBOUNCE_FRAMES) {
      confirmedGood = true;
      applyStatus(true);
    } else if (!isGoodFrame && confirmedGood && badStreakFrames >= DEBOUNCE_FRAMES) {
      confirmedGood = false;
      applyStatus(false);
    }
  }

  // Landmarks de MediaPipe Pose: 7/8 = orejas, 11/12 = hombros.
  // Ángulo entre oreja y hombro respecto a la vertical: 0° = cabeza justo
  // encima del hombro (perfecto); entre más grande, más se inclina hacia adelante.
  function computeNeckAngle(landmarks) {
    const leftEar = landmarks[7], rightEar = landmarks[8];
    const leftShoulder = landmarks[11], rightShoulder = landmarks[12];

    const leftScore = (leftEar.visibility || 0) + (leftShoulder.visibility || 0);
    const rightScore = (rightEar.visibility || 0) + (rightShoulder.visibility || 0);
    const [ear, shoulder] = leftScore >= rightScore ? [leftEar, leftShoulder] : [rightEar, rightShoulder];

    const dx = Math.abs(ear.x - shoulder.x);
    const dy = Math.abs(shoulder.y - ear.y);
    return Math.atan2(dx, dy) * (180 / Math.PI);
  }
})();
