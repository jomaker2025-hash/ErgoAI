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
# de tu postura cambia, y además cada pocos segundos aunque no haya
# cambiado ("latido" — ver más abajo). No hace falta ninguna red
# WiFi: todo va por el mismo cable USB con el que alimentas la placa.
#
# Conexión del buzzer:
#   (+) -> 3.3V
#   (-) -> IO4
#
# Arreglo (Kesta 26) — el buzzer se quedaba "pegado":
# Antes, este programa usaba input() para leer cada comando, y esa
# función SE QUEDA ESPERANDO (bloqueada) hasta que llega una línea
# nueva — nada más del programa corre mientras tanto, ni siquiera el
# parpadeo del buzzer. Como la página web evita reenviar el mismo
# comando seguido (para no saturar el cable), la placa podía
# quedarse horas sin recibir nada mientras la postura seguía mala, y
# el buzzer se congelaba en lo último que hizo en vez de parpadear.
#
# Ahora se revisa PRIMERO si ya llegó algo por el cable
# (supervisor.runtime.serial_bytes_available) antes de intentar leer
# — si no ha llegado nada, no se espera, se sigue de largo al
# parpadeo. Y si pasan más de WATCHDOG_SEGUNDOS sin recibir NADA (la
# página dejó de mandar su "latido" — se cerró de golpe, se apagó la
# compu, se desconectó el cable...), la placa se apaga sola en vez de
# quedarse sonando para siempre.
# ============================================================

import board
import neopixel
import pwmio
import supervisor
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

# Arreglo (Kesta 26): si pasan más de esto sin recibir NADA por el
# cable, se asume que la página ya no está del otro lado (se cerró de
# golpe, se apagó la compu, se desconectó el cable) y la placa se
# apaga sola. La página manda un "latido" (el mismo comando de
# siempre) cada 4 segundos aunque nada haya cambiado — así que 12s de
# silencio real es tiempo de sobra sin ser tan corto como para
# apagarse por un tropiezo normal del cable.
WATCHDOG_SEGUNDOS = 12

ultimo_comando = time.monotonic()


# =====================================================
# LOOP
# =====================================================

while True:

    # -----------------------------------------------
    # RECIBIR COMANDO (sin bloquear)
    # -----------------------------------------------
    # Arreglo (Kesta 26): antes, input() aquí se quedaba esperando
    # hasta que llegara una línea nueva — nada más de este bucle (ni
    # siquiera el parpadeo de abajo) corría mientras tanto. Ahora
    # primero se revisa si YA hay algo esperando en el cable; si no
    # hay nada, se sigue de largo al parpadeo/vigía de abajo en vez
    # de quedarse pegado aquí.

    if supervisor.runtime.serial_bytes_available:

        try:

            comando = input().strip().upper()

            print("Recibido:", comando)

            ultimo_comando = time.monotonic()

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
    # VIGÍA: silencio demasiado largo -> apagar solo
    # -----------------------------------------------

    if time.monotonic() - ultimo_comando >= WATCHDOG_SEGUNDOS:

        if alarma_activa:

            print("Sin noticias de la pagina por", WATCHDOG_SEGUNDOS, "s -- apagando solo")

        off()

        alarma_activa = False

        # Evita repetir el aviso/off() en cada vuelta del bucle mientras
        # el silencio sigue — se resetea solo apenas vuelva a llegar un
        # comando real, arriba.
        ultimo_comando = time.monotonic()


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
