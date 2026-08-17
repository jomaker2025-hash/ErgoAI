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
- 🛡️ **Resistente a falsos positivos y reacciona rápido**: si una mano tapa la
  cara/hombro un instante (rascarte, acomodarte el pelo), ErgoAI no confía en ese
  cuadro y mantiene el último estado bueno. Si echas la cabeza muy atrás — lo primero
  que prueba alguien que no conoce el prototipo — lo reconoce DE INMEDIATO como mala
  postura (Kesta 19), en vez de ignorarlo y sentirse "roto" un rato (Kesta 13-14).
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
| Interfaz | HTML, CSS y JavaScript puro — sin frameworks, sin build, sin dependencias de Node |
| Detección de postura (web) | [MediaPipe Pose](https://developers.google.com/mediapipe) (corre en el navegador, con un bucle propio de envío de cuadros — no la utilidad "Camera" de MediaPipe, que abre su propio acceso a la cámara por dentro y causaba conflictos) |
| Detección de postura (escritorio) | MediaPipe Pose + OpenCV, en Python (`desktop/`) |
| Cámara | La del propio dispositivo, vía `getUserMedia` (web) u OpenCV (escritorio) |
| Alerta física (requerida en feria) | IdeaBoard (CircuitPython), por USB — desde el navegador (Web Serial API) o desde Python (`pyserial`) |
| Guardado de progreso | `localStorage` del navegador (sin servidor/base de datos) |
| Hosting | GitHub Pages |

> **Nota de historial:** entre Kesta 12 y Kesta 17 este proyecto tuvo, por
> un tiempo, Tailwind CSS, GSAP, Lenis, Motion y un fondo 3D interactivo
> con Three.js — un acabado visual más elaborado. Se quitó todo por
> completo en Kesta 18: esas librerías, sumadas al uso normal de la
> cámara/IA, terminaban congelando computadoras con gráficos más modestos
> (como la del colegio) — y para una demo de feria, **confiable importa
> más que bonito**. Lo que sí se quedó, porque son arreglos reales a la
> cámara/IA/placa (no decoración): la detección resistente a que una mano
> tape la cara, el modelo de IA más liviano, el límite de resolución de
> cámara, y que el historial/sesión en vivo no se redibujen sin necesidad.

## Estructura del proyecto

```
ErgoAI/
├── index.html                # Estructura de la página
├── style.css                  # Todo el diseño visual
├── app.js                     # Lógica: IA, cámara, historial, notificaciones, buzzer
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

Es un sitio 100% estático — no necesita instalar nada especial:

```bash
python -m http.server 8000
```

Y abre `http://localhost:8000` en tu navegador. La cámara solo funciona en `https://`
o en `localhost` — es una regla de seguridad de los navegadores, no un error nuestro.

## Rendimiento y confiabilidad (Kesta 17-18)

El congelamiento de la computadora al activar la cámara (reportado sobre
todo en la compu del colegio, con gráficos más modestos) llevó a dos
decisiones:

- **Se quitó todo lo decorativo agregado en Kesta 12-16** (Tailwind,
  GSAP, Lenis, Motion, el fondo 3D con Three.js, las partículas) — no
  aportaban a la función real del proyecto, y cada una sumaba trabajo de
  más justo cuando la cámara/IA más lo necesitan. Confiable > bonito.
- **MediaPipe usa la tarjeta gráfica por dentro** (con o sin nuestras
  propias animaciones) — así que además se bajó `modelComplexity` de 1
  ("Full") a 0 ("Lite") y se limitó la resolución que le pide a la
  cámara (480×360 en vez de sin límite). Nuestras 3 señales (hombros,
  cadera, cabeza) son puntos grandes y fáciles de rastrear; no hacía
  falta el modelo completo.

Aparte, dos bugs reales encontrados en una auditoría de rendimiento (no
relacionados con lo decorativo, así que se quedaron):
- El historial de 7 días y la sesión en vivo se **redibujaban enteros**
  cada 1-2 segundos mientras había cámara conectada, aunque casi nada
  hubiera cambiado — el mismo tipo de bug que causó el "tembleque" de la
  racha en Kesta 10, solo que nadie se había dado cuenta de que seguía
  pasando en otros módulos. Ahora solo se actualiza lo que de verdad
  cambió.
- Una función (`animateValue`) que ya no la llamaba nadie desde que se
  quitó la racha en Kesta 10.

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
