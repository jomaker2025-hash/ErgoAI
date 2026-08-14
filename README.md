# ErgoAI 🧍

**Panel de control con Inteligencia Artificial para el seguimiento de buena postura, en tiempo real.**

Proyecto de la feria científica — Equipo **Kesta**, GHS.

🔗 **Demo en vivo:** https://jomaker2025-hash.github.io/ErgoAI/

---

## ¿Qué hace?

ErgoAI observa tu postura a través de **la cámara de tu propio dispositivo** (computadora,
tablet o celular — la que ya tienes, sin hardware extra) y usa un modelo de Inteligencia
Artificial de detección de pose (**MediaPipe Pose**, de Google) — corriendo completo dentro
del navegador, sin enviar video a ningún servidor — para leer 3 señales de tu cuerpo
(inclinación de hombros, inclinación de cadera y qué tan alta está tu cabeza) y clasificar
tu postura en **3 estados reales: buena, dudosa (atención) o mala**. Te avisa en pantalla,
con sonido, con una placa física (LED + buzzer), y guarda tu historial de los últimos días.

Además, se conecta por **cable USB** a una placa con un LED RGB y un buzzer (una
IdeaBoard) — **requerida para la demo de la feria**: luz verde = buena postura, luz
ámbar = postura dudosa, luz roja + buzzer = mala postura.

## Funciones principales

- 📷 **Cámara universal**: funciona con la cámara de cualquier computadora, tablet o
  celular. No necesita IP, ni red WiFi especial, ni instalar nada — solo abrir el link
  y dar permiso de cámara.
- 🎯 **Calibración personal**: en vez de un número genérico, el sistema aprende TU
  propia postura correcta (3 señales: hombros, cadera y cabeza).
- 🛡️ **Resistente a falsos positivos** (Kesta 13): si una mano tapa la cara/hombro un
  instante (rascarte, acomodarte el pelo) o si echas la cabeza muy atrás — lo primero
  que prueba alguien que no conoce el prototipo — ErgoAI no confía en ese cuadro y
  mantiene el último estado bueno, en vez de reportar un problema de postura falso.
- 🚦 **3 estados reales**: buena / atención / mala postura — no solo bueno-o-malo — los
  mismos 3 que ve reflejados la placa física.
- 📈 **Sesión en vivo**: línea de tiempo en tiempo real de los últimos minutos de tu
  conexión — pensada para que aunque acabes de conectarte (como en la feria) veas datos
  genuinos, sin necesitar días de historial acumulado.
- 📊 **Historial**: gráfica de los últimos 7 días, con tooltips propios y vista en tabla —
  datos reales, guardados en `localStorage`.
- 🔔 **Alertas**: sonido + notificación cuando llevas tiempo prolongado en mala
  postura, y recordatorios de pausas activas cada 30 minutos.
- 🔌 **Alerta física (requerida en la feria)**: LED + buzzer en una IdeaBoard aparte,
  conectada por USB (ve la sección de Hardware).
- 🖥️ **Modo presentación**: pantalla completa pensada para mostrar el proyecto a los
  jueces — avisa si falta conectar la cámara o la placa antes de entrar.
- 🖥️🐍 **Modo escritorio (Python)**: un programa aparte con OpenCV que detecta la
  postura con las mismas 3 señales y también controla el buzzer — ideal para la mesa
  de la feria (ve `desktop/`).
- 📖 **Sección educativa**: qué problemas causa la mala postura y cómo ayuda cada
  función de ErgoAI.
- 📱 Diseño responsivo — funciona en computadora, tablet y celular.

## Tecnología

| Parte | Tecnología |
|---|---|
| Interfaz | HTML + JavaScript puro (sin frameworks), estilos con Tailwind CSS + CSS a mano |
| Estilos | [Tailwind CSS v4](https://tailwindcss.com) (compilado con su CLI, ver abajo) para lo nuevo + `style.css` a mano para el diseño ya afinado de antes |
| Animaciones de scroll | [Motion](https://motion.dev) (sucesor vanilla de Framer Motion) para animar la entrada de las secciones; [GSAP](https://gsap.com) + ScrollTrigger para animaciones atadas al progreso del scroll |
| Scroll suave | [Lenis](https://lenis.darkroom.engineering) (Studio Freight) |
| Detección de postura (web) | [MediaPipe Pose](https://developers.google.com/mediapipe) (corre en el navegador, con un bucle propio de envío de cuadros — no la utilidad "Camera" de MediaPipe, que abre su propio acceso a la cámara por dentro y causaba conflictos) |
| Detección de postura (escritorio) | MediaPipe Pose + OpenCV, en Python (`desktop/`) |
| Cámara | La del propio dispositivo, vía `getUserMedia` (web) u OpenCV (escritorio) |
| Alerta física (requerida en feria) | IdeaBoard (CircuitPython), por USB — desde el navegador (Web Serial API) o desde Python (`pyserial`) |
| Guardado de progreso | `localStorage` del navegador (sin servidor/base de datos) |
| Hosting | GitHub Pages |

> **¿Por qué no shadcn/ui?** Es una herramienta exclusiva de React (genera
> componentes `.tsx`) — no existe para HTML/CSS/JS puro. En vez de
> reescribir todo ErgoAI en React (con el riesgo de tener que volver a
> probar a fondo la cámara/IA/placa justo antes de la feria), se recreó el
> mismo lenguaje visual a mano con Tailwind (`.ui-btn`, `.ui-card`,
> `.ui-badge` en `styles/tailwind.css`).
>
> **¿Y el fondo 3D con Three.js/React Three Fiber que hubo?** Se probó
> (Kesta 12) con Three.js puro (sin necesidad de React) y se quitó por
> completo en Kesta 16: aunque en Kesta 15 se corrigió una condición de
> carrera que lo hacía encender sin saber que la cámara ya estaba en uso,
> en la computadora del colegio (gráficos más modestos, imposible de
> probar de forma remota) seguía congelando el sistema al activar la
> cámara. Para una demo de feria, confiable importa más que bonito.

## Estructura del proyecto

```
ErgoAI/
├── index.html                # Estructura de la página
├── style.css                  # Diseño visual ya afinado (Kesta 1-11)
├── tailwind.build.css         # Tailwind ya compilado — el que de verdad sirve GitHub Pages
├── styles/
│   └── tailwind.css               # Entrada de Tailwind: tema + "componentes base" + efectos Aceternity
├── app.js                     # Lógica: IA, cámara, historial, notificaciones, buzzer
├── js/
│   ├── loader.js                  # Carga lo decorativo DESPUÉS de lo crítico (ver "Rendimiento")
│   └── effects.js                 # Lenis, GSAP/ScrollTrigger, Motion (entrada al hacer scroll), partículas
├── vendor/                    # Motion/GSAP/ScrollTrigger/Lenis autohospedados (ver "Rendimiento")
├── package.json                # Solo para compilar Tailwind — el sitio en sí no necesita Node
├── manifest.json              # Para poder "instalar" la página como app
├── assets/                    # Logo e íconos
├── hardware/
│   ├── ideaboard_buzzer/
│   │   └── code.py               # Programa de la placa del buzzer (CircuitPython)
│   └── esp32cam_stream/          # (Legado) streaming por WiFi — ya no se usa en la app
│       └── esp32cam_stream.ino
└── desktop/
    ├── posture_detector.py       # Modo escritorio: cámara + IA + buzzer, en Python
    ├── requirements.txt
    ├── calibracion.json          # (se genera solo, no se sube) tu calibración guardada
    └── ergoai_log.jsonl          # (se genera solo, no se sube) registro de la sesión
```

## Cómo correrlo localmente

Es un sitio 100% estático — el `tailwind.build.css` ya viene compilado y
subido al repositorio, así que para solo VERLO no hace falta instalar nada:

```bash
python -m http.server 8000
```

Node/npm solo hacen falta si vas a **editar los estilos de Tailwind**
(clases nuevas en `styles/tailwind.css` o clases de Tailwind en
`index.html`):

```bash
npm install          # una sola vez
npm run watch:css    # recompila solo mientras editas
npm run build:css    # compila una vez (antes de subir tus cambios)
```

Si olvidas correr `npm run build:css` antes de subir un cambio de estilos,
la página seguirá funcionando — solo que con el CSS compilado más viejo,
sin tu cambio nuevo.

Y abre `http://localhost:8000` en tu navegador. La cámara solo funciona en `https://`
o en `localhost` — es una regla de seguridad de los navegadores, no un error nuestro.

## Rendimiento (Kesta 13)

Kesta 12 agregó bastantes librerías decorativas (Tailwind, Motion, GSAP,
ScrollTrigger, Lenis, Three.js) y eso, en la práctica, metió lag — sobre
todo grave con mal internet. Kesta 13 lo reorganizó así:

- **Todo lo decorativo está autohospedado** en `vendor/` — ya NO se
  descarga de un CDN externo (jsdelivr). Solo MediaPipe (la IA de
  postura) sigue viniendo de un CDN, porque sus modelos son demasiado
  grandes para guardarlos en el repositorio.
- **Lo decorativo se carga DESPUÉS de que la página ya esté lista**
  (`js/loader.js`, después del evento `load`) — la cámara, la IA y la
  placa nunca esperan a Motion/GSAP/Lenis.
- **En conexiones lentas o con "modo ahorro de datos" activado**
  (`navigator.connection`), lo decorativo se **salta por completo** —
  cero bytes de más. Las secciones se muestran de una vez, sin animación
  de entrada, en vez de arriesgarse a quedar invisibles esperando una
  librería que nunca llegó a cargar.
- **Las partículas se PAUSAN mientras la cámara está conectada** (evento
  `ergoai:camera`, que manda `app.js`) — mientras estás usando la
  función que de verdad importa, nada decorativo le compite presupuesto
  de CPU a MediaPipe.
- Menos partículas por pantalla, tope de resolución más bajo.

**Kesta 15 y 16 — "se congela la computadora al activar la cámara":**
había también un fondo 3D interactivo con Three.js. Como todo lo
decorativo se carga DESPUÉS de la página (ver arriba), si activabas la
cámara justo mientras esa librería seguía cargando, el aviso de "la
cámara ya está prendida" se podía perder — y el fondo 3D encendía un
contexto WebGL entero sin saber que la IA ya estaba usando la
cámara/GPU. En computadoras con gráficos integrados modestos (como la
del colegio), dos cosas así peleando por el mismo recurso puede
congelar todo el sistema, no solo la pestaña. Kesta 15 arregló la
condición de carrera que lo causaba, pero como seguía pasando en la
computadora del colegio (imposible de probar de forma remota), **Kesta
16 quitó el fondo 3D por completo** — para una demo de feria, confiable
importa más que bonito. Las partículas (canvas 2D, mucho más livianas,
sin WebGL) se quedaron.

Si aun así notas lag en una computadora en particular, lo más rápido es
abrir la consola del navegador (F12) — `js/loader.js` avisa ahí mismo si
detectó una conexión lenta y decidió saltarse los efectos.

## Hardware: alerta física (requerida en la feria)

`hardware/ideaboard_buzzer/code.py` es el programa que corre **dentro de la placa**
(una IdeaBoard con CircuitPython, con un LED RGB y un buzzer conectado a `IO4`). Se
queda esperando comandos de texto por el cable USB (`GOOD`, `ATTENTION`, `BAD`, `OFF`)
y según cuál reciba, prende el LED de un color y activa o no el buzzer:

- `GOOD` → luz verde, buzzer apagado.
- `ATTENTION` → luz ámbar, buzzer apagado (postura dudosa — aviso temprano).
- `BAD` → luz roja + buzzer sonando (mala postura).

Para usarlo:
1. Conecta la placa a la computadora por USB (con `code.py` ya cargado en ella).
2. En ErgoAI, abre la cámara normalmente.
3. En la sección "🔌 Placa de alerta física", dale clic a **Conectar placa** y elige
   el puerto de la placa en la ventana que abre el navegador.
4. Listo — el LED y el buzzer reflejan tu postura real en tiempo real, sin retraso.

Esto usa la **Web Serial API**, disponible solo en Chrome/Edge de computadora (no en
celular, no en Firefox/Safari) — por eso el modo escritorio en Python (abajo) existe
como alternativa en esos casos. El resto de ErgoAI (cámara, IA, historial)
funciona completo incluso sin la placa conectada.

> **En una computadora nueva** (donde nunca se ha conectado esta placa), si la lista
> de puertos aparece vacía al hacer clic en "Conectar placa", probablemente falta el
> driver **CH340** — es gratis, se instala en un minuto, y solo hace falta una vez
> por computadora.

> `hardware/esp32cam_stream/` es una versión anterior del proyecto (cámara dedicada
> ESP32-CAM transmitiendo por WiFi) que ya no está conectada a la interfaz actual —
> se dejó en el repositorio como referencia. Si algún día la vuelves a usar, recuerda
> nunca subir tu contraseña real de WiFi a un repositorio público.

## Modo escritorio (Kesta 9)

`desktop/posture_detector.py` es un programa aparte en Python, pensado para dejarlo
corriendo sin supervisión en la mesa de la feria: abre la cámara con OpenCV, detecta tu
postura con MediaPipe Pose usando **7 señales** (inclinación de hombros, inclinación de
cadera, altura de la cabeza, cabeza adelantada hacia la pantalla, hombros
encorvados/reclinados, inclinación lateral del torso, y espalda encorvada/joroba),
muestra una ventana con el esqueleto y el detalle de qué está mal, y le manda el
resultado a la IdeaBoard por el mismo cable USB.

Es una alternativa a controlar el buzzer desde la página web — no necesita navegador,
y es la opción recomendada para la mesa de la feria. Usa el mismo protocolo de texto
(`GOOD`/`ATTENTION`/`BAD`/`OFF`) que `hardware/ideaboard_buzzer/code.py` ya entiende,
así que **cualquiera de los dos** —la web o este script— puede controlar la placa, pero
no los dos al mismo tiempo (el puerto USB solo lo puede tener abierto un programa a la vez).

Pensado para correr solo, sin que nadie esté pendiente:
- **Calibración que se guarda sola**: presiona `c` con buena postura y queda guardada
  en `desktop/calibracion.json` — la próxima vez que abras el script ya la carga sola,
  no hay que repetirla cada vez.
- **Filtra el temblor de la cámara**: cada métrica se suaviza con la mediana de los
  últimos 8 cuadros, y un cambio de estado necesita 3 lecturas seguidas antes de
  confirmarse — así un parpadeo de un instante no manda un estado falso a la placa.
- **Se reconecta solo**: si se pierde la señal de la cámara o el cable de la
  IdeaBoard se desconecta, reintenta solo cada pocos segundos en vez de cerrarse.
- **Se cierra bien**: detecta si cierras la ventana con la X (no solo con ESC/Q), y
  siempre apaga el buzzer y libera la cámara al salir, incluso si algo falla a medio camino.
- **Registro de la sesión**: cada cambio de estado (con sus métricas y motivos) y un
  resumen final (cuánto tiempo en cada estado) se guardan en `desktop/ergoai_log.jsonl`
  — pensado como paso intermedio para más adelante conectarlo con el dashboard web.

Para correrlo:

```bash
cd desktop
pip install -r requirements.txt
python posture_detector.py
```

Antes de correrlo, revisa que la constante `PUERTO` al inicio del archivo tenga el
COM correcto de tu IdeaBoard (Administrador de dispositivos → Puertos (COM y LPT), en
Windows). Si el puerto está mal o alguien más lo tiene abierto, el programa te lo dice
claro en vez de cerrarse con un error críptico. Para salir: `ESC`, `Q`, o cerrar la
ventana con la X — cualquiera de las tres apaga bien el buzzer antes de terminar.

---

Hecho con 💙 por el equipo **Kesta** — GHS.
