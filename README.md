# ErgoAI 🧍

**Panel de control con Inteligencia Artificial para el seguimiento de buena postura, en tiempo real.**

Proyecto de la feria científica — Equipo **Kesta**, GHS.

🔗 **Demo en vivo:** https://jomaker2025-hash.github.io/ErgoAI/

---

## ¿Qué hace?

ErgoAI observa tu postura a través de una cámara (la de tu computadora/celular, o una
ESP32-CAM dedicada) y usa un modelo de Inteligencia Artificial de detección de pose
(**MediaPipe Pose**, de Google) — corriendo completo dentro del navegador, sin enviar
video a ningún servidor — para calcular el ángulo entre tu oreja y tu hombro. Si ese
ángulo se abre demasiado (cabeza hacia adelante), el sistema detecta "mala postura" y
te avisa, lleva tu racha de buena postura, y guarda tu historial.

## Funciones principales

- 📷 **Dos formas de conectar cámara**: la de tu propio dispositivo (webcam/celular) o
  una **ESP32-CAM** por WiFi.
- 🎯 **Calibración personal**: en vez de un ángulo genérico, el sistema aprende TU
  propia postura correcta.
- 🔥 **Racha en tiempo real**: contador de días seguidos y porcentaje del día en buena
  postura, calculado con datos reales (guardado en `localStorage`).
- 📊 **Historial**: gráfica de los últimos 7 días.
- 🔔 **Alertas**: sonido + notificación cuando llevas tiempo prolongado en mala
  postura, y recordatorios de pausas activas cada 30 minutos.
- 🖥️ **Modo presentación**: pantalla completa pensada para mostrar el proyecto a los
  jueces.
- 📱 Diseño responsivo — funciona en computadora, tablet y celular.

## Tecnología

| Parte | Tecnología |
|---|---|
| Interfaz | HTML, CSS y JavaScript puro (sin frameworks) |
| Detección de postura | [MediaPipe Pose](https://developers.google.com/mediapipe) (corre en el navegador) |
| Cámara dedicada | ESP32-CAM (AI-Thinker), streaming MJPEG por WiFi |
| Guardado de progreso | `localStorage` del navegador (sin servidor/base de datos) |
| Hosting | GitHub Pages |

## Estructura del proyecto

```
ErgoAI/
├── index.html              # Estructura de la página
├── style.css                # Todo el diseño visual
├── app.js                   # Lógica: IA, cámara, racha, notificaciones
├── manifest.json             # Para poder "instalar" la página como app
├── assets/                   # Logo e íconos
└── hardware/
    └── esp32cam_stream/
        └── esp32cam_stream.ino   # Código para la placa ESP32-CAM
```

## Cómo correrlo localmente

Es un sitio 100% estático — no necesita instalar nada especial:

```bash
python -m http.server 8000
```

Y abre `http://localhost:8000` en tu navegador.

## Hardware

El código para la ESP32-CAM (`hardware/esp32cam_stream/esp32cam_stream.ino`) transmite
video en vivo por WiFi. Antes de subirlo a tu placa, reemplaza `TU_RED_WIFI` y
`TU_CONTRASEÑA_WIFI` por los datos reales de tu red (solo en tu copia local — nunca
subas esas credenciales a un repositorio público).

---

Hecho con 💙 por el equipo **Kesta** — GHS.
