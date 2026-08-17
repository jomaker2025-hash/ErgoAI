/* ============================================================
   ErgoAI — Lógica de la aplicación (Kesta 11)
   ------------------------------------------------------------
   Este archivo maneja:
   1. La pantalla de carga (splash)
   2. La conexión con la cámara del propio dispositivo (compu,
      tablet o celular) vía getUserMedia — sin IPs ni redes WiFi
      que configurar, funciona para cualquier persona.
   3. La detección de postura con IA (MediaPipe Pose), corriendo
      directo en tu navegador — no hay servidor externo. Usa 3
      señales reales (hombros, cadera, cabeza) y calibración
      personal, y clasifica en 3 estados: buena / atención / mala.
   4. El historial de los últimos 7 días, guardado en este
      navegador (localStorage). Si limpias los datos del navegador
      o usas otra computadora, se reinicia — es una limitación
      honesta de esta versión sin servidor propio. (El módulo de
      racha por días se quitó en Kesta 10: se volvía a dibujar
      entero cada segundo y eso se veía como un parpadeo constante.)
   5. La sesión en vivo: línea de tiempo de los últimos minutos,
      pensada para que aunque acabes de conectarte veas algo real.
   6. Pintar todo eso en la interfaz (tooltips propios, toasts).
   7. La alerta física — buzzer + luz LED en una placa aparte
      (IdeaBoard), conectada por cable USB vía Web Serial. Requerida
      para la feria, aunque el resto de la app funciona sin ella.
   ============================================================ */

(() => {
  'use strict';

  // ---------- Motion (motion.dev) ----------
  // Cargado como <script> global en index.html (ver comentario ahí).
  // Listo para animaciones, ej.: animate('.status-card', { opacity: [0, 1] }).
  const { animate, scroll, stagger, inView } = window.Motion || {};

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

  // ---------- Kesta 8: sesión en vivo, toast, tooltip compartido ----------
  const sessionModule = document.getElementById('sessionModule');
  const sessionStrip = document.getElementById('sessionStrip');
  const toastEl = document.getElementById('toast');
  const chartTooltip = document.getElementById('chartTooltip');

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

  // ---------- Aviso flotante temporal (toast) ----------
  let toastTimeoutId = null;
  function showToast(msg, ms = 3400) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('show'));
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      toastEl.classList.remove('show');
      setTimeout(() => { toastEl.hidden = true; }, 300);
    }, ms);
  }

  // ---------- Tooltip compartido (historial, semana, sesión) ----------
  // Reemplaza el "title" nativo del navegador (lento, feo, inconsistente)
  // por un tooltip propio. Cualquier elemento con "data-tooltip" adentro
  // de "container" lo dispara solo con pasar el mouse encima.
  function bindTooltip(container) {
    if (!container || !chartTooltip) return;
    container.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target || !container.contains(target)) return;
      chartTooltip.textContent = target.dataset.tooltip;
      chartTooltip.hidden = false;
      requestAnimationFrame(() => chartTooltip.classList.add('show'));
      positionTooltip(e, target);
    });
    container.addEventListener('mousemove', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (target && container.contains(target)) positionTooltip(e, target);
    });
    container.addEventListener('mouseout', (e) => {
      const leavingTarget = e.target.closest('[data-tooltip]');
      if (!leavingTarget) return;
      if (e.relatedTarget && leavingTarget.contains(e.relatedTarget)) return;
      chartTooltip.classList.remove('show');
    });
  }
  function positionTooltip(e, target) {
    const rect = target.getBoundingClientRect();
    chartTooltip.style.left = `${rect.left + rect.width / 2}px`;
    chartTooltip.style.top = `${rect.top - 8}px`;
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

  // (Kesta 17: se quitó animateValue() de aquí — era del módulo "Tu
  // progreso"/racha, eliminado en Kesta 10; la función se quedó
  // huérfana, sin nadie que la llamara, desde entonces.)

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
  // 2. HISTORIAL REAL (últimos 7 días, guardado en localStorage)
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

  function ensureToday() {
    const key = todayKey();
    if (!history[key]) {
      history[key] = { goodSeconds: 0, attentionSeconds: 0, totalSeconds: 0 };
    } else if (history[key].attentionSeconds === undefined) {
      history[key].attentionSeconds = 0; // datos guardados antes de que existiera este campo
    }
    return history[key];
  }

  // Se llama una vez por segundo mientras la cámara está conectada.
  // "state" es 'good' | 'attention' | 'bad'.
  function recordSample(state) {
    const day = ensureToday();
    day.totalSeconds += 1;
    if (state === 'good') {
      day.goodSeconds += 1;
    } else if (state === 'attention') {
      day.attentionSeconds += 1;
    }
    saveHistory(history);
    renderFromStorage();
    trackBadPostureAlert(state);
    syncHardwareState(state); // respaldo cada segundo — el cambio real ya se manda al confirmarse
    recordSessionPoint(state);
  }

  // Kesta 10: se quitó el módulo "Tu progreso" (racha de días) — el anillo,
  // los días de la semana y los récords se volvían a dibujar desde cero
  // cada segundo mientras la cámara estaba conectada, y eso reiniciaba sus
  // animaciones de entrada una y otra vez (se veía como un tembleque
  // constante). El historial de los últimos 7 días (abajo) sigue 100%
  // real, usa los mismos datos guardados, y ya no tiene ese problema.
  function renderFromStorage() {
    renderHistoryChart();
  }

  // ============================================================
  // 3. TARJETA DE ESTADO — la actualizan o el botón demo (sin
  //    cámara) o la IA en vivo (con cámara conectada). 3 estados
  //    reales: 'good' (buena), 'attention' (dudosa), 'bad' (mala) —
  //    los mismos 3 que la luz de la placa física.
  // ============================================================
  const STATUS_COPY = {
    good: { value: 'Buena Postura', sub: 'Sigue así, tu espalda te lo agradece', icon: '🧍' },
    attention: { value: 'Postura Dudosa', sub: 'Vas por buen camino — endereza un poco más', icon: '🤔' },
    bad: { value: 'Mala Postura', sub: 'Endereza tu espalda, ¡tú puedes!', icon: '🙇' },
  };
  let cameraConnected = false;

  function applyStatus(state) {
    statusCard.classList.remove('bad', 'attention');
    if (state !== 'good') statusCard.classList.add(state);
    const copy = STATUS_COPY[state] || STATUS_COPY.good;
    crossfadeText(statusValueEl, copy.value);
    crossfadeText(statusSubEl, copy.sub);
    popIcon(statusIconEl, copy.icon);
  }

  const DEMO_STATES = ['good', 'attention', 'bad'];
  let demoStateIndex = 0;
  demoBtn.addEventListener('click', () => {
    if (cameraConnected) return; // con cámara real, el botón demo ya no manda
    demoStateIndex = (demoStateIndex + 1) % DEMO_STATES.length;
    applyStatus(DEMO_STATES[demoStateIndex]);
    const next = STATUS_COPY[DEMO_STATES[(demoStateIndex + 1) % DEMO_STATES.length]];
    demoBtn.textContent = `👁️ Vista previa: ${next.value}`;
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
  // Mismo brillo, ahora también en las tarjetas nuevas con el efecto
  // "spotlight" estilo Aceternity (ver .aceternity-spotlight en
  // styles/tailwind.css) — reutiliza la función de arriba, sin duplicar
  // lógica.
  attachCursorGlow(cameraSetup);
  attachCursorGlow(document.getElementById('hardwareSetup'));
  document.querySelectorAll('.info-card').forEach(attachCursorGlow);
  bindTooltip(barChart);
  bindTooltip(sessionStrip);

  // ============================================================
  // 4. CONEXIÓN CON LA CÁMARA (cualquier dispositivo) + IA
  // ============================================================
  // Nombre nuevo de la llave de calibración: la versión anterior guardaba
  // un ÁNGULO (oreja-hombro); esta guarda una PROPORCIÓN distinta (cabeza
  // vs. ancho de hombros — ver computePostureMetrics). Son escalas
  // totalmente distintas, así que usamos una llave distinta a propósito:
  // si usáramos la misma, a alguien que calibró antes se le leería ese
  // número viejo como si fuera el nuevo, y saldría una clasificación sin
  // sentido (por ejemplo, un "20" de ángulo interpretado como proporción).
  const CALIBRATION_KEY = 'ergoai_calibrated_head_ratio';
  const CALIBRATION_MS = 3000; // cuánto dura la calibración

  // ---------- Umbrales de clasificación (mismas 3 señales y valores que
  // el script de escritorio en Python que ya probamos y funciona) ----------
  const SHOULDER_TILT_MAX = 8; // grados de inclinación de hombros
  const HIP_TILT_MAX = 8; // grados de inclinación de cadera
  const DEFAULT_HEAD_GOOD = 0.27; // referencia genérica si nunca calibraste
  const DEFAULT_HEAD_ATTENTION = 0.23;

  // Arreglo (Kesta 13): qué tan segura tiene que estar la IA de dónde
  // está un punto para confiar en él. Antes solo se revisaba en la
  // cadera; una mano pasando cerca de la cara o el hombro (rascarte,
  // acomodarte el pelo, apoyar la barbilla) bajaba la confianza de esos
  // puntos SIN que el código se diera cuenta, y el hombro/nariz seguían
  // usándose igual — eso es lo que se veía como que "una mano afecta la
  // postura". Ahora, si la nariz o los hombros no son confiables, el
  // cuadro se descarta (se mantiene el último estado confirmado) en vez
  // de arriesgarse a clasificar con datos malos.
  //
  // Arreglo (Kesta 14): 0.5 resultó DEMASIADO estricto — con luz normal
  // de salón/mesa de feria, MediaPipe reporta "visibility" bastante más
  // baja de lo que uno esperaría incluso con el cuerpo perfectamente a
  // la vista, así que casi todos los cuadros se estaban descartando. Eso
  // se sentía como "detección lenta" y "postura mala reconocida como
  // buena" (el estado se quedaba congelado en el último confirmado) —
  // y como el buzzer solo cambia cuando el estado confirmado cambia,
  // también se sentía como "el buzzer no reacciona". Se baja a 0.3
  // (sigue filtrando una oclusión real, pero ya no cuadros normales).
  const LANDMARK_VISIBILITY_MIN = 0.3;
  // Techo de lo que es una proporción realista de "cabeza alta", para
  // detectar cuando alguien echa la cabeza MUY atrás (mirar el techo —
  // justo lo primero que prueba alguien que no conoce el prototipo).
  //
  // Arreglo (Kesta 14): un número FIJO (0.5) no tiene sentido para
  // todo el mundo — según dónde esté tu cámara, TU postura buena real
  // puede dar una proporción más alta que eso, y entonces cada cuadro
  // se marcaba "implausible" para siempre (mismo síntoma que arriba).
  // Ahora el techo es relativo a TU referencia (calibrada o genérica),
  // con margen de sobra, para adaptarse a cada cámara/persona.
  const HEAD_RATIO_PLAUSIBLE_MARGIN = 0.35;
  // Con calibración personal, "bueno" y "atención" se miden relativo a TU
  // propio número, no al genérico:
  const HEAD_MARGIN_ATTENTION = 0.02; // cuánto por debajo de tu calibración ya es "atención"
  const HEAD_MARGIN_BAD = 0.05; // cuánto por debajo ya es "mala"

  // Cuántos cuadros seguidos con el MISMO estado nuevo se necesitan para
  // confirmar el cambio — evita que la tarjeta "parpadee" por un instante.
  const DEBOUNCE_FRAMES = 8;

  let pose = null;
  let poseLoopRunning = false; // bucle propio que le manda cuadros a la IA (ver startPoseProcessing)
  let poseFrameBusy = false; // evita mandar un cuadro nuevo antes de que la IA termine el anterior
  let previewLoopRunning = false;
  let lastLandmarks = null; // últimos puntos del cuerpo que sí llegaron de la IA
  let gotFirstPoseResult = false;
  let poseWarnTimeoutId = null;
  let confirmedState = 'good'; // 'good' | 'attention' | 'bad' — el estado ya confirmado (con debounce)
  let pendingState = null; // candidato a nuevo estado, todavía "probándose"
  let pendingStreak = 0;
  // Arreglo (Kesta 14): válvula de seguridad — un cuadro "no confiable"
  // se descarta (ver computePostureMetrics), pero si se acumulan
  // DEMASIADOS seguidos, algo anda mal con el filtro y es peor quedarse
  // congelado para siempre que clasificar con datos imperfectos. Después
  // de MAX_UNRELIABLE_FRAMES la IA deja de descartar y clasifica con lo
  // que tenga, aunque no esté 100% segura.
  let consecutiveUnreliableFrames = 0;
  const MAX_UNRELIABLE_FRAMES = 20;
  let secondTickInterval = null;
  let webcamStream = null;
  let calibratedHeadRatio = parseFloat(safeGetItem(CALIBRATION_KEY));
  if (Number.isNaN(calibratedHeadRatio)) calibratedHeadRatio = null;
  let calibrating = false;
  let calibrationSamples = [];

  if (calibratedHeadRatio !== null) {
    calibrateStatus.textContent = 'Calibrada ✓ — usando tu propia referencia de buena postura';
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
    // Este clic SÍ es un gesto directo del usuario — es el momento correcto
    // (y, en varios navegadores, el ÚNICO momento válido) para "despertar"
    // el audio y pedir permiso de notificaciones. Si se piden después,
    // desde un temporizador, muchos navegadores los bloquean en silencio.
    unlockAudio();
    requestNotifyPermissionIfNeeded();

    hideCameraError();
    webcamConnectBtn.disabled = true;
    webcamConnectBtn.textContent = 'Pidiendo permiso…';
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        // Arreglo (Kesta 17, rendimiento): sin esto, algunas cámaras le
        // entregan a MediaPipe cuadros de 720p (o más) sin necesidad —
        // el modelo de postura no necesita tanto detalle, y procesar
        // cuadros más grandes cuesta más CPU en cada uno, para siempre
        // mientras la cámara esté conectada. "ideal" (no "exact"/"min")
        // para que la cámara elija lo más parecido que pueda, sin fallar
        // en cámaras que no soportan justo esta medida.
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
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
    poseLoopRunning = false;
    poseFrameBusy = false;
    if (poseWarnTimeoutId) {
      clearTimeout(poseWarnTimeoutId);
      poseWarnTimeoutId = null;
    }
    lastLandmarks = null;
    gotFirstPoseResult = false;
    confirmedState = 'good';
    pendingState = null;
    pendingStreak = 0;
    consecutiveUnreliableFrames = 0;
    badPostureSeconds = 0;
    secondsSinceLastAlert = 0;
    calibrating = false;
    calibrateBtn.disabled = false;
    sessionSamples = [];
    renderSessionStrip();
    sessionModule.hidden = true;

    sendHwCommand('OFF');

    // Kesta 13: avisa a los efectos decorativos (partículas)
    // que ya pueden volver a dibujar — mientras la cámara está conectada
    // se quedan pausados, para no competirle presupuesto de CPU/GPU a la
    // detección de postura real. Un CustomEvent (no una variable
    // compartida) para que app.js no tenga que saber que esos efectos
    // existen — si ninguno está cargado, este evento simplemente no lo
    // escucha nadie.
    //
    // Arreglo (Kesta 15): además del evento, se guarda el estado en
    // window.ErgoAI.cameraConnected. Kesta 13 carga effects.js DESPUÉS
    // de activar la cámara (a propósito, para no competir por internet
    // lento) — pero eso significaba que si conectabas la cámara ANTES
    // de que ese archivo terminara de cargar, el evento se perdía:
    // cuando por fin arrancaba, no tenía forma de saber que la cámara
    // ya estaba prendida. Ahora revisa esta bandera al arrancar, no
    // solo el evento. (Esto fue crítico mientras existió el fondo 3D
    // con Three.js — quitado en Kesta 16 por seguir congelando la
    // computadora del colegio — pero se deja el mismo mecanismo para
    // las partículas, más livianas.)
    window.ErgoAI = window.ErgoAI || {};
    window.ErgoAI.cameraConnected = false;
    window.dispatchEvent(new CustomEvent('ergoai:camera', { detail: { connected: false } }));
  }

  function onCameraConnected() {
    setCameraPillState(true);
    cameraSetup.classList.add('is-connected');
    poseCanvas.hidden = false;
    changeIpBtn.hidden = false;
    calibrateRow.hidden = false;
    sessionModule.hidden = false;
    sessionSamples = [];
    renderSessionStrip();

    if (!secondTickInterval) {
      secondTickInterval = setInterval(() => {
        if (cameraConnected) recordSample(confirmedState);
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
    syncHardwareState(confirmedState);

    // Kesta 13/15: avisa a los efectos decorativos que se pausen mientras
    // la cámara está activa (ver la nota completa en disconnectCamera) —
    // bandera Y evento, para que también lo sepan si arrancan DESPUÉS.
    window.ErgoAI = window.ErgoAI || {};
    window.ErgoAI.cameraConnected = true;
    window.dispatchEvent(new CustomEvent('ergoai:camera', { detail: { connected: true } }));
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
      // Arreglo (Kesta 17): modelComplexity 1 ("Full") es más preciso,
      // pero también más pesado — MediaPipe usa la tarjeta gráfica por
      // dentro para esto, y en una tarjeta gráfica modesta (como la de
      // la compu del colegio) eso puede congelar la computadora al
      // activar la cámara, con o sin nuestro propio fondo 3D (que ya se
      // quitó en Kesta 16). 0 ("Lite") es más liviano y sigue siendo
      // suficiente para las 3 señales que usamos (hombros, cadera,
      // cabeza son puntos grandes y fáciles de rastrear, no necesitan
      // la precisión extra del modelo completo). Confiable > preciso
      // al milímetro para la demo de la feria.
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onPoseResults);
  }

  // Le manda cuadros de video a la IA, esperando a que termine de procesar
  // un cuadro antes de mandar el siguiente (igual que antes). Arreglo:
  // antes mandábamos un cuadro nuevo en CADA frame de pantalla (hasta 60
  // veces por segundo) sin esperar a que la IA terminara con el anterior
  // — eso hacía que se acumularan cuadros sin procesar y la IA se quedara
  // "atorada" sin volver a responder nunca.
  //
  // Arreglo (Kesta 11.1): antes usábamos la utilidad "Camera" de
  // @mediapipe/camera_utils para esto, pero esa utilidad ABRE SU PROPIA
  // cámara por dentro (llama a getUserMedia otra vez ella sola) en vez de
  // usar la que ya conectamos nosotros — así que cada vez que se activaba
  // la cámara quedaban DOS accesos abiertos al mismo dispositivo físico al
  // mismo tiempo. En varias cámaras/computadoras eso es justo lo que se
  // veía como que "se bugueaba" al abrir (imagen congelada, parpadeando,
  // con colores raros) — el driver de la cámara peleando entre dos
  // programas pidiéndole video a la vez. Ahora usamos nuestro propio
  // bucle, sobre la ÚNICA cámara que ya está conectada (webcamVideo).
  function startPoseProcessing() {
    if (!pose || poseLoopRunning) return;
    poseLoopRunning = true;
    poseFrameBusy = false;
    const loop = async () => {
      if (!poseLoopRunning) return;
      if (!poseFrameBusy && pose && cameraConnected && webcamVideo.readyState >= 2) {
        poseFrameBusy = true;
        try {
          await pose.send({ image: webcamVideo });
        } catch (err) {
          // Un cuadro fallido ocasional no debe detener el bucle.
        }
        poseFrameBusy = false;
      }
      if (poseLoopRunning) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
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
    calibratedHeadRatio = avg;
    safeSetItem(CALIBRATION_KEY, avg.toFixed(4));
    calibrateStatus.textContent = 'Calibrada ✓ — usando tu propia referencia de buena postura';
  }

  function onPoseResults(results) {
    // Ya NO dibuja aquí (eso lo hace drawPreview, en cada cuadro de
    // pantalla, sin depender de esto) — esta función solo guarda los
    // puntos del cuerpo más recientes y decide el estado de postura.
    if (!gotFirstPoseResult) {
      gotFirstPoseResult = true;
      hideCameraError(); // por si alcanzó a mostrarse el aviso de "la IA no responde"
    }
    lastLandmarks = results.poseLandmarks || null;

    if (!results.poseLandmarks) return;

    const metrics = computePostureMetrics(results.poseLandmarks);
    // Cuadro no confiable (mano tapando cara/hombro, ángulo de cabeza
    // extremo): no lo uses para clasificar NI para calibrar — se
    // mantiene el último estado confirmado y se espera al siguiente
    // cuadro bueno, en vez de "aprenderte" un dato malo. PERO no para
    // siempre: si se acumulan demasiados seguidos, se usa igual (ver
    // MAX_UNRELIABLE_FRAMES) — nunca debe sentirse "congelado".
    if (!metrics.reliable) {
      consecutiveUnreliableFrames += 1;
      if (consecutiveUnreliableFrames < MAX_UNRELIABLE_FRAMES) return;
    }
    consecutiveUnreliableFrames = 0;

    if (calibrating) calibrationSamples.push(metrics.headRatio);

    updateConfirmedState(classifyPosture(metrics));
  }

  // Landmarks de MediaPipe Pose (mismos índices que en el script de
  // Python): 0 = nariz, 11/12 = hombros, 23/24 = cadera. Estas son las
  // mismas 3 señales que ya probamos y funcionan en desktop/posture_detector.py:
  //  1. Inclinación de hombros respecto a la horizontal.
  //  2. Inclinación de cadera respecto a la horizontal.
  //  3. Qué tan "alta" está la cabeza (nariz) respecto al centro de los
  //     hombros, normalizado por el ancho de hombros — así no importa si
  //     estás cerca o lejos de la cámara.
  function computePostureMetrics(landmarks) {
    const nose = landmarks[0];
    const lSh = landmarks[11], rSh = landmarks[12];
    const lHip = landmarks[23], rHip = landmarks[24];

    const shCenterY = (lSh.y + rSh.y) / 2;
    const shoulderWidth = Math.hypot(rSh.x - lSh.x, rSh.y - lSh.y);

    // Arreglo de precisión: en una webcam típica de escritorio, la cadera
    // muchas veces queda fuera de cuadro (solo se ve de los hombros para
    // arriba). Si la IA no está segura de dónde está (poca "visibility"),
    // es mejor ignorar esa señal que dejar que un dato ruidoso invente un
    // "problema" de postura que no existe.
    const hipVisible = (lHip.visibility || 0) > 0.5 && (rHip.visibility || 0) > 0.5;

    // Arreglo (Kesta 13): la nariz y los hombros SÍ son obligatorios para
    // clasificar (a diferencia de la cadera) — pero si una mano los tapa
    // un instante, "visibility" cae y no hay que confiar en ese cuadro.
    const noseVisible = (nose.visibility || 0) > LANDMARK_VISIBILITY_MIN;
    const shouldersVisible = (lSh.visibility || 0) > LANDMARK_VISIBILITY_MIN && (rSh.visibility || 0) > LANDMARK_VISIBILITY_MIN;

    const headRatio = shoulderWidth > 0 ? (shCenterY - nose.y) / shoulderWidth : 0;
    // Relativo a TU referencia (ver nota de Kesta 14 arriba) — no un
    // número fijo igual para todas las cámaras/personas.
    const headRatioCeiling = (calibratedHeadRatio !== null ? calibratedHeadRatio : DEFAULT_HEAD_GOOD) + HEAD_RATIO_PLAUSIBLE_MARGIN;
    const headRatioPlausible = headRatio <= headRatioCeiling;

    return {
      shoulderTilt: tiltAngle(lSh, rSh),
      hipTilt: hipVisible ? tiltAngle(lHip, rHip) : null,
      headRatio,
      // false = no confíes en este cuadro para clasificar (mano tapando
      // la cara/hombro, o un ángulo de cabeza tan extremo que la nariz
      // ya no se está proyectando de forma realista).
      reliable: noseVisible && shouldersVisible && headRatioPlausible,
    };
  }

  // Ángulo (0-90°) entre dos puntos y la horizontal — 0° = perfectamente
  // nivelado, entre más grande, más inclinado hacia un lado.
  function tiltAngle(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
    if (angle > 90) angle = 180 - angle;
    return angle;
  }

  // Traduce las 3 señales a un estado: 'good' | 'attention' | 'bad'.
  // La cabeza manda (si está bien arriba, es buena postura salvo que
  // hombros/cadera estén torcidos — eso ya la baja a "atención"); si la
  // cabeza está claramente baja, es mala postura sin importar lo demás.
  // Mismo orden de decisión que el script de Python que ya funciona.
  function classifyPosture(m) {
    let goodThreshold = DEFAULT_HEAD_GOOD;
    let attentionThreshold = DEFAULT_HEAD_ATTENTION;
    if (calibratedHeadRatio !== null) {
      goodThreshold = calibratedHeadRatio - HEAD_MARGIN_ATTENTION;
      attentionThreshold = calibratedHeadRatio - HEAD_MARGIN_BAD;
    }
    const tiltProblem = m.shoulderTilt > SHOULDER_TILT_MAX || (m.hipTilt !== null && m.hipTilt > HIP_TILT_MAX);

    if (m.headRatio >= goodThreshold) return tiltProblem ? 'attention' : 'good';
    if (m.headRatio >= attentionThreshold) return 'attention';
    return 'bad';
  }

  // Debounce genérico de 3 estados: un candidato nuevo debe repetirse
  // DEBOUNCE_FRAMES veces seguidas antes de confirmarse — así un
  // parpadeo de un instante (la IA pierde el cuerpo un cuadro, te mueves
  // rápido) no hace que la tarjeta/placa cambien en falso.
  function updateConfirmedState(candidate) {
    if (candidate === confirmedState) {
      pendingState = null;
      pendingStreak = 0;
      return;
    }
    if (candidate === pendingState) {
      pendingStreak += 1;
    } else {
      pendingState = candidate;
      pendingStreak = 1;
    }
    if (pendingStreak >= DEBOUNCE_FRAMES) {
      confirmedState = candidate;
      pendingState = null;
      pendingStreak = 0;
      applyStatus(confirmedState);
      syncHardwareState(confirmedState); // reacción inmediata, no esperar al tick de 1s
    }
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

  // ---------- Arreglo: "nunca se escucha ninguna notificación" ----------
  // Causa real: (1) antes creábamos un AudioContext NUEVO en cada beep, y
  // los navegadores crean el audio "pausado" hasta que hay una interacción
  // directa del usuario — nunca lo reanudábamos (falta un .resume()), así
  // que aunque no daba error, tampoco sonaba nunca. (2) el permiso de
  // notificaciones se pedía desde un temporizador (no un clic real), y los
  // navegadores bloquean silenciosamente esos pedidos "no solicitados" —
  // el permiso se quedaba en blanco para siempre. Ahora ambos se
  // resuelven en el mismo momento: el clic en "Activar cámara" (ver
  // unlockAudio/requestNotifyPermissionIfNeeded, llamados desde ahí).
  let sharedAudioCtx = null;
  function getAudioCtx() {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtxClass();
    return sharedAudioCtx;
  }
  function unlockAudio() {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  function requestNotifyPermissionIfNeeded() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  // Un "beep" generado con Web Audio — no necesita ningún archivo de sonido
  function playTone(freq, durationMs) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const play = () => {
      try {
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
        // Si algo falla, simplemente no suena — no rompemos nada más.
      }
    };
    if (ctx.state === 'suspended') ctx.resume().then(play).catch(() => {});
    else play();
  }

  function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: 'assets/favicon.svg' });
    } catch {
      // Algunos navegadores (sobre todo en celular) no soportan crear
      // Notification aunque exista el objeto — no pasa nada, el beep suena igual.
    }
  }

  // Se llama una vez por segundo (desde recordSample) mientras hay cámara
  // conectada. Solo el estado 'bad' cuenta para el aviso insistente —
  // 'attention' es la advertencia temprana silenciosa, 'bad' es cuando de
  // verdad conviene interrumpirte (mismo criterio que usa el buzzer).
  function trackBadPostureAlert(state) {
    if (state !== 'bad') {
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

  presentationBtn.addEventListener('click', () => {
    // El modo presentación esconde los paneles de conexión (para que se
    // vea limpio frente a los jueces) — pero si todavía falta conectar
    // algo, mejor avisar ANTES de esconderlos, no después.
    const missing = [];
    if (!cameraConnected) missing.push('la cámara');
    if (!hwWriter) missing.push('la placa (buzzer)');
    if (missing.length) {
      showToast(`⚠️ Todavía falta conectar ${missing.join(' y ')}. Puedes presentar igual, pero la feria requiere la placa conectada.`);
    }
    setPresentationMode(true);
  });
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

  // Arreglo (Kesta 17): esto se llama UNA VEZ POR SEGUNDO mientras la
  // cámara está conectada (viene de recordSample). Antes reconstruía las
  // 7 barras Y las 7 filas de la tabla desde cero cada vez — con
  // .bar-fill { transition: height ... }, eso significa que el navegador
  // volvía a "animar" la barra de hoy CADA SEGUNDO (elemento nuevo, sin
  // altura previa, izq. transición desde 0) — el mismo tipo de "tembleque"
  // que ya habíamos identificado y quitado del módulo de racha en Kesta
  // 10, solo que aquí seguía sin que nos diéramos cuenta. La solución es
  // la misma: no volver a dibujar si los datos que se ven en pantalla no
  // cambiaron de verdad.
  let lastHistorySignature = null;

  function renderHistoryChart() {
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const shortNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const days = last7Days();
    const today = todayKey();

    // "Firma" barata de lo que se vería en pantalla (7 días, cada uno
    // como "clave:porcentaje") — si es idéntica a la última vez, los
    // datos visibles no cambiaron (lo más común: pasó un segundo pero
    // el % redondeado de hoy sigue igual) y no hay nada que redibujar.
    const signature = days.map((d) => {
      const key = todayKey(d);
      const day = history[key];
      const hasData = !!day && day.totalSeconds > 0;
      const percent = hasData ? Math.round((day.goodSeconds / day.totalSeconds) * 100) : -1;
      return `${key}:${percent}`;
    }).join('|');
    if (signature === lastHistorySignature) return;
    lastHistorySignature = signature;

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
      col.dataset.tooltip = hasData ? `${fullName}: ${percent}% en buena postura` : `${fullName}: sin datos`;

      const value = document.createElement('span');
      value.className = 'bar-value';
      value.textContent = hasData ? `${percent}%` : '–';

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      // Arreglo (Kesta 17, rendimiento): antes se ponía fill.style.height
      // (una propiedad de layout); ahora es una variable CSS que .bar-fill
      // usa para su transform: scaleY(...) — ver style.css. Misma barra
      // "creciendo", pero por transform en vez de layout.
      fill.style.setProperty('--bar-percent', hasData ? Math.max(percent, 3) / 100 : 0);
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
  // 7b. SESIÓN EN VIVO (Kesta 8) — línea de tiempo de ESTA conexión,
  //    con datos reales, para que aunque acabes de conectar la
  //    cámara (como en la mesa de la feria) veas algo genuino
  //    pasando, sin necesitar días de historial acumulado. Vive solo
  //    en memoria — se reinicia cada vez que te reconectas o recargas.
  // ============================================================
  const SESSION_TICK_SECONDS = 2; // cada barra = 2 segundos reales
  const MAX_SESSION_TICKS = 90; // 90 barras × 2s = 3 minutos visibles
  let sessionSamples = [];
  let sessionTickCounter = 0;

  // Se llama una vez por segundo, desde recordSample.
  function recordSessionPoint(state) {
    sessionTickCounter += 1;
    if (sessionTickCounter < SESSION_TICK_SECONDS) return;
    sessionTickCounter = 0;
    sessionSamples.push(state);
    if (sessionSamples.length > MAX_SESSION_TICKS) sessionSamples.shift();
    renderSessionStrip();
  }

  const SESSION_STATE_LABEL = { good: 'Buena postura', attention: 'Postura dudosa', bad: 'Mala postura' };

  // Arreglo (Kesta 17): antes esto destruía y volvía a crear TODAS las
  // barritas de la sesión (hasta 90) cada vez que se llamaba — aunque
  // solo hubiera cambiado UNA (la más nueva). sessionSamples es una
  // "ventana deslizante" (se agrega al final, se quita del principio
  // cuando llega al tope) — así que el DOM puede actualizarse igual:
  // se agrega SOLO la barrita nueva, y se quita SOLO la más vieja si
  // hace falta. Los textos de "hace Ns" sí cambian en todas cada vez
  // (todo se corrió 2s), pero actualizar un atributo de texto en
  // elementos que YA EXISTEN es muchísimo más barato que destruir y
  // volver a crear el elemento entero — que es lo que de verdad cuesta.
  function renderSessionStrip() {
    if (sessionSamples.length === 0) {
      sessionStrip.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'session-empty';
      empty.textContent = 'Todavía no hay datos de esta sesión — dale un par de segundos.';
      sessionStrip.appendChild(empty);
      return;
    }
    // Si el primer hijo no es una barrita (ej. veníamos del mensaje
    // "todavía no hay datos", o se acaba de reconectar la cámara),
    // reconstruye todo una vez — a partir de ahí, siempre incremental.
    const isFreshStart = sessionStrip.children.length === 0 || !sessionStrip.firstElementChild.classList.contains('session-tick');
    if (isFreshStart) {
      sessionStrip.innerHTML = '';
      sessionSamples.forEach((state) => sessionStrip.appendChild(makeSessionTick(state)));
    } else {
      // Se agregó una muestra nueva al final; si ya estábamos en el
      // tope, recordSessionPoint ya quitó la más vieja de sessionSamples
      // — se refleja quitando también su barrita del DOM.
      sessionStrip.appendChild(makeSessionTick(sessionSamples[sessionSamples.length - 1]));
      while (sessionStrip.children.length > sessionSamples.length) {
        sessionStrip.removeChild(sessionStrip.firstElementChild);
      }
    }
    updateSessionTickTooltips();
  }

  function makeSessionTick(state) {
    const tick = document.createElement('div');
    tick.className = `session-tick ${state}`;
    return tick;
  }

  // Los tooltips ("hace Ns") de TODAS las barritas se corren en 1, así
  // que sí hay que tocarlas todas — pero actualizar un atributo es
  // muchísimo más barato que destruir y crear el elemento entero.
  function updateSessionTickTooltips() {
    const ticks = sessionStrip.children;
    const total = ticks.length;
    for (let i = 0; i < total; i++) {
      const state = sessionSamples[i];
      const secondsAgo = (total - 1 - i) * SESSION_TICK_SECONDS;
      ticks[i].dataset.tooltip = secondsAgo === 0
        ? `${SESSION_STATE_LABEL[state]} · ahora`
        : `${SESSION_STATE_LABEL[state]} · hace ${secondsAgo}s`;
    }
  }

  // ============================================================
  // 8. ALERTA FÍSICA (Kesta 8, requerida en la feria): buzzer + luz
  //    LED en una placa aparte (IdeaBoard), conectada por CABLE USB.
  //
  //    La placa ya trae su propio programa corriendo (CircuitPython),
  //    esperando líneas de texto por el puerto serial: "GOOD",
  //    "ATTENTION", "BAD" u "OFF". Este bloque solo se encarga de
  //    mandarle EXACTAMENTE el mismo estado de 3 niveles que ya
  //    calculó classifyPosture() — nada de aproximarlo por tiempo.
  //
  //    Usa la Web Serial API, que solo existe en Chrome/Edge de
  //    computadora (no en celular, no en Firefox/Safari) — por eso
  //    se detecta primero si el navegador la soporta. Si no está
  //    disponible, el resto de ErgoAI sigue funcionando completo.
  // ============================================================
  const hwConnectBtn = document.getElementById('hwConnectBtn');
  const hwPill = document.getElementById('hwPill');
  const hwPillText = hwPill ? hwPill.querySelector('.pill-text') : null;
  const hwUnsupportedMsg = document.getElementById('hwUnsupportedMsg');
  const hwError = document.getElementById('hwError');

  // Arreglo: los errores de LA PLACA (puerto vacío, driver faltante,
  // etc.) usaban por error showCameraError() — eso los mostraba en la
  // sección de la cámara, lejos de "Conectar placa", así que fácil
  // pasaban desapercibidos. Ahora tienen su propio aviso, junto al botón.
  function showHwError(msg) {
    if (!hwError) return;
    hwError.innerHTML = msg;
    hwError.hidden = false;
  }
  function hideHwError() {
    if (hwError) hwError.hidden = true;
  }

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
  //
  // Arreglo: antes mandábamos el comando terminado solo en "\n". La placa
  // corre CircuitPython y lee los comandos con input(), que espera un
  // retorno de carro ("\r") para saber que la línea terminó — igual que
  // hace desktop/posture_detector.py, que manda "\r\n" y sí funciona. Sin
  // el "\r", el comando se queda esperando en el buffer para siempre: la
  // conexión se ve sana (no hay error, no se desconecta) pero la placa
  // nunca llega a procesar nada. Por eso el LED/buzzer no reaccionaban
  // desde la página web aunque la tarjeta en pantalla sí cambiaba bien.
  function sendHwCommand(cmd) {
    if (!hwWriter || cmd === lastHwCommand) return;
    lastHwCommand = cmd;
    hwWriter.write(cmd + '\r\n').catch(() => {
      // Lo más probable es que se desconectó el cable a medio camino
      disconnectHardware();
    });
  }

  // Traduce nuestro estado ('good'/'attention'/'bad') a la palabra exacta
  // que espera el programa de la placa.
  function hwCommandForState(state) {
    return state === 'good' ? 'GOOD' : state === 'attention' ? 'ATTENTION' : 'BAD';
  }

  function syncHardwareState(state) {
    if (!hwWriter) return;
    sendHwCommand(hwCommandForState(state));
  }

  async function connectHardware() {
    if (!HW_SUPPORTED) return;
    hideHwError();
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
      sendHwCommand(cameraConnected ? hwCommandForState(confirmedState) : 'OFF');
      navigator.serial.addEventListener('disconnect', handleHwUnplugged);
    } catch (err) {
      if (err && err.name === 'NotFoundError') {
        // Pasa si el usuario cierra el selector de puerto sin elegir nada —
        // O si la lista aparece VACÍA porque Windows todavía no reconoce la
        // placa (falta el driver "CH340", muy común en una computadora
        // donde nunca se ha conectado una placa como esta — por ejemplo,
        // "funciona en mi compu pero no en la del colegio" es justo este
        // caso). Como no podemos distinguir "cancelaste a propósito" de
        // "no había nada para elegir", damos un aviso completo por si
        // acaso, con el link directo al driver (no "búscalo en internet",
        // para no mandar a nadie a bajar un instalador de un sitio raro).
        showHwError(
          'Si la lista de puertos salió vacía (o no viste tu placa ahí), esta computadora probablemente nunca instaló el driver "CH340" — pasa la primera vez que se conecta una placa así en una computadora nueva. ' +
          '<a href="https://www.wch-ic.com/downloads/CH341SER_ZIP.html" target="_blank" rel="noopener noreferrer">Descarga el driver oficial aquí</a>, instálalo, ' +
          'DESCONECTA Y VUELVE A CONECTAR el cable USB de la placa, y dale clic a "Conectar placa" otra vez. ' +
          '¿Quieres confirmar? Abre el Administrador de dispositivos de Windows (búscalo en el menú Inicio) — si ves algo con un triángulo amarillo bajo "Otros dispositivos", es justo esto.'
        );
      } else {
        showHwError('No se pudo conectar con la placa. Revisa que esté conectada por USB y que ningún otro programa (Mu, monitor serial, Arduino IDE…) tenga su puerto abierto.');
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
        await hwWriter.write('OFF\r\n').catch(() => {});
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
