/* ============================================================
   ErgoAI — Fondo 3D interactivo (Kesta 12, aligerado en Kesta 13)
   ------------------------------------------------------------
   Nota sobre por qué esto NO es "React Three Fiber": R3F es solo la
   envoltura de React para Three.js — Three.js "de a pie" (el que se
   usa aquí) funciona exactamente igual sin React. Este archivo crea
   una nube de puntos en 3D, detrás de todo el contenido, que gira
   despacio sola y además reacciona un poco a hacia dónde apunta el
   mouse (un "paralaje" suave).

   Es un módulo de JavaScript (type="module", cargado por js/loader.js)
   para poder usar `import`. Kesta 13: three.module.js ya NO viene del
   CDN — está autohospedado en vendor/ (ver README) para no depender de
   internet de terceros el día de la feria, y este script se carga de
   último a propósito, después de que la cámara/IA ya estén listas.

   A propósito vive separado de app.js y de effects.js: si el
   navegador no tiene WebGL, o el archivo no carga, esto falla solo
   (try/catch) y el resto de ErgoAI — lo que de verdad importa para la
   feria — sigue funcionando igual. Y se pausa solo mientras la cámara
   está conectada (ver el listener de 'ergoai:camera' más abajo), para
   no competirle presupuesto de GPU a la detección de postura.
   ============================================================ */

try {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.getElementById('threeCanvas');

  if (canvas && !prefersReducedMotion) {
    const THREE = await import('../vendor/three.module.min.js');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 9;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    // Arreglo (Kesta 13): tope al pixel ratio MÁS bajo que antes (1 en
    // vez de 1.5) — en pantallas 4K/retina, pedir el pixel ratio completo
    // puede costar mucho más GPU sin verse mejor. La cámara y la IA de
    // postura son la prioridad de esta página, no este fondo.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // ---------- La nube de puntos: una esfera hecha de partículas ----------
    // Arreglo (Kesta 13): menos puntos que antes (era 900) — la mitad de
    // los vértices para dibujar, la mitad de la memoria de video.
    const COUNT = 420;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    // Paleta del logo (teal, naranja, coral, rosa, morado) — los mismos
    // colores de marca que ya usa el resto del sitio.
    const palette = [
      [0x16 / 255, 0xc9 / 255, 0xc9 / 255],
      [0xff / 255, 0x7a / 255, 0x29 / 255],
      [0xff / 255, 0x4d / 255, 0x6a / 255],
      [0xee / 255, 0x1f / 255, 0x8f / 255],
      [0x8b / 255, 0x2f / 255, 0xf0 / 255],
    ];

    for (let i = 0; i < COUNT; i++) {
      // Distribución pareja sobre una esfera (evita que se amontonen en
      // los polos, como pasaría con coordenadas esféricas al azar simples).
      const radius = 4.6 + Math.random() * 0.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.055,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ---------- Reacciona al cursor: un "paralaje" suave, no un giro brusco ----------
    let targetX = 0;
    let targetY = 0;
    window.addEventListener('pointermove', (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2; // -1 .. 1
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ---------- Bucle de dibujo, limitado a ~24fps ----------
    // Es un fondo decorativo — no necesita los 60fps completos, y así le
    // deja más presupuesto de CPU/GPU a lo que de verdad importa (la
    // cámara + MediaPipe). Se pausa solo si la pestaña no está visible
    // O si la cámara de ErgoAI está conectada (evento 'ergoai:camera',
    // que manda app.js) — esto es lo que de verdad soluciona el "lag al
    // abrir la cámara": mientras estás usando la función que SÍ importa,
    // este fondo deja de dibujar por completo, no solo más lento.
    const FRAME_INTERVAL = 1000 / 24;
    let lastFrameTime = 0;
    let tabVisible = !document.hidden;
    let cameraActive = false;

    function shouldRun() {
      return tabVisible && !cameraActive;
    }

    function animate(now) {
      if (!shouldRun()) return;
      requestAnimationFrame(animate);
      if (now - lastFrameTime < FRAME_INTERVAL) return;
      lastFrameTime = now;

      points.rotation.y += 0.0009;
      points.rotation.x += 0.0002;

      // Suaviza el movimiento del cursor hacia la cámara (lerp), en vez
      // de saltar directo — se siente "amortiguado", no nervioso.
      camera.position.x += (targetX * 1.2 - camera.position.x) * 0.03;
      camera.position.y += (-targetY * 1.2 - camera.position.y) * 0.03;
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);

    document.addEventListener('visibilitychange', () => {
      tabVisible = !document.hidden;
      if (shouldRun()) requestAnimationFrame(animate);
    });

    window.addEventListener('ergoai:camera', (e) => {
      cameraActive = !!(e.detail && e.detail.connected);
      if (cameraActive) {
        // Deja el fondo limpio (nada a medio dibujar) mientras la cámara
        // está en uso, en vez de congelarlo en el último cuadro.
        renderer.clear();
      } else if (shouldRun()) {
        requestAnimationFrame(animate);
      }
    });
  }
} catch (err) {
  console.warn('ErgoAI: no se pudo cargar el fondo 3D (Three.js). El resto del sitio sigue funcionando igual.', err);
}
