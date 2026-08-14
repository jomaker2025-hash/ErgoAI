/* ============================================================
   ErgoAI — Cargador de lo decorativo (Kesta 13)
   ------------------------------------------------------------
   Por qué existe este archivo: en Kesta 12 agregamos varias
   librerías (Motion, GSAP, ScrollTrigger, Lenis, Three.js) para
   efectos visuales. Kesta 13 llegó porque en la práctica eso metía
   "delay y lag" — sobre todo grave si el día de la feria el
   internet es malo, porque el navegador tenía que bajar TODO eso
   antes de que la página se sintiera lista.

   Este archivo cambia el ORDEN: lo crítico (MediaPipe + app.js, ya
   declarados arriba en index.html) se sigue cargando primero, como
   siempre. Todo lo decorativo se pide DESPUÉS de que la página ya
   cargó por completo ("load"), y en conexiones lentas / con "modo
   ahorro de datos" del navegador activado, se salta entero — cero
   bytes de más, cero competencia por ancho de banda con la cámara.

   Además: los .reveal-on-scroll (ver styles/tailwind.css) empiezan
   invisibles (opacity:0) a la espera de que Motion los anime al
   entrar en pantalla. Si los efectos nunca cargan (conexión lenta,
   o algo falla), un cronómetro de respaldo los hace visibles de
   todos modos — nunca deben quedar invisibles para siempre por
   culpa de un efecto decorativo que no cargó.
   ============================================================ */

(() => {
  'use strict';

  function revealEverythingNow() {
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }

  // Cronómetro de respaldo: pase lo que pase con las librerías de abajo,
  // en 5s el contenido tiene que verse. Si Motion sí alcanza a animarlas
  // antes, esto no hace nada distinto (ya estarían visibles).
  const safetyNetId = setTimeout(revealEverythingNow, 5000);

  function loadScript(src, isModule) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      if (isModule) s.type = 'module';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.body.appendChild(s);
    });
  }

  // navigator.connection es de Chrome/Edge (igual que Web Serial, que
  // ErgoAI ya requiere para el buzzer) — donde no exista, simplemente no
  // se detecta nada especial y se cargan los efectos normal.
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isSlowConnection = !!(
    conn &&
    (conn.saveData === true || ['slow-2g', '2g', '3g'].includes(conn.effectiveType))
  );

  async function startDecorative() {
    if (isSlowConnection) {
      console.info('ErgoAI: conexión lenta o "modo ahorro de datos" detectado — se omiten los efectos decorativos (fondo 3D, partículas, animaciones de scroll) para no gastar datos ni rendimiento en lo que no es la cámara/IA/placa.');
      clearTimeout(safetyNetId);
      revealEverythingNow();
      return;
    }

    // Motion + GSAP/ScrollTrigger/Lenis, en orden: effects.js (más abajo)
    // los usa a los cuatro juntos, así que tienen que estar listos ANTES
    // de que effects.js corra — si uno falla, los demás igual se
    // intentan (Promise.allSettled), y effects.js ya sabe convivir con
    // que falte alguno (revisa "typeof X !== 'undefined'" antes de usarlo).
    await Promise.allSettled([
      loadScript('vendor/motion.min.js'),
      loadScript('vendor/gsap.min.js').then(() => loadScript('vendor/ScrollTrigger.min.js')),
      loadScript('vendor/lenis.min.js'),
    ]);

    loadScript('js/effects.js').catch((err) => {
      console.warn('ErgoAI:', err.message);
      revealEverythingNow();
    });

    // El fondo 3D es aparte (más pesado, y su propio módulo ya se pausa
    // solo mientras la cámara está conectada) — que uno falle no debe
    // tumbar al otro.
    loadScript('js/three-bg.js', true).catch((err) => console.warn('ErgoAI:', err.message));
  }

  if (document.readyState === 'complete') {
    startDecorative();
  } else {
    window.addEventListener('load', startDecorative, { once: true });
  }
})();
