# ============================================================
# ErgoAI — Modo escritorio (Kesta 7)
# ------------------------------------------------------------
# Programa aparte que corre en tu COMPUTADORA (no en el navegador):
# abre la cámara con OpenCV, detecta tu postura con MediaPipe Pose
# (versión de Python) usando TRES señales (hombros, cadera y
# posición de la cabeza), dibuja el esqueleto en una ventana, y le
# manda el resultado a la IdeaBoard por cable USB — el mismo
# protocolo de texto (GOOD/ATTENTION/BAD/OFF) que ya entiende
# hardware/ideaboard_buzzer/code.py.
#
# Es una alternativa a usar el buzzer desde la página web (que usa
# Web Serial desde Chrome/Edge): este script no necesita navegador,
# muestra el esqueleto detectado en una ventana de escritorio, y es
# una buena opción para la mesa de la feria.
#
# IMPORTANTE: la placa solo puede estar conectada a UN programa a
# la vez. Si ya la conectaste desde la página web (botón "Conectar
# placa"), desconéctala ahí antes de correr este script — y viceversa.
#
# Cómo correrlo:
#   1. pip install -r requirements.txt
#   2. Conecta la IdeaBoard por USB (con hardware/ideaboard_buzzer/code.py
#      ya cargado en ella) y cierra cualquier otro programa que use su
#      puerto (Mu, monitor serial, la página web, Arduino IDE...).
#   3. Revisa que PUERTO (abajo) sea el COM correcto — en Windows lo
#      ves en el Administrador de dispositivos > Puertos (COM y LPT).
#   4. python posture_detector.py
#   5. Para salir, con la ventana de la cámara activa, presiona ESC.
# ============================================================

import cv2
import mediapipe as mp
import math
import serial
import serial.tools.list_ports
import time


# =====================================================
# CONFIGURACIÓN
# =====================================================

PUERTO = "COM6"       # <-- CAMBIA POR EL COM DE TU IDEABOARD
BAUDRATE = 115200


# -----------------------------------------------------
# Umbrales
# -----------------------------------------------------

HOMBROS_MAX = 8
CADERA_MAX = 8

# Posición vertical de la cabeza
#
# Un valor ALTO significa que la cabeza está bien
# posicionada sobre los hombros.
#
# Un valor BAJO significa que la cabeza ha bajado.

CABEZA_GOOD = 0.27
CABEZA_ATTENTION = 0.23


# =====================================================
# CONEXIÓN CON IDEABOARD
# =====================================================
# Arreglo: antes, si el puerto estaba mal escrito, ocupado por otro
# programa, o la placa no estaba conectada, el script se cerraba de
# golpe con un traceback en inglés difícil de entender. Ahora te dice
# exactamente qué pasó y qué puertos SÍ están disponibles.

print("Conectando con IdeaBoard...")

board = None

try:
    board = serial.Serial(
        PUERTO,
        BAUDRATE,
        timeout=1
    )
    time.sleep(2)
    print("IdeaBoard conectada en", PUERTO)

except serial.SerialException as e:
    puertos = list(serial.tools.list_ports.comports())
    print("\n No se pudo abrir el puerto", PUERTO)
    print("   Detalle:", e)
    if puertos:
        print("\n   Puertos disponibles ahora mismo:")
        for p in puertos:
            print("    -", p.device, "—", p.description)
        print("\n   Revisa que PUERTO arriba en este archivo sea uno de estos.")
    else:
        print("\n   No se detectó ningún puerto serial. Revisa que la")
        print("   IdeaBoard esté conectada por USB.")
    print("\n   También revisa que ningún otro programa (Mu, el monitor")
    print("   serial del IDE, o la página web con el botón 'Conectar")
    print("   placa') tenga el puerto abierto — solo uno a la vez puede.")
    raise SystemExit(1)


# =====================================================
# MEDIAPIPE
# =====================================================

mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)


# =====================================================
# CÁMARA
# =====================================================

cap = cv2.VideoCapture(0)

# Arreglo: antes, si la cámara no abría (ocupada por otra app, o no
# existe la cámara 0), el programa no entraba nunca al loop principal
# y se cerraba sin decir nada — parecía "colgado" sin explicación.
if not cap.isOpened():
    print("\n No se pudo abrir la cámara (índice 0).")
    print("   Revisa que ninguna otra aplicación la esté usando (Zoom,")
    print("   Teams, la página web de ErgoAI en otra pestaña, etc.) y")
    print("   que esta computadora sí tenga una cámara conectada.")
    board.close()
    raise SystemExit(1)

postura_anterior = None


# =====================================================
# FUNCIÓN PARA CALCULAR INCLINACIÓN
# =====================================================

def calcular_inclinacion(p1, p2):

    dx = p2.x - p1.x
    dy = p2.y - p1.y

    angulo = math.degrees(
        math.atan2(dy, dx)
    )

    angulo = abs(angulo)

    if angulo > 90:
        angulo = 180 - angulo

    return angulo


# =====================================================
# LOOP PRINCIPAL
# =====================================================
# Todo el loop queda dentro de try/finally: si algo truena a medio
# camino (por ejemplo, desconectas la cámara de golpe), el bloque
# "finally" de más abajo igual apaga el buzzer y cierra todo en vez
# de dejar la placa sonando para siempre.

try:
    while cap.isOpened():

        ret, frame = cap.read()

        if not ret:
            print("No se pudo obtener imagen")
            break


        # -------------------------------------------------
        # ESPEJO
        # -------------------------------------------------

        frame = cv2.flip(frame, 1)


        # -------------------------------------------------
        # BGR → RGB
        # -------------------------------------------------

        rgb = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2RGB
        )


        # -------------------------------------------------
        # MEDIA PIPE
        # -------------------------------------------------

        results = pose.process(rgb)


        # =================================================
        # SI DETECTAMOS EL CUERPO
        # =================================================

        if results.pose_landmarks:

            landmarks = results.pose_landmarks.landmark


            # =============================================
            # NARIZ
            # =============================================

            nariz = landmarks[
                mp_pose.PoseLandmark.NOSE
            ]


            # =============================================
            # HOMBROS
            # =============================================

            hombro_izq = landmarks[
                mp_pose.PoseLandmark.LEFT_SHOULDER
            ]

            hombro_der = landmarks[
                mp_pose.PoseLandmark.RIGHT_SHOULDER
            ]


            # =============================================
            # CADERAS
            # =============================================

            cadera_izq = landmarks[
                mp_pose.PoseLandmark.LEFT_HIP
            ]

            cadera_der = landmarks[
                mp_pose.PoseLandmark.RIGHT_HIP
            ]


            # =============================================
            # CENTRO DE HOMBROS
            # =============================================

            hombro_x = (
                hombro_izq.x +
                hombro_der.x
            ) / 2

            hombro_y = (
                hombro_izq.y +
                hombro_der.y
            ) / 2


            # =============================================
            # CENTRO DE CADERAS
            # =============================================

            cadera_x = (
                cadera_izq.x +
                cadera_der.x
            ) / 2

            cadera_y = (
                cadera_izq.y +
                cadera_der.y
            ) / 2


            # =================================================
            # 1. INCLINACIÓN DE HOMBROS
            # =================================================

            inclinacion_hombros = calcular_inclinacion(
                hombro_izq,
                hombro_der
            )


            # =================================================
            # 2. INCLINACIÓN DE CADERA
            # =================================================

            inclinacion_cadera = calcular_inclinacion(
                cadera_izq,
                cadera_der
            )


            # =================================================
            # 3. POSICIÓN VERTICAL DE LA CABEZA
            # =================================================

            # Distancia vertical entre:
            #
            # centro de hombros
            #        ↓
            #       nariz

            distancia_cabeza = (
                hombro_y - nariz.y
            )


            # ---------------------------------------------
            # ANCHO DE HOMBROS
            # ---------------------------------------------

            ancho_hombros = math.sqrt(
                (hombro_der.x - hombro_izq.x) ** 2 +
                (hombro_der.y - hombro_izq.y) ** 2
            )


            # ---------------------------------------------
            # NORMALIZAR
            # ---------------------------------------------

            if ancho_hombros > 0:

                cabeza_ratio = (
                    distancia_cabeza /
                    ancho_hombros
                )

            else:

                cabeza_ratio = 0


            # =================================================
            # 4. ANALIZAR PROBLEMAS
            # =================================================

            problemas = 0


            # ---------------------------------------------
            # HOMBROS
            # ---------------------------------------------

            if inclinacion_hombros > HOMBROS_MAX:

                problemas += 1


            # ---------------------------------------------
            # CADERA
            # ---------------------------------------------

            if inclinacion_cadera > CADERA_MAX:

                problemas += 1


            # ---------------------------------------------
            # CABEZA
            # ---------------------------------------------

            cabeza_mala = False

            if cabeza_ratio < CABEZA_ATTENTION:

                cabeza_mala = True


            # =================================================
            # CLASIFICAR
            # =================================================

            if cabeza_ratio >= CABEZA_GOOD:

                # Cabeza correctamente posicionada

                if problemas == 0:

                    postura = "GOOD"
                    texto = "BUENA POSTURA"

                else:

                    postura = "ATTENTION"
                    texto = "ATENCION"


            elif cabeza_ratio >= CABEZA_ATTENTION:

                # Cabeza ligeramente baja

                postura = "ATTENTION"
                texto = "ATENCION"


            else:

                # Cabeza claramente baja

                postura = "BAD"
                texto = "MALA POSTURA"


            # =================================================
            # ENVIAR A IDEABOARD
            # =================================================

            if postura != postura_anterior:

                comando = postura + "\r\n"

                board.write(
                    comando.encode()
                )

                board.flush()

                print(
                    "Estado:",
                    postura,
                    "| Hombros:",
                    round(inclinacion_hombros, 1),
                    "| Cadera:",
                    round(inclinacion_cadera, 1),
                    "| Cabeza:",
                    round(cabeza_ratio, 2)
                )

                postura_anterior = postura


            # =================================================
            # DIBUJAR ESQUELETO
            # =================================================

            mp_drawing.draw_landmarks(
                frame,
                results.pose_landmarks,
                mp_pose.POSE_CONNECTIONS
            )


            # =================================================
            # INFORMACIÓN EN PANTALLA
            # =================================================

            cv2.putText(
                frame,
                texto,
                (30, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (255, 255, 255),
                2
            )


            cv2.putText(
                frame,
                f"Hombros: {inclinacion_hombros:.1f}",
                (30, 75),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )


            cv2.putText(
                frame,
                f"Cadera: {inclinacion_cadera:.1f}",
                (30, 105),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )


            cv2.putText(
                frame,
                f"Cabeza: {cabeza_ratio:.2f}",
                (30, 135),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )


            cv2.putText(
                frame,
                f"Problemas: {problemas}",
                (30, 165),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )


        else:

            cv2.putText(
                frame,
                "NO SE DETECTA EL CUERPO",
                (30, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255, 255, 255),
                2
            )


        # =================================================
        # MOSTRAR
        # =================================================

        cv2.imshow(
            "Detector de postura",
            frame
        )


        # =================================================
        # ESC
        # =================================================

        if cv2.waitKey(1) & 0xFF == 27:
            break


# =====================================================
# FINALIZAR
# =====================================================
# Corre siempre, incluso si algo falló arriba a medio camino —
# así el buzzer nunca se queda sonando y el puerto siempre se libera.

finally:

    try:
        board.write(b"OFF\r\n")
        board.flush()
        time.sleep(0.2)
        board.close()
    except Exception:
        pass

    cap.release()
    cv2.destroyAllWindows()
    pose.close()

    print("Programa terminado")
