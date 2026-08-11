/* ============================================================
   ErgoAI — Lógica de la aplicación (Kesta 6)
   ------------------------------------------------------------
   Este archivo maneja:
   1. La pantalla de carga (splash)
   2. La conexión con la cámara del propio dispositivo (compu,
      tablet o celular) vía getUserMedia — sin IPs ni redes WiFi
      que configurar, funciona para cualquier persona.
   3. La detección de postura con IA (MediaPipe Pose), corriendo
      directo en tu navegador — no hay servidor externo.
   4. El cálculo REAL de racha / progreso, guardado en este
      navegador (localStorage). Si limpias los datos del navegador
      o usas otra computadora, se reinicia — es una limitación
      honesta de esta versión sin servidor propio.
   5. Pintar todo eso en la interfaz.
   6. La alerta física opcional: buzzer + luz LED en una placa
      aparte (IdeaBoard), conectada por cable USB vía Web Serial.
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
  const webcamPanel = document.getElementById('webcamPanel');
  const webcamConnectBtn = document.getElementById('webcamConnectBtn');
  const webcamVideo = document.getElementById('webcamVideo');
  const cameraError = document.getElementById('cameraError');
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

  // ---------- Kesta 4: notificaciones, historial, modo presentación ----------
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const alertsToggle = document.getElementById('alertsToggle');
  const breaksToggle = document.getElementById('breaksToggle');
  const presentationBtn = document.getElementById('presentationBtn');
  const exitPresentationBtn = document.getElementById('exitPresentationBtn');
  const barChart = document.getElementById('barChart');
  const historyTableToggle = document.getElementById('historyTableToggle');
  const historyTable = document.getElementById('historyTable');
  const historyTableBody = document.getElementById('historyTableBody');

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

  // Guarda/lee de localStorage sin romper la página si el navegador lo
  // bloquea (pasa en modo privado de algunos navegadores, o con ciertas
  // configuraciones de cookies/privacidad) — así "cualquier persona en
  // cualquier dispositivo" puede usar la app aunque no guarde su progreso.
  function safeGetItem(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSetItem(key, value) {
    try { localStorage.setItem(key, value); } catch { /* seguimos sin guardar */ }
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
      return JSON.parse(safeGetItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveHistory(hist) {
    safeSetItem(STORAGE_KEY, JSON.stringify(hist));
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
    trackBadPostureAlert(isGood);
    syncHardwareState(isGood);
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
    renderHistoryChart();
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
  const CALIBRATION_KEY = 'ergoai_calibrated_angle';
  const CALIBRATION_MS = 3000; // cuánto dura la calibración
  const CALIBRATION_MARGIN = 12; // grados de margen sobre TU ángulo calibrado
  // Se usa solo si nunca has calibrado — un número genérico de partida.
  const DEFAULT_ANGLE_THRESHOLD = 20;
  // Cuántos cuadros seguidos se necesitan para confirmar un cambio de
  // estado — evita que la tarjeta "parpadee" por un movimiento de un instante.
  const DEBOUNCE_FRAMES = 8;

  let pose = null;
  let mpCamera = null; // instancia de la utilidad oficial @mediapipe/camera_utils
  let previewLoopRunning = false;
  let lastLandmarks = null; // últimos puntos del cuerpo que sí llegaron de la IA
  let gotFirstPoseResult = false;
  let poseWarnTimeoutId = null;
  let goodStreakFrames = 0;
  let badStreakFrames = 0;
  let confirmedGood = true;
  let secondTickInterval = null;
  let webcamStream = null;
  let calibratedAngle = parseFloat(safeGetItem(CALIBRATION_KEY)) || null;
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

  function setCameraPillState(connected) {
    cameraConnected = connected;
    cameraPill.classList.toggle('connected', connected);
    cameraPillText.textContent = connected ? 'Cámara del dispositivo conectada' : 'Cámara desconectada';
    demoBtn.style.display = connected ? 'none' : '';
  }

  // ---------- Cámara de este dispositivo: compu, tablet o celular ----------
  // Un solo camino para todos — sin IPs, sin redes WiFi que configurar.
  // getUserMedia necesita "contexto seguro" (https:// o localhost), que es
  // justo como sirve GitHub Pages, así que funciona para cualquier persona
  // que abra el link, en cualquier dispositivo con cámara.
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
      onCameraConnected();
    } catch (err) {
      let msg = 'No se pudo activar la cámara de este dispositivo (¿otra aplicación la está usando?).';
      if (err && err.name === 'NotAllowedError') {
        msg = 'Le negaste el permiso de cámara al navegador. Dale clic al ícono de cámara/candado en la barra de direcciones para permitirlo, y vuelve a intentar.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'No encontramos ninguna cámara en este dispositivo.';
      } else if (!window.isSecureContext) {
        // getUserMedia solo funciona en https:// o localhost — este es el
        // error más común si alguien abre la app desde un http:// normal.
        msg = 'Por seguridad, los navegadores solo permiten usar la cámara en páginas https:// (o localhost). Abre el link público (https://…) en vez de una copia local por http://.';
      }
      showCameraError(msg);
    } finally {
      webcamConnectBtn.disabled = false;
      webcamConnectBtn.textContent = 'Activar cámara';
    }
  });

  // ---------- Desconectar ----------
  changeIpBtn.addEventListener('click', disconnectCamera);

  function disconnectCamera() {
    if (webcamStream) {
      webcamStream.getTracks().forEach((t) => t.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    setCameraPillState(false);
    cameraSetup.classList.remove('is-connected');
    poseCanvas.hidden = true;
    changeIpBtn.hidden = true;
    calibrateRow.hidden = true;

    // Arreglo: antes, al desconectar y reconectar la cámara, quedaban
    // contadores "a medias" de la sesión anterior (el intervalo de conteo
    // seguía corriendo en el fondo, la calibración podía quedar trabada
    // si desconectabas a medio conteo, y las alertas arrastraban tiempo
    // viejo). Ahora se reinicia todo limpio cada vez.
    if (secondTickInterval) {
      clearInterval(secondTickInterval);
      secondTickInterval = null;
    }
    if (mpCamera) {
      mpCamera.stop();
      mpCamera = null;
    }
    if (poseWarnTimeoutId) {
      clearTimeout(poseWarnTimeoutId);
      poseWarnTimeoutId = null;
    }
    lastLandmarks = null;
    gotFirstPoseResult = false;
    goodStreakFrames = 0;
    badStreakFrames = 0;
    badPostureSeconds = 0;
    secondsSinceLastAlert = 0;
    calibrating = false;
    calibrateBtn.disabled = false;

    sendHwCommand('OFF');
  }

  function onCameraConnected() {
    setCameraPillState(true);
    cameraSetup.classList.add('is-connected');
    poseCanvas.hidden = false;
    changeIpBtn.hidden = false;
    calibrateRow.hidden = false;

    if (!secondTickInterval) {
      secondTickInterval = setInterval(() => {
        if (cameraConnected) recordSample(confirmedGood);
      }, 1000);
    }

    // Arreglo clave: dibujar la vista previa YA NO depende de que la IA
    // responda (antes, drawPreview vivía adentro de onPoseResults, así
    // que si la IA se atoraba, el recuadro se quedaba en negro para
    // siempre, aunque la cámara sí estuviera funcionando). Ahora este
    // ciclo dibuja el video en cada cuadro sin importar la IA, y encima
    // superpone el esqueleto solo cuando SÍ hay resultados recientes.
    if (!previewLoopRunning) {
      previewLoopRunning = true;
      requestAnimationFrame(drawPreview);
    }

    initPoseIfNeeded();
    startPoseProcessing();

    // Si en unos segundos la IA no ha respondido ni una sola vez, avisa
    // — la cámara se sigue viendo gracias a drawPreview, pero así sabes
    // que la detección automática todavía no está activa.
    gotFirstPoseResult = false;
    poseWarnTimeoutId = setTimeout(() => {
      if (!gotFirstPoseResult && cameraConnected) {
        showCameraError('La cámara funciona, pero la IA todavía no detecta tu cuerpo. Asegúrate de verte de frente, con buena luz y de la cintura para arriba. Si el problema sigue, recarga la página (puede ser tu conexión a internet).');
      }
    }, 7000);

    // Si la placa del buzzer ya estaba conectada, avísale el estado actual
    // de una vez (en vez de esperar hasta 1 segundo al primer tick)
    syncHardwareState(confirmedGood);
  }

  function initPoseIfNeeded() {
    if (pose) return;
    if (typeof Pose === 'undefined') {
      showCameraError('No se pudo cargar el motor de IA (MediaPipe). Revisa tu conexión a internet y recarga la página.');
      return;
    }
    pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onPoseResults);
  }

  // Le manda cuadros de video a la IA. Usa la utilidad oficial de MediaPipe
  // (Camera), que espera a que termine de procesar un cuadro antes de
  // mandar el siguiente. Arreglo: antes mandábamos un cuadro nuevo en
  // CADA frame de pantalla (hasta 60 veces por segundo) sin esperar a que
  // la IA terminara con el anterior — eso hacía que se acumularan cuadros
  // sin procesar y la IA se quedara "atorada" sin volver a responder
  // nunca, con la cámara pareciendo conectada pero sin hacer nada.
  function startPoseProcessing() {
    if (!pose || mpCamera) return;
    if (typeof Camera === 'undefined') {
      showCameraError('No se pudo cargar una pieza del motor de IA (camera_utils). Revisa tu conexión a internet y recarga la página.');
      return;
    }
    mpCamera = new Camera(webcamVideo, {
      onFrame: async () => {
        if (pose) await pose.send({ image: webcamVideo });
      },
      width: 320,
      height: 240,
    });
    mpCamera.start();
  }

  // Dibuja la cámara en el recuadro en cada cuadro de pantalla — siempre,
  // sin importar si la IA ya respondió o no — y encima el esqueleto, si
  // ya tenemos puntos detectados recientes.
  function drawPreview() {
    requestAnimationFrame(drawPreview);
    if (!cameraConnected || webcamVideo.readyState < 2) return;
    poseCtx.save();
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    poseCtx.drawImage(webcamVideo, 0, 0, poseCanvas.width, poseCanvas.height);
    if (lastLandmarks && window.drawConnectors) {
      drawConnectors(poseCtx, lastLandmarks, POSE_CONNECTIONS, { color: '#16c9c9', lineWidth: 2 });
      drawLandmarks(poseCtx, lastLandmarks, { color: '#ff7a29', radius: 2 });
    }
    poseCtx.restore();
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
    safeSetItem(CALIBRATION_KEY, avg.toFixed(2));
    calibrateStatus.textContent = `Calibrada: ${avg.toFixed(0)}° de referencia`;
  }

  function currentThreshold() {
    return calibratedAngle !== null ? calibratedAngle + CALIBRATION_MARGIN : DEFAULT_ANGLE_THRESHOLD;
  }

  function onPoseResults(results) {
    // Ya NO dibuja aquí (eso lo hace drawPreview, en cada cuadro de
    // pantalla, sin depender de esto) — esta función solo guarda los
    // puntos del cuerpo más recientes y decide buena/mala postura.
    if (!gotFirstPoseResult) {
      gotFirstPoseResult = true;
      hideCameraError(); // por si alcanzó a mostrarse el aviso de "la IA no responde"
    }
    lastLandmarks = results.poseLandmarks || null;

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

  // ============================================================
  // 5. NOTIFICACIONES (Kesta 4): alertas de mala postura +
  //    recordatorios de pausas activas. Ambas se pueden apagar
  //    desde el botón 🔔 del encabezado.
  // ============================================================
  const ALERTS_KEY = 'ergoai_alerts_enabled';
  const BREAKS_KEY = 'ergoai_breaks_enabled';
  const BAD_POSTURE_ALERT_SECONDS = 20; // cuánto tiempo seguido en mala postura antes de avisar
  const BAD_POSTURE_REPEAT_SECONDS = 30; // cada cuánto insiste, si sigues en mala postura
  const BREAK_REMINDER_MS = 30 * 60 * 1000; // cada 30 minutos

  let badPostureSeconds = 0;
  let secondsSinceLastAlert = 0;

  // Recuerda tu preferencia entre visitas
  alertsToggle.checked = safeGetItem(ALERTS_KEY) !== 'false';
  breaksToggle.checked = safeGetItem(BREAKS_KEY) !== 'false';
  alertsToggle.addEventListener('change', () => {
    safeSetItem(ALERTS_KEY, alertsToggle.checked);
  });
  breaksToggle.addEventListener('change', () => {
    safeSetItem(BREAKS_KEY, breaksToggle.checked);
  });

  // Abrir/cerrar el panel de notificaciones
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !settingsPanel.hidden;
    settingsPanel.hidden = isOpen;
    settingsBtn.setAttribute('aria-expanded', String(!isOpen));
  });
  document.addEventListener('click', (e) => {
    if (!settingsPanel.hidden && !e.target.closest('.settings-wrap')) {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Un "beep" generado con Web Audio — no necesita ningún archivo de sonido
  function playTone(freq, durationMs) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // Si el navegador bloquea el audio (por ejemplo, sin interacción previa
      // del usuario todavía), simplemente no suena — no rompemos nada más.
    }
  }

  let notifPermissionAsked = false;
  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'assets/favicon.svg' });
    } else if (Notification.permission !== 'denied' && !notifPermissionAsked) {
      notifPermissionAsked = true;
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') new Notification(title, { body, icon: 'assets/favicon.svg' });
      });
    }
  }

  // Se llama una vez por segundo (desde recordSample) mientras hay cámara conectada
  function trackBadPostureAlert(isGood) {
    if (isGood) {
      badPostureSeconds = 0;
      secondsSinceLastAlert = 0;
      return;
    }
    badPostureSeconds += 1;
    secondsSinceLastAlert += 1;

    if (!alertsToggle.checked) return;

    const dueForFirstAlert = badPostureSeconds === BAD_POSTURE_ALERT_SECONDS;
    const dueForRepeat = badPostureSeconds > BAD_POSTURE_ALERT_SECONDS && secondsSinceLastAlert >= BAD_POSTURE_REPEAT_SECONDS;

    if (dueForFirstAlert || dueForRepeat) {
      secondsSinceLastAlert = 0;
      playTone(320, 350);
      notify('¡Corrige tu postura! 🧍', 'Llevas un rato encorvado — endereza la espalda.');
    }
  }

  // ---------- Recordatorios de pausas activas (independiente de la cámara) ----------
  setInterval(() => {
    if (!breaksToggle.checked) return;
    playTone(520, 250);
    notify('Hora de una pausa 🧘', 'Levántate, estírate y descansa la vista un momento.');
  }, BREAK_REMINDER_MS);

  // ============================================================
  // 6. MODO PRESENTACIÓN (para mostrarle el proyecto a los jueces)
  // ============================================================
  function setPresentationMode(on) {
    document.body.classList.toggle('presentation-mode', on);
    exitPresentationBtn.hidden = !on;
    if (on && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Si el navegador no deja pantalla completa, seguimos igual en modo
        // presentación, solo sin ocupar toda la pantalla física.
      });
    } else if (!on && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  presentationBtn.addEventListener('click', () => setPresentationMode(true));
  exitPresentationBtn.addEventListener('click', () => setPresentationMode(false));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) setPresentationMode(false);
  });

  // ============================================================
  // 7. HISTORIAL CON GRÁFICA DE BARRAS (últimos 7 días reales)
  // ============================================================
  function last7Days() {
    const days = [];
    const cursor = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() - i);
      days.push(d);
    }
    return days;
  }

  function renderHistoryChart() {
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const shortNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const days = last7Days();
    const today = todayKey();

    barChart.innerHTML = '';
    historyTableBody.innerHTML = '';

    days.forEach((d) => {
      const key = todayKey(d);
      const day = history[key];
      const hasData = !!day && day.totalSeconds > 0;
      const percent = hasData ? Math.round((day.goodSeconds / day.totalSeconds) * 100) : 0;
      const label = shortNames[d.getDay()];
      const fullName = dayNames[d.getDay()];
      const isToday = key === today;

      // --- barra ---
      const col = document.createElement('div');
      col.className = 'bar-col' + (isToday ? ' is-today' : '') + (hasData ? '' : ' no-data');
      col.title = hasData ? `${fullName}: ${percent}% en buena postura` : `${fullName}: sin datos`;

      const value = document.createElement('span');
      value.className = 'bar-value';
      value.textContent = hasData ? `${percent}%` : '–';

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.height = hasData ? `${Math.max(percent, 3)}%` : '0%';
      track.appendChild(fill);

      const labelEl = document.createElement('span');
      labelEl.className = 'bar-label';
      labelEl.textContent = label;

      col.append(value, track, labelEl);
      barChart.appendChild(col);

      // --- fila de la tabla (misma información, accesible) ---
      const row = document.createElement('tr');
      row.innerHTML = `<td>${fullName.charAt(0).toUpperCase() + fullName.slice(1)}${isToday ? ' (hoy)' : ''}</td><td>${hasData ? percent + '%' : 'Sin datos'}</td>`;
      historyTableBody.appendChild(row);
    });
  }

  historyTableToggle.addEventListener('click', () => {
    const showingTable = !historyTable.hidden;
    historyTable.hidden = showingTable;
    barChart.hidden = !showingTable;
    historyTableToggle.textContent = showingTable ? 'Ver como gráfica' : 'Ver como tabla';
  });

  // ============================================================
  // 8. ALERTA FÍSICA (Kesta 6): buzzer + luz LED en una placa
  //    aparte (IdeaBoard), conectada por CABLE USB.
  //
  //    La placa ya trae su propio programa corriendo (CircuitPython),
  //    esperando líneas de texto por el puerto serial: "GOOD",
  //    "ATTENTION", "BAD" u "OFF". Este bloque solo se encarga de
  //    mandarle esas palabras según lo que la cámara va detectando.
  //
  //    Es 100% opcional — sin la placa conectada, la app funciona
  //    igual de completa, solo con la tarjeta de estado en pantalla.
  //    Usa la Web Serial API, que solo existe en Chrome/Edge de
  //    computadora (no en celular, no en Firefox/Safari) — por eso
  //    se detecta primero si el navegador la soporta.
  // ============================================================
  const hwConnectBtn = document.getElementById('hwConnectBtn');
  const hwPill = document.getElementById('hwPill');
  const hwPillText = hwPill ? hwPill.querySelector('.pill-text') : null;
  const hwUnsupportedMsg = document.getElementById('hwUnsupportedMsg');

  const HW_SUPPORTED = 'serial' in navigator;

  let hwPort = null;
  let hwWriter = null;
  let hwWritableClosed = null;
  let lastHwCommand = null;

  if (!HW_SUPPORTED && hwConnectBtn) {
    hwConnectBtn.disabled = true;
    hwConnectBtn.textContent = 'No disponible en este navegador';
    if (hwUnsupportedMsg) hwUnsupportedMsg.hidden = false;
  }

  function setHwPillState(connected) {
    if (hwConnectBtn) {
      hwConnectBtn.textContent = connected ? 'Desconectar placa' : '🔌 Conectar placa (buzzer)';
    }
    if (hwPill) hwPill.classList.toggle('connected', connected);
    if (hwPillText) hwPillText.textContent = connected ? 'Placa conectada' : 'Placa desconectada';
  }

  // Solo manda un comando por el cable cuando SÍ cambió, para no saturar
  // el puerto serial mandando la misma palabra decenas de veces por segundo.
  function sendHwCommand(cmd) {
    if (!hwWriter || cmd === lastHwCommand) return;
    lastHwCommand = cmd;
    hwWriter.write(cmd + '\n').catch(() => {
      // Lo más probable es que se desconectó el cable a medio camino
      disconnectHardware();
    });
  }

  // Traduce el estado de la postura a los 3 niveles que la placa entiende:
  // buena postura, "llevas un rato así" (todavía sin sonar), y alarma activa.
  function syncHardwareState(isGood) {
    if (!hwWriter) return;
    if (isGood) {
      sendHwCommand('GOOD');
      return;
    }
    sendHwCommand(badPostureSeconds >= BAD_POSTURE_ALERT_SECONDS ? 'BAD' : 'ATTENTION');
  }

  async function connectHardware() {
    if (!HW_SUPPORTED) return;
    try {
      hwPort = await navigator.serial.requestPort();
      await hwPort.open({ baudRate: 115200 });
      const encoder = new TextEncoderStream();
      hwWritableClosed = encoder.readable.pipeTo(hwPort.writable);
      hwWriter = encoder.writable.getWriter();
      lastHwCommand = null;
      setHwPillState(true);
      // Si la cámara ya estaba activa, avisa el estado actual de una vez;
      // si no, deja la placa apagada hasta que haya postura que reportar.
      sendHwCommand(cameraConnected ? (confirmedGood ? 'GOOD' : 'BAD') : 'OFF');
      navigator.serial.addEventListener('disconnect', handleHwUnplugged);
    } catch (err) {
      // "NotFoundError" pasa si el usuario cierra el selector de puerto sin
      // elegir nada — no es un error real, no hace falta avisar nada.
      if (err && err.name !== 'NotFoundError') {
        showCameraError('No se pudo conectar con la placa. Revisa que esté conectada por USB y que ningún otro programa (Mu, monitor serial, Arduino IDE…) tenga su puerto abierto.');
      }
    }
  }

  function handleHwUnplugged() {
    disconnectHardware();
  }

  async function disconnectHardware() {
    navigator.serial.removeEventListener('disconnect', handleHwUnplugged);
    try {
      if (hwWriter) {
        await hwWriter.write('OFF\n').catch(() => {});
        hwWriter.releaseLock();
      }
      if (hwWritableClosed) await hwWritableClosed.catch(() => {});
      if (hwPort) await hwPort.close();
    } catch {
      // Si el cable ya se desconectó físicamente, cerrar puede fallar solo
      // — no es un problema, la placa de todas formas ya no está conectada.
    }
    hwPort = null;
    hwWriter = null;
    hwWritableClosed = null;
    lastHwCommand = null;
    setHwPillState(false);
  }

  if (hwConnectBtn) {
    hwConnectBtn.addEventListener('click', () => {
      if (hwPort) disconnectHardware();
      else connectHardware();
    });
  }
})();
