"""
Detector de postura con MediaPipe + IdeaBoard.

Usa la cámara para analizar la postura (inclinación de hombros,
inclinación de cadera, posición vertical de la cabeza, cabeza
adelantada hacia la pantalla, hombros encorvados/reclinados y
inclinación lateral del torso) y envía el resultado
("GOOD" / "ATTENTION" / "BAD") por puerto serie a una IdeaBoard cada
vez que cambia.
"""

import json
import math
import statistics
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple, Optional

import cv2
import mediapipe as mp
import serial


# =====================================================
# CONFIGURACIÓN
# =====================================================

PUERTO = "COM6"       # <-- CAMBIA POR EL COM DE TU IDEABOARD
BAUDRATE = 115200
CONECTAR_IDEABOARD = True   # Ponlo en False para probar solo con la cámara

CAMARA_INDICE = 0
VENTANA = "Detector de postura"

# -----------------------------------------------------
# ErgoAI
# -----------------------------------------------------
# Todavía no sabemos qué protocolo espera ErgoAI (API, archivo,
# puerto serie...), así que por ahora cada cambio de estado
# confirmado se agrega como una línea JSON a este archivo, con
# timestamp, estado, métricas y razones. Es un "adaptador temporal":
# en cuanto tengas la documentación de ErgoAI, se cambia solo la
# función enviar_a_ergoai() por la integración real (llamar su API,
# mandarlo por otro puerto serie, etc.) sin tocar el resto del script.
ERGOAI_LOG_PATH = Path(__file__).with_name("ergoai_log.jsonl")
ERGOAI_HABILITADO = True

# -----------------------------------------------------
# Calibración persistente
# -----------------------------------------------------
# La calibración ('c') se guarda acá para no tener que repetirla cada
# vez que abres el script — se carga sola al arrancar si el archivo existe.
CALIBRACION_PATH = Path(__file__).with_name("calibracion.json")

# -----------------------------------------------------
# Reconexión automática
# -----------------------------------------------------
IDEABOARD_REINTENTO_SEGUNDOS = 5     # cada cuánto reintentar si se perdió la conexión
CAMARA_MAX_INTENTOS_RECONEXION = 10
CAMARA_ESPERA_REINTENTO_SEGUNDOS = 1.5

# -----------------------------------------------------
# Umbrales "2D" (ángulos y proporciones en el plano de la imagen)
# -----------------------------------------------------
# Estos son razonablemente independientes de dónde pongas la cámara,
# así que se dejan fijos.

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

# -----------------------------------------------------
# Umbrales "de profundidad" (usan la Z de MediaPipe)
# -----------------------------------------------------
# Estos SÍ dependen de dónde y a qué distancia está tu cámara (en tu
# caso: laptop en el escritorio, apuntando un poco hacia arriba), así
# que en vez de un número fijo se miden como desviación respecto a
# una CALIBRACIÓN: siéntate con tu mejor postura y presiona 'c'. A
# partir de ahí, estos MARGEN_* son cuánto se puede alejar cada
# métrica de tu postura calibrada antes de contar como problema.
# Si ves que detecta de más o de menos, sube o baja estos márgenes.

MARGEN_CABEZA_ADELANTE = 0.09   # cabeza acercándose a la pantalla
MARGEN_HOMBROS_PROFUNDIDAD = 0.09   # hombros encorvados hacia adelante / reclinado hacia atrás
MARGEN_LATERAL = 0.12   # torso inclinado hacia un lado

# Espalda encorvada / joroba, medida SIN depender de la Z (ver
# calcular_metricas): cuánto se puede acortar el torso (hombro-cadera
# en la imagen) respecto a tu calibración antes de contar como joroba.
MARGEN_TORSO = 0.08

# -----------------------------------------------------
# Estabilidad de la detección
# -----------------------------------------------------
#
# MediaPipe puede "temblar" un frame suelto (un landmark que salta
# un instante) y eso antes se traducía en un estado falso que se
# mandaba de inmediato a la IdeaBoard, o impedía llegar a GOOD porque
# bastaba UN frame ruidoso para que alguna métrica se saliera del
# margen. Para evitarlo, cada métrica se promedia sobre los últimos
# HISTORIAL_FRAMES frames antes de evaluarla (ver clase Suavizador),
# y encima el estado resultante debe repetirse FRAMES_CONFIRMACION
# veces seguidas antes de confirmarse y enviarse por serie.
HISTORIAL_FRAMES = 8
FRAMES_CONFIRMACION = 3

# Apariencia del texto en pantalla
FUENTE = cv2.FONT_HERSHEY_SIMPLEX
COLOR_TEXTO = (255, 255, 255)
COLOR_AVISO = (0, 220, 255)


class Metricas(NamedTuple):
    """Números crudos calculados a partir de los landmarks de un frame."""

    inclinacion_hombros: float
    inclinacion_cadera: float
    cabeza_ratio: float
    cabeza_adelante: float     # nariz acercándose a la cámara respecto a los hombros
    hombros_profundidad: float  # hombros acercándose a la cámara respecto a la cadera
    lateral_offset: float       # centro de hombros desplazado respecto al centro de cadera
    torso_ratio: float          # distancia hombro-cadera (2D) normalizada: se acorta al encorvarse


class Baseline(NamedTuple):
    """Métricas capturadas en la calibración (postura buena), para medir desviaciones."""

    cabeza_adelante: float
    hombros_profundidad: float
    lateral_offset: float
    torso_ratio: float


class Postura(NamedTuple):
    metricas: Metricas
    problemas: int
    razones: tuple      # etiquetas de qué se detectó mal, para mostrar en pantalla
    estado: str          # "GOOD" | "ATTENTION" | "BAD"
    texto: str            # texto principal a mostrar en pantalla


# =====================================================
# CONEXIÓN CON IDEABOARD
# =====================================================

def conectar_ideaboard() -> Optional[serial.Serial]:
    """Abre el puerto serie con la IdeaBoard.

    Devuelve None si CONECTAR_IDEABOARD es False o si no se pudo
    conectar (para poder seguir probando solo con la cámara en
    lugar de que el programa se caiga por completo).
    """

    if not CONECTAR_IDEABOARD:
        print("Conexión con IdeaBoard deshabilitada (modo solo cámara).")
        return None

    print(f"Conectando con IdeaBoard en {PUERTO}...")

    try:
        board = serial.Serial(PUERTO, BAUDRATE, timeout=1)
        time.sleep(2)  # tiempo de arranque típico de los Arduino-like
        print("IdeaBoard conectada.")
        return board

    except (serial.SerialException, OSError) as error:
        print(f"No se pudo conectar con la IdeaBoard ({error}).")
        return None


def enviar_comando(board: Optional[serial.Serial], comando: str) -> bool:
    """Envía un comando por serie si hay una IdeaBoard conectada.

    Devuelve False si la escritura falló (puerto desconectado, etc.),
    para que el llamador pueda soltar la conexión y reintentar más
    tarde en vez de seguir usando un puerto muerto.
    """

    if board is None:
        return False

    try:
        board.write(f"{comando}\r\n".encode())
        board.flush()
        return True
    except (serial.SerialException, OSError) as error:
        print(f"Error enviando '{comando}' a la IdeaBoard: {error}")
        return False


def enviar_a_ergoai(postura) -> None:
    """Registra el estado confirmado para ErgoAI.

    Adaptador temporal: escribe una línea JSON por cambio de estado
    (timestamp, estado, métricas, razones) en ERGOAI_LOG_PATH.
    Cuando tengas el protocolo real de ErgoAI, reemplaza el cuerpo de
    esta función por esa integración — el resto del script no
    necesita cambiar.
    """

    if not ERGOAI_HABILITADO:
        return

    registro = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "estado": postura.estado,
        "metricas": postura.metricas._asdict(),
        "razones": list(postura.razones),
    }

    try:
        with ERGOAI_LOG_PATH.open("a", encoding="utf-8") as archivo:
            archivo.write(json.dumps(registro, ensure_ascii=False) + "\n")
    except OSError as error:
        print(f"No se pudo escribir el registro para ErgoAI: {error}")


# =====================================================
# GEOMETRÍA
# =====================================================

def calcular_inclinacion(p1, p2) -> float:
    """Ángulo (en grados, 0-90) entre dos landmarks respecto a la horizontal."""

    dx = p2.x - p1.x
    dy = p2.y - p1.y

    angulo = abs(math.degrees(math.atan2(dy, dx)))

    if angulo > 90:
        angulo = 180 - angulo

    return angulo


def calcular_metricas(landmarks, mp_pose) -> Metricas:
    """Calcula todas las métricas de postura a partir de los landmarks.

    Se calcula siempre que MediaPipe entregue landmarks (no se
    descarta el frame por baja confianza puntual) porque en video en
    vivo eso pasa todo el rato y dejaba a la IdeaBoard sin comandos.
    """

    nariz = landmarks[mp_pose.PoseLandmark.NOSE]
    oreja_izq = landmarks[mp_pose.PoseLandmark.LEFT_EAR]
    oreja_der = landmarks[mp_pose.PoseLandmark.RIGHT_EAR]
    hombro_izq = landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]
    hombro_der = landmarks[mp_pose.PoseLandmark.RIGHT_SHOULDER]
    cadera_izq = landmarks[mp_pose.PoseLandmark.LEFT_HIP]
    cadera_der = landmarks[mp_pose.PoseLandmark.RIGHT_HIP]

    # Se usan las orejas (no la nariz) para "cabeza adelantada": se
    # mantienen visibles y a una distancia más estable de la cámara
    # aunque gires la cara, mientras que la nariz cambia mucho de
    # posición aparente con la rotación de la cabeza.
    oreja_z = (oreja_izq.z + oreja_der.z) / 2

    hombro_x = (hombro_izq.x + hombro_der.x) / 2
    hombro_y = (hombro_izq.y + hombro_der.y) / 2
    hombro_z = (hombro_izq.z + hombro_der.z) / 2

    cadera_x = (cadera_izq.x + cadera_der.x) / 2
    cadera_y = (cadera_izq.y + cadera_der.y) / 2
    cadera_z = (cadera_izq.z + cadera_der.z) / 2

    inclinacion_hombros = calcular_inclinacion(hombro_izq, hombro_der)
    inclinacion_cadera = calcular_inclinacion(cadera_izq, cadera_der)

    ancho_hombros = math.hypot(
        hombro_der.x - hombro_izq.x,
        hombro_der.y - hombro_izq.y,
    )

    # ---------------------------------------------------------
    # Posición vertical de la cabeza (2D)
    # ---------------------------------------------------------
    # Distancia vertical entre el centro de hombros y la nariz,
    # normalizada por el ancho de hombros para que no dependa de
    # qué tan cerca esté la persona de la cámara.

    distancia_cabeza = hombro_y - nariz.y
    cabeza_ratio = distancia_cabeza / ancho_hombros if ancho_hombros > 0 else 0.0

    # ---------------------------------------------------------
    # Joroba / espalda encorvada, SIN usar Z (2D puro)
    # ---------------------------------------------------------
    # Cuando te encorvas, la columna se curva y el torso se acorta
    # verticalmente en la imagen, se vea o no de perfil. Se normaliza
    # por el ancho de hombros igual que cabeza_ratio. Se compara
    # contra tu calibración: si se acorta respecto a tu postura
    # buena, es joroba.

    distancia_torso = cadera_y - hombro_y
    torso_ratio = distancia_torso / ancho_hombros if ancho_hombros > 0 else 0.0

    # ---------------------------------------------------------
    # Profundidad (Z): más negativo = más cerca de la cámara.
    # Se normaliza igual, por ancho de hombros, para que sea
    # comparable sin importar la distancia a la cámara.
    # ---------------------------------------------------------

    if ancho_hombros > 0:
        # Orejas acercándose a la cámara respecto a los hombros
        # (encorvarse hacia la pantalla / cabeza adelantada).
        cabeza_adelante = (hombro_z - oreja_z) / ancho_hombros

        # Hombros acercándose a la cámara respecto a la cadera
        # (positivo = hombros/espalda encorvados hacia adelante;
        #  negativo = reclinado hacia atrás, alejándose de la cámara).
        hombros_profundidad = (cadera_z - hombro_z) / ancho_hombros

        # Centro de hombros desplazado respecto al centro de cadera
        # (torso inclinado hacia un lado, no solo un hombro más alto).
        lateral_offset = (hombro_x - cadera_x) / ancho_hombros
    else:
        cabeza_adelante = 0.0
        hombros_profundidad = 0.0
        lateral_offset = 0.0

    return Metricas(
        inclinacion_hombros=inclinacion_hombros,
        inclinacion_cadera=inclinacion_cadera,
        cabeza_ratio=cabeza_ratio,
        cabeza_adelante=cabeza_adelante,
        hombros_profundidad=hombros_profundidad,
        lateral_offset=lateral_offset,
        torso_ratio=torso_ratio,
    )


def calibrar(metricas: Metricas) -> Baseline:
    """Guarda las métricas actuales (ya suavizadas) como la postura buena."""

    return Baseline(
        cabeza_adelante=metricas.cabeza_adelante,
        hombros_profundidad=metricas.hombros_profundidad,
        lateral_offset=metricas.lateral_offset,
        torso_ratio=metricas.torso_ratio,
    )


def guardar_calibracion(baseline: Baseline) -> None:
    """Persiste la calibración en CALIBRACION_PATH para no perderla al cerrar."""

    try:
        with CALIBRACION_PATH.open("w", encoding="utf-8") as archivo:
            json.dump(baseline._asdict(), archivo, indent=2)
    except OSError as error:
        print(f"No se pudo guardar la calibración: {error}")


def cargar_calibracion() -> Optional[Baseline]:
    """Carga una calibración previa desde CALIBRACION_PATH, si existe."""

    if not CALIBRACION_PATH.exists():
        return None

    try:
        with CALIBRACION_PATH.open("r", encoding="utf-8") as archivo:
            datos = json.load(archivo)
        return Baseline(**{campo: datos[campo] for campo in Baseline._fields})
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        print(f"No se pudo leer la calibración guardada ({error}), se ignora.")
        return None


class Suavizador:
    """Combina cada métrica sobre una ventana de frames para filtrar el
    ruido/temblor de MediaPipe (ver HISTORIAL_FRAMES).

    Usa la MEDIANA en vez del promedio: un solo frame con un salto raro
    (un landmark que se va lejos por un instante) no arrastra el valor
    combinado como sí lo haría un promedio.
    """

    def __init__(self, ventana: int):
        self._historiales = {campo: deque(maxlen=ventana) for campo in Metricas._fields}

    def actualizar(self, metricas: Metricas) -> Metricas:
        valores = {}

        for campo in Metricas._fields:
            historial = self._historiales[campo]
            historial.append(getattr(metricas, campo))
            valores[campo] = statistics.median(historial)

        return Metricas(**valores)

    def reset(self) -> None:
        for historial in self._historiales.values():
            historial.clear()


def clasificar_postura(metricas: Metricas, baseline: Optional[Baseline]) -> Postura:
    """Decide GOOD/ATTENTION/BAD a partir de las métricas (y la calibración, si existe)."""

    problemas = 0
    razones = []

    if metricas.inclinacion_hombros > HOMBROS_MAX:
        problemas += 1
        razones.append("Hombros inclinados")

    if metricas.inclinacion_cadera > CADERA_MAX:
        problemas += 1
        razones.append("Cadera inclinada")

    if baseline is not None:
        if metricas.torso_ratio < baseline.torso_ratio - MARGEN_TORSO:
            problemas += 1
            razones.append("Espalda encorvada (joroba)")

        if metricas.cabeza_adelante > baseline.cabeza_adelante + MARGEN_CABEZA_ADELANTE:
            problemas += 1
            razones.append("Cabeza hacia la pantalla")

        diff_hombros = metricas.hombros_profundidad - baseline.hombros_profundidad

        if diff_hombros > MARGEN_HOMBROS_PROFUNDIDAD:
            problemas += 1
            razones.append("Hombros encorvados")
        elif diff_hombros < -MARGEN_HOMBROS_PROFUNDIDAD:
            problemas += 1
            razones.append("Reclinado hacia atrás")

        if abs(metricas.lateral_offset - baseline.lateral_offset) > MARGEN_LATERAL:
            problemas += 1
            razones.append("Inclinado hacia un lado")

    if metricas.cabeza_ratio >= CABEZA_GOOD:
        estado = "GOOD" if problemas == 0 else "ATTENTION"
    elif metricas.cabeza_ratio >= CABEZA_ATTENTION:
        estado = "ATTENTION"
    else:
        estado = "BAD"
        razones.insert(0, "Cabeza baja")

    texto = {
        "GOOD": "BUENA POSTURA",
        "ATTENTION": "ATENCION",
        "BAD": "MALA POSTURA",
    }[estado]

    return Postura(
        metricas=metricas,
        problemas=problemas,
        razones=tuple(razones),
        estado=estado,
        texto=texto,
    )


# =====================================================
# DIBUJO EN PANTALLA
# =====================================================

def dibujar_texto(frame, texto: str, y: int, escala: float = 0.6, grosor: int = 2, color=COLOR_TEXTO) -> None:
    cv2.putText(frame, texto, (30, y), FUENTE, escala, color, grosor)


def formatear_duracion(segundos: float) -> str:
    minutos, segundos = divmod(int(segundos), 60)
    return f"{minutos}m {segundos}s" if minutos else f"{segundos}s"


def dibujar_info_postura(frame, postura: Postura, calibrado: bool, tiempo_en_estado: float) -> None:
    m = postura.metricas

    dibujar_texto(frame, postura.texto, 40, escala=0.9)
    dibujar_texto(frame, f"Hace {formatear_duracion(tiempo_en_estado)}", 65, escala=0.5)
    dibujar_texto(frame, f"Hombros: {m.inclinacion_hombros:.1f}", 95)
    dibujar_texto(frame, f"Cadera: {m.inclinacion_cadera:.1f}", 125)
    dibujar_texto(frame, f"Cabeza: {m.cabeza_ratio:.2f}", 155)
    dibujar_texto(frame, f"Torso: {m.torso_ratio:.2f}", 185)
    dibujar_texto(frame, f"Problemas: {postura.problemas}", 215)

    y = 245

    for razon in postura.razones:
        dibujar_texto(frame, f"- {razon}", y, escala=0.55, color=COLOR_AVISO)
        y += 25

    if not calibrado:
        dibujar_texto(
            frame,
            "Presiona 'c' con buena postura para calibrar",
            y + 10,
            escala=0.5,
            color=COLOR_AVISO,
        )


def es_tecla_de_salida(tecla: int) -> bool:
    return tecla in (27, ord("q"), ord("Q"))  # ESC o Q


def ventana_cerrada_por_usuario() -> bool:
    """True si el usuario cerró la ventana de video con la X.

    cv2.imshow no termina el programa cuando se hace clic en la X de
    la ventana — solo la oculta, y el proceso (con la cámara todavía
    abierta) se queda corriendo para siempre si no se revisa esto
    explícitamente.
    """

    try:
        return cv2.getWindowProperty(VENTANA, cv2.WND_PROP_VISIBLE) < 1
    except cv2.error:
        # La ventana todavía no se ha creado (primer frame): no cuenta como cierre.
        return False


def reconectar_camara(cap: cv2.VideoCapture) -> Optional[cv2.VideoCapture]:
    """Intenta reabrir la cámara tras perder la imagen.

    Reintenta CAMARA_MAX_INTENTOS_RECONEXION veces con una pequeña
    espera entre intentos. Devuelve None si no lo logra, o si el
    usuario pide salir mientras tanto (en cualquier caso, el programa
    termina en vez de quedarse en un bucle sin imagen).
    """

    cap.release()

    for intento in range(1, CAMARA_MAX_INTENTOS_RECONEXION + 1):
        tecla = cv2.waitKey(1) & 0xFF

        if es_tecla_de_salida(tecla) or ventana_cerrada_por_usuario():
            print("Cancelado por el usuario.")
            return None

        print(f"Reintentando abrir la cámara ({intento}/{CAMARA_MAX_INTENTOS_RECONEXION})...")
        time.sleep(CAMARA_ESPERA_REINTENTO_SEGUNDOS)

        nuevo_cap = cv2.VideoCapture(CAMARA_INDICE, cv2.CAP_DSHOW)

        if nuevo_cap.isOpened():
            print("Cámara reconectada.")
            return nuevo_cap

        nuevo_cap.release()

    print("No se pudo reconectar la cámara.")
    return None


def mostrar_resumen_sesion(inicio_sesion: float, tiempo_por_estado: dict) -> None:
    """Imprime el resumen de la sesión y lo agrega al log de ErgoAI."""

    duracion_total = time.time() - inicio_sesion
    tiempo_medido = sum(tiempo_por_estado.values())

    print("\n--- Resumen de la sesión ---")
    print(f"Duración total: {formatear_duracion(duracion_total)}")

    if tiempo_medido > 0:
        for estado, segundos in tiempo_por_estado.items():
            porcentaje = 100 * segundos / tiempo_medido
            print(f"  {estado}: {formatear_duracion(segundos)} ({porcentaje:.0f}%)")
    else:
        print("  (no se confirmó ninguna postura durante la sesión)")

    if ERGOAI_HABILITADO:
        registro = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tipo": "resumen_sesion",
            "duracion_segundos": round(duracion_total, 1),
            "tiempo_por_estado_segundos": {k: round(v, 1) for k, v in tiempo_por_estado.items()},
        }

        try:
            with ERGOAI_LOG_PATH.open("a", encoding="utf-8") as archivo:
                archivo.write(json.dumps(registro, ensure_ascii=False) + "\n")
        except OSError as error:
            print(f"No se pudo escribir el resumen de sesión para ErgoAI: {error}")


# =====================================================
# LOOP PRINCIPAL
# =====================================================

def main() -> None:
    board = conectar_ideaboard()
    ultimo_intento_ideaboard = time.time()

    mp_pose = mp.solutions.pose
    mp_drawing = mp.solutions.drawing_utils

    cap = cv2.VideoCapture(CAMARA_INDICE, cv2.CAP_DSHOW)

    if not cap.isOpened():
        print(f"No se pudo abrir la cámara (índice {CAMARA_INDICE}).")
        print("¿Otra aplicación (ErgoAI, Zoom, Teams, otra instancia de este script...) la tiene abierta?")
        if board is not None:
            board.close()
        return

    print("Para cerrar: haz clic en la ventana de video y presiona ESC o Q (o cierra la ventana con la X).")

    baseline = cargar_calibracion()
    if baseline is not None:
        print(f"Calibración cargada desde {CALIBRACION_PATH.name}.")

    suavizador = Suavizador(HISTORIAL_FRAMES)

    postura_confirmada: Optional[str] = None   # último estado enviado a la IdeaBoard
    candidato_estado: Optional[str] = None     # estado que se está intentando confirmar
    candidato_contador = 0

    # -------------------------------------------------
    # Estadísticas de sesión: cuánto tiempo se pasó en
    # cada estado confirmado, para el resumen final.
    # -------------------------------------------------
    inicio_sesion = time.time()
    tiempo_por_estado = {"GOOD": 0.0, "ATTENTION": 0.0, "BAD": 0.0}
    inicio_estado_actual = time.time()
    ultimo_tick = time.time()

    try:
        with mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:

            while True:
                # ---------------------------------------------
                # Reconexión automática de la IdeaBoard, si se
                # perdió la conexión (con un cooldown para no
                # martillar el puerto serie en cada frame).
                # ---------------------------------------------
                if (
                    CONECTAR_IDEABOARD
                    and board is None
                    and time.time() - ultimo_intento_ideaboard >= IDEABOARD_REINTENTO_SEGUNDOS
                ):
                    print("Intentando reconectar con la IdeaBoard...")
                    board = conectar_ideaboard()
                    ultimo_intento_ideaboard = time.time()

                ret, frame = cap.read()

                if not ret:
                    print("Se perdió la imagen de la cámara.")
                    nuevo_cap = reconectar_camara(cap)

                    if nuevo_cap is None:
                        break

                    cap = nuevo_cap
                    continue

                ahora = time.time()
                dt = ahora - ultimo_tick
                ultimo_tick = ahora

                frame = cv2.flip(frame, 1)  # efecto espejo
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(rgb)

                tecla = cv2.waitKey(1) & 0xFF

                if results.pose_landmarks:
                    metricas = suavizador.actualizar(
                        calcular_metricas(results.pose_landmarks.landmark, mp_pose)
                    )

                    if tecla in (ord("c"), ord("C")):
                        baseline = calibrar(metricas)
                        guardar_calibracion(baseline)
                        print(f"Calibrado y guardado en {CALIBRACION_PATH.name}.")

                    postura = clasificar_postura(metricas, baseline)

                    mp_drawing.draw_landmarks(
                        frame,
                        results.pose_landmarks,
                        mp_pose.POSE_CONNECTIONS,
                    )

                    # -------------------------------------------------
                    # Confirmar el estado solo tras FRAMES_CONFIRMACION
                    # lecturas seguidas iguales, para filtrar temblores
                    # de un solo frame de MediaPipe.
                    # -------------------------------------------------

                    if postura.estado == candidato_estado:
                        candidato_contador += 1
                    else:
                        candidato_estado = postura.estado
                        candidato_contador = 1

                    if (
                        candidato_contador >= FRAMES_CONFIRMACION
                        and candidato_estado != postura_confirmada
                    ):
                        postura_confirmada = candidato_estado
                        inicio_estado_actual = time.time()

                        if not enviar_comando(board, postura_confirmada):
                            board = None  # se reintentará conectar más arriba

                        enviar_a_ergoai(postura)

                        detalle = ", ".join(postura.razones) if postura.razones else "-"

                        print(
                            "Estado:", postura_confirmada,
                            "| Hombros:", round(postura.metricas.inclinacion_hombros, 1),
                            "| Cadera:", round(postura.metricas.inclinacion_cadera, 1),
                            "| Cabeza:", round(postura.metricas.cabeza_ratio, 2),
                            "| Motivos:", detalle,
                        )

                    if postura_confirmada is not None:
                        tiempo_por_estado[postura_confirmada] += dt

                    dibujar_info_postura(
                        frame,
                        postura,
                        calibrado=baseline is not None,
                        tiempo_en_estado=time.time() - inicio_estado_actual,
                    )

                else:
                    dibujar_texto(frame, "NO SE DETECTA EL CUERPO", 40, escala=0.8)
                    candidato_estado = None
                    candidato_contador = 0
                    suavizador.reset()

                cv2.imshow(VENTANA, frame)

                if es_tecla_de_salida(tecla) or ventana_cerrada_por_usuario():
                    break

    except KeyboardInterrupt:
        print("Interrumpido por el usuario.")

    finally:
        if board is not None:
            try:
                board.write(b"OFF\r\n")
                board.flush()
                time.sleep(0.2)
            except (serial.SerialException, OSError):
                pass
            finally:
                board.close()

        cap.release()
        cv2.destroyAllWindows()
        cv2.waitKey(1)  # deja que Windows procese el cierre de la ventana ya mismo

        mostrar_resumen_sesion(inicio_sesion, tiempo_por_estado)

        print("Programa terminado — cámara y puerto liberados.")


if __name__ == "__main__":
    main()
