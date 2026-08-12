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
con sonido, con una placa física (LED + buzzer), lleva tu racha de buena postura, y guarda
tu historial.

Además, se conecta por **cable USB** a una placa con un LED RGB y un buzzer (una
IdeaBoard) — **requerida para la demo de la feria**: luz verde = buena postura, luz
ámbar = postura dudosa, luz roja + buzzer = mala postura.

## Funciones principales

- 📷 **Cámara universal**: funciona con la cámara de cualquier computadora, tablet o
  celular. No necesita IP, ni red WiFi especial, ni instalar nada — solo abrir el link
  y dar permiso de cámara.
- 🎯 **Calibración personal**: en vez de un número genérico, el sistema aprende TU
  propia postura correcta (3 señales: hombros, cadera y cabeza).
- 🚦 **3 estados reales**: buena / atención / mala postura — no solo bueno-o-malo — los
  mismos 3 que ve reflejados la placa física.
- 📈 **Sesión en vivo**: línea de tiempo en tiempo real de los últimos minutos de tu
  conexión — pensada para que aunque acabes de conectarte (como en la feria) veas datos
  genuinos, sin necesitar días de historial acumulado.
- 🔥 **Racha en tiempo real**: contador de días seguidos y porcentaje del día en buena
  postura, calculado con datos reales (guardado en `localStorage`).
- 📊 **Historial**: gráfica de los últimos 7 días, con tooltips propios y vista en tabla.
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
| Interfaz | HTML, CSS y JavaScript puro (sin frameworks) |
| Detección de postura (web) | [MediaPipe Pose](https://developers.google.com/mediapipe) (corre en el navegador) |
| Detección de postura (escritorio) | MediaPipe Pose + OpenCV, en Python (`desktop/`) |
| Cámara | La del propio dispositivo, vía `getUserMedia` (web) u OpenCV (escritorio) |
| Alerta física (requerida en feria) | IdeaBoard (CircuitPython), por USB — desde el navegador (Web Serial API) o desde Python (`pyserial`) |
| Guardado de progreso | `localStorage` del navegador (sin servidor/base de datos) |
| Hosting | GitHub Pages |

## Estructura del proyecto

```
ErgoAI/
├── index.html              # Estructura de la página
├── style.css                # Todo el diseño visual
├── app.js                   # Lógica: IA, cámara, racha, notificaciones, buzzer
├── manifest.json             # Para poder "instalar" la página como app
├── assets/                   # Logo e íconos
├── hardware/
│   ├── ideaboard_buzzer/
│   │   └── code.py               # Programa de la placa del buzzer (CircuitPython)
│   └── esp32cam_stream/          # (Legado) streaming por WiFi — ya no se usa en la app
│       └── esp32cam_stream.ino
└── desktop/
    ├── posture_detector.py       # Modo escritorio: cámara + IA + buzzer, en Python
    └── requirements.txt
```

## Cómo correrlo localmente

Es un sitio 100% estático — no necesita instalar nada especial:

```bash
python -m http.server 8000
```

Y abre `http://localhost:8000` en tu navegador. La cámara solo funciona en `https://`
o en `localhost` — es una regla de seguridad de los navegadores, no un error nuestro.

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
como alternativa en esos casos. El resto de ErgoAI (cámara, IA, racha, historial)
funciona completo incluso sin la placa conectada.

> `hardware/esp32cam_stream/` es una versión anterior del proyecto (cámara dedicada
> ESP32-CAM transmitiendo por WiFi) que ya no está conectada a la interfaz actual —
> se dejó en el repositorio como referencia. Si algún día la vuelves a usar, recuerda
> nunca subir tu contraseña real de WiFi a un repositorio público.

## Modo escritorio (Kesta 7)

`desktop/posture_detector.py` es un programa aparte en Python: abre la cámara con
OpenCV, detecta tu postura con MediaPipe Pose usando **tres señales** (inclinación de
hombros, inclinación de cadera, y qué tan alta está tu cabeza respecto a tus hombros),
muestra una ventana con el esqueleto dibujado encima, y le manda el resultado a la
IdeaBoard por el mismo cable USB.

Es una alternativa a controlar el buzzer desde la página web — no necesita navegador,
y es una buena opción para dejar corriendo en la mesa de la feria con su propia
ventana. Usa el mismo protocolo de texto (`GOOD`/`ATTENTION`/`BAD`/`OFF`) que
`hardware/ideaboard_buzzer/code.py` ya entiende, así que **cualquiera de los dos**
—la web o este script— puede controlar la placa, pero no los dos al mismo tiempo (el
puerto USB solo lo puede tener abierto un programa a la vez).

Para correrlo:

```bash
cd desktop
pip install -r requirements.txt
python posture_detector.py
```

Antes de correrlo, revisa que la constante `PUERTO` al inicio del archivo tenga el
COM correcto de tu IdeaBoard (Administrador de dispositivos → Puertos (COM y LPT), en
Windows). Si el puerto está mal o alguien más lo tiene abierto, el programa ahora te
lo dice claro y te muestra qué puertos sí están disponibles, en vez de cerrarse con un
error críptico. Para salir, con la ventana de la cámara activa, presiona `ESC`.

---

Hecho con 💙 por el equipo **Kesta** — GHS.
