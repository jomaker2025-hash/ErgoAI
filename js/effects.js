/* ============================================================
   ErgoAI — Efectos visuales decorativos (Kesta 12)
   ------------------------------------------------------------
   TODO lo de este archivo es decorativo: scroll suave (Lenis),
   animaciones atadas al scroll (GSAP + ScrollTrigger), animación de
   entrada de secciones (Motion) y un fondo de partículas en canvas.

   A propósito vive separado de app.js: si algo de aquí falla (una
   librería no cargó, el navegador es muy viejo, etc.) el resto de
   ErgoAI — cámara, IA, placa — no se entera y sigue funcionando
   exactamente igual. Cada bloque está en su propio try/catch por la
   misma razón: que un efecto roto no apague a los demás.

   Respeta "prefiero menos movimiento" (accesibilidad) y evita cargar
   la máquina de más: la cámara + la IA de postura ya son lo más
   importante que corre en esta página, así que estos efectos están
   pensados para ser livianos.
   ============================================================ */

(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ============================================================
  // 1. Lenis — scroll suave en toda la página
  // ============================================================
  let lenis = null;
  try {
    if (!prefersReducedMotion && typeof Lenis !== 'undefined') {
      lenis = new Lenis({
        duration: 1.1,
        smoothWheel: true,
      });
    }
  } catch (err) {
    console.warn('ErgoAI: no se pudo iniciar el scroll suave (Lenis).', err);
  }

  // ============================================================
  // 2. GSAP + ScrollTrigger — animaciones atadas a la posición del scroll
  // ============================================================
  try {
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      // Lenis y GSAP necesitan compartir el mismo "reloj" (ticker) para
      // que las animaciones atadas al scroll no se desfasen del scroll
      // suave — es la integración oficial recomendada por Lenis.
      if (lenis) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      }

      // Efecto de "profundidad": las manchas de fondo (.bg-glow) se
      // mueven un poco más lento que el resto de la página al hacer
      // scroll (paralaje sutil) — nada agresivo, solo un acabado premium.
      const bgGlow = document.querySelector('.bg-glow');
      if (bgGlow && !prefersReducedMotion) {
        gsap.to(bgGlow, {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: {
            trigger: document.body,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 0.6,
          },
        });
      }

      // El anillo con gradiente alrededor de la tarjeta de estado se
      // "asienta" (de más chico y transparente a su tamaño real) según
      // qué tanto ha entrado en pantalla — una animación "compleja" real
      // atada al progreso del scroll, no solo un on/off.
      const borderRing = document.querySelector('.aceternity-border');
      if (borderRing && !prefersReducedMotion) {
        gsap.fromTo(
          borderRing,
          { scale: 0.94, opacity: 0.6 },
          {
            scale: 1,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: borderRing,
              start: 'top 90%',
              end: 'top 40%',
              scrub: 0.6,
            },
          }
        );
      }
    }
  } catch (err) {
    console.warn('ErgoAI: no se pudieron iniciar las animaciones de scroll (GSAP).', err);
  }

  // ============================================================
  // 3. Motion — animación de entrada de las secciones al hacer scroll
  //    (el sucesor vanilla de Framer Motion, ya usado en app.js)
  // ============================================================
  try {
    const M = window.Motion;
    if (M && typeof M.inView === 'function' && typeof M.animate === 'function') {
      const targets = document.querySelectorAll('.reveal-on-scroll');
      targets.forEach((el, i) => {
        M.inView(
          el,
          () => {
            M.animate(
              el,
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: [0, 1], transform: ['translateY(24px)', 'translateY(0px)'] },
              { duration: prefersReducedMotion ? 0.01 : 0.7, delay: (i % 4) * 0.05, easing: [0.22, 1, 0.36, 1] }
            );
          },
          { amount: 0.2 }
        );
      });
    } else {
      // Si Motion no cargó (sin internet, CDN caído…), no dejes las
      // secciones invisibles para siempre — muéstralas de una vez.
      document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    }
  } catch (err) {
    console.warn('ErgoAI: no se pudo animar la entrada de las secciones.', err);
    document.querySelectorAll('.reveal-on-scroll').forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }

  // ============================================================
  // 4. Fondo de partículas (estilo Aceternity) — canvas 2D a mano
  // ============================================================
  try {
    const canvas = document.getElementById('particleCanvas');
    if (canvas && !prefersReducedMotion) {
      const ctx = canvas.getContext('2d');
      const COLORS = ['#16c9c9', '#ff7a29', '#ee1f8f', '#8b2ff0'];
      let particles = [];
      let width = 0;
      let height = 0;
      // Arreglo (Kesta 13): tope de pixel ratio más bajo (era 2) — en un
      // canvas del tamaño de toda la pantalla, esto es la diferencia
      // entre dibujar ~2 millones de píxeles por cuadro o el doble.
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      let rafId = null;
      let cameraActive = false;

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Arreglo (Kesta 13): menos partículas por pantalla (antes 1 cada
        // 14 000px², tope 70) y tope más bajo — en una pantalla de feria
        // (proyector, TV grande) el conteo antes se disparaba.
        const targetCount = Math.min(45, Math.round((width * height) / 20000));
        particles = Array.from({ length: targetCount }, () => makeParticle());
      }

      function makeParticle() {
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          r: 1 + Math.random() * 1.8,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          alpha: 0.15 + Math.random() * 0.35,
        };
      }

      function tick() {
        ctx.clearRect(0, 0, width, height);
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          // Que reaparezcan del otro lado en vez de "morir" en el borde
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;
          if (p.y < -10) p.y = height + 10;
          if (p.y > height + 10) p.y = -10;

          ctx.beginPath();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        rafId = requestAnimationFrame(tick);
      }

      resize();
      window.addEventListener('resize', resize);
      rafId = requestAnimationFrame(tick);

      function pause() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }
      function resume() {
        if (!rafId && !document.hidden && !cameraActive) rafId = requestAnimationFrame(tick);
      }

      // Pausa el dibujo si la pestaña no está visible (ahorra batería/CPU
      // sin razón — el usuario ni lo va a ver) y lo retoma al volver.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause();
        else resume();
      });

      // Arreglo (Kesta 13): pausa TAMBIÉN mientras la cámara de ErgoAI
      // está conectada (evento que manda app.js) — el dibujo de
      // partículas en canvas 2D es barato comparado con el fondo 3D,
      // pero sigue siendo trabajo de más justo cuando la IA de postura
      // necesita todo el rendimiento posible.
      window.addEventListener('ergoai:camera', (e) => {
        cameraActive = !!(e.detail && e.detail.connected);
        if (cameraActive) pause();
        else resume();
      });
    }
  } catch (err) {
    console.warn('ErgoAI: no se pudo dibujar el fondo de partículas.', err);
  }
})();
