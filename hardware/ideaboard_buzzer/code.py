# ============================================================
# ErgoAI — Alerta física (IdeaBoard: LED RGB + buzzer)
# ------------------------------------------------------------
# Este programa corre DENTRO de la placa (CircuitPython), no en
# la página web. Se queda esperando, línea por línea, uno de
# estos comandos de texto por el cable USB:
#
#   GOOD       -> luz verde, buzzer apagado (buena postura)
#   ATTENTION  -> luz ámbar, buzzer apagado (llevas un rato mal,
#                 pero todavía no suena la alarma)
#   BAD        -> luz roja + buzzer intermitente (alarma activa)
#   OFF        -> todo apagado (sin cámara conectada)
#
# El navegador (app.js, sección 8 "ALERTA FÍSICA") es quien manda
# esas palabras usando la Web Serial API, cada vez que el estado
# de tu postura cambia. No hace falta ninguna red WiFi: todo va
# por el mismo cable USB con el que alimentas la placa.
#
# Conexión del buzzer:
#   (+) -> 3.3V
#   (-) -> IO4
# ============================================================

import board
import neopixel
import pwmio
import time


# =====================================================
# LED RGB
# =====================================================

led = neopixel.NeoPixel(
    board.NEOPIXEL,
    1,
    brightness=0.3,
    auto_write=True
)


# =====================================================
# BUZZER
# (+) → 3.3V
# (-) → IO4
# =====================================================

buzzer = pwmio.PWMOut(
    board.IO4,
    frequency=500,
    duty_cycle=65535
)


# =====================================================
# FUNCIONES
# =====================================================

def buzzer_on():

    buzzer.duty_cycle = 32768


def buzzer_off():

    buzzer.duty_cycle = 65535


def good():

    led[0] = (0, 255, 0)

    buzzer_off()


def attention():

    led[0] = (255, 180, 0)

    buzzer_off()


def bad():

    led[0] = (255, 0, 0)


def off():

    led[0] = (0, 0, 0)

    buzzer_off()


# =====================================================
# INICIO
# =====================================================

off()

print("================================")
print(" DETECTOR DE POSTURA")
print(" IdeaBoard lista")
print("================================")


# =====================================================
# VARIABLES DE ALARMA
# =====================================================

alarma_activa = False

ultimo_bip = time.monotonic()

bip_encendido = False


# =====================================================
# LOOP
# =====================================================

while True:

    # -----------------------------------------------
    # RECIBIR COMANDO
    # -----------------------------------------------

    try:

        comando = input().strip().upper()

        print("Recibido:", comando)

        if comando == "GOOD":

            good()

            alarma_activa = False

            buzzer_off()


        elif comando == "ATTENTION":

            attention()

            alarma_activa = False

            buzzer_off()


        elif comando == "BAD":

            bad()

            alarma_activa = True


        elif comando == "OFF":

            off()

            alarma_activa = False

            buzzer_off()

    except Exception as e:

        print("Error:", e)


    # -----------------------------------------------
    # ALARMA INTERMITENTE
    # -----------------------------------------------

    if alarma_activa:

        ahora = time.monotonic()

        if ahora - ultimo_bip >= 0.35:

            ultimo_bip = ahora

            if bip_encendido:

                buzzer_off()

                bip_encendido = False

            else:

                buzzer_on()

                bip_encendido = True


    else:

        buzzer_off()

        bip_encendido = False


    time.sleep(0.01)
