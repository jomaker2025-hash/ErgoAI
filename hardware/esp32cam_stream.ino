/*
 * ESP32-CAM - Streaming continuo de video (MJPEG) vía WiFi
 * Proyecto: Kesta - Seguimiento de postura
 *
 * Placa: AI-Thinker ESP32-CAM
 * Requiere: librería "esp32" board package instalada en Arduino IDE
 *
 * Configuración en Arduino IDE:
 *   Herramientas > Placa > AI Thinker ESP32-CAM
 *   Herramientas > Partition Scheme > Huge APP (3MB No OTA)
 *   Herramientas > PSRAM > Enabled
 */

#include "esp_camera.h"
#include <WiFi.h>

// ---------- CONFIGURA TU RED ----------
// Johel: pon aquí tu WiFi real SOLO en tu copia local (la que vive en tu
// computadora). Este archivo público lleva valores de relleno a propósito
// — así nunca queda tu contraseña real visible para cualquiera en internet.
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_CONTRASEÑA_WIFI";

// ---------- PINES CÁMARA (AI-Thinker) ----------
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ---------- SERVIDOR HTTP PARA EL STREAM ----------
#include <WiFiServer.h>
WiFiServer server(80);

// Boundary para el stream MJPEG
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

void startCameraServer();
void handleClient(WiFiClient &client);

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Ajusta calidad/resolución según memoria PSRAM disponible
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;   // 640x480, buen balance para tracking de postura
    config.jpeg_quality = 12;            // 0-63, menor = mejor calidad
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;  // 320x240 si no hay PSRAM
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Error al iniciar la cámara: 0x%x\n", err);
    return;
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi conectado");
  Serial.print("Stream disponible en: http://");
  Serial.println(WiFi.localIP());
  Serial.println("(abre esa URL en el navegador para ver el video en vivo)");

  server.begin();
}

void loop() {
  WiFiClient client = server.available();
  if (client) {
    handleClient(client);
  }
}

void handleClient(WiFiClient &client) {
  // Lee la línea de petición HTTP (no procesamos rutas, siempre servimos el stream)
  String req = client.readStringUntil('\r');
  client.flush();

  client.println("HTTP/1.1 200 OK");
  client.print("Content-Type: ");
  client.println(STREAM_CONTENT_TYPE);
  // Este encabezado es indispensable: sin él, el navegador bloquea que la
  // página web (ErgoAI) pueda "leer" el video para analizarlo con IA —
  // solo lo dejaría mostrarlo, no procesarlo. CORS = Cross-Origin Resource
  // Sharing, el permiso que le da la cámara a la página para compartir su video.
  client.println("Access-Control-Allow-Origin: *");
  client.println();

  char part_buf[64];

  while (client.connected()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Error al capturar frame");
      continue;
    }

    client.print(STREAM_BOUNDARY);
    size_t hlen = snprintf(part_buf, sizeof(part_buf), STREAM_PART, fb->len);
    client.write(part_buf, hlen);
    client.write(fb->buf, fb->len);

    esp_camera_fb_return(fb);

    if (!client.connected()) break;
  }

  client.stop();
}
