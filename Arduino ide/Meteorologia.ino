#include <WiFi.h>
#include <Wire.h>
#include <time.h>
#include <SD.h>
#include <HTTPClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BMP280.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// Presión nivel del mar
#define SEALEVELPRESSURE_HPA (1013.25)

// Insertar credenciales de red
#define WIFI_SSID "DIANA COY4G"
#define WIFI_PASSWORD "Luk4s4357" 

// Pantalla
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
#define LED_PIN 5

#define LED 2

// FIREBASE
#define API_KEY "AIzaSyB7-M8_qotStZNLeVwbH-QW_kQbtI2_Okk"
#define DATABASE_URL "https://estacion-metereologia-8f-f07e9-default-rtdb.firebaseio.com/"

// Definir objeto de datos de Firebase
FirebaseData fbdo;

// Definir autenticacion de Firebase
FirebaseAuth auth;

// Definir configuracion de Firebase
FirebaseConfig config;

// Variable millis para enviar/almacenar datos en la base de datos Firebase
unsigned long sendDataPrevMillis = 0;
const long timerDelay = 600000; // Enviar/almacenar datos en la base de datos cada 5 segundos
const long timerDelayoled = 1000; // envia a pantalla datos cada 5 segundos

// Definicion de Sensor
Adafruit_BMP280 bmp;

// Definición de pantalla
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Configuración de hora
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = -5 * 3600;   // Colombia
const int daylightOffset_sec = 0;
char buffer[6]; // "mm:ss"

// Variable booleana para el estado de registro
bool signupOK = false;
int contador_dato = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);

  // OLED
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("Error OLED");
    while (1);
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);

  // Conectar a la red WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("-------Conectando a wifi------");
  Serial.print("Conectando a: ");
  Serial.println(WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    digitalWrite(LED, HIGH);
    delay(250);
    digitalWrite(LED, LOW);
    delay(250);
  }
  digitalWrite(LED, LOW);
  Serial.println();
 // Verificar si la conexión fue exitosa
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No se pudo conectar al WiFi.");
  } else {
    Serial.println(" Conectado a WiFi. Dirección IP: ");
    Serial.println(WIFI_SSID);
    Serial.print("IP asignada: ");
    Serial.println(WiFi.localIP());  // Imprimir la dirección IP obtenida
      Serial.println("---------------");
  }
  Serial.println("BUSCANDO BMP280 ... ");
  if (!bmp.begin(0x76)) {
    Serial.println("No se encontró BMP280");
    while (1);
  }
  Serial.println("BMP280 listo ✅");

  // Configurar hora
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  // Asignar la API Key (requerido)
  config.api_key = API_KEY;

  // Asignar la URL de la base de datos RTDB (requerido)
  config.database_url = DATABASE_URL;

  // Registrarse en Firebase
  Serial.println();
  Serial.println("--Registrandose ----");
  Serial.print("Nuevo usuario... ");
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("ok");
    signupOK = true;
  } else {
    Serial.printf("%s\n", config.signer.signupError.message.c_str());
  }
  Serial.println("---------------");

  // Asignar la funcion de callback para el estado del token
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

}

void loop() {

  float temperatura = bmp.readTemperature();
  float presion = bmp.readPressure() / 100.0F; // Convertido a hPa
  float altitud = bmp.readAltitude(SEALEVELPRESSURE_HPA);
  
  // Ajusta fecha, dia, hora
  struct tm timeinfo;

  if(!getLocalTime(&timeinfo)){
    Serial.println("Error obteniendo hora");
    return;
  }

  // Formato hora
  char hora[15];
  strftime(hora, sizeof(hora), "%I:%M:%S", &timeinfo);

  // Determinar AM / PM en español
  String periodo = (timeinfo.tm_hour >= 12) ? "pm" : "am";

  // Construir hora completa
  String horaCompleta = String(hora) + " " + periodo;

  // Formato fecha
  char fecha[15];
  strftime(fecha, sizeof(fecha), "%d/%m/%Y", &timeinfo);

  // Obtener día de la semana (0=Domingo)
  int dia = timeinfo.tm_wday;

  String diasSemana[] = {
    "Domingo", "Lunes", "Martes", "Miercoles",
    "Jueves", "Viernes", "Sabado"
  };

  String diaTexto = diasSemana[dia];

  String fechaCompleta = String(diasSemana[timeinfo.tm_wday]) + " - " + String(fecha);
  String fechahora = String(fecha) + "-" + String(hora);

  if (sendDataPrevMillis > timerDelayoled){
     // Muestra info en pantalla
     display.clearDisplay();

     display.setTextSize(1);
     display.setCursor(0, 0);
     display.println(fechaCompleta);

     display.setCursor(0, 10);
     display.println(horaCompleta);

     display.setTextSize(2);
     display.setCursor(0, 22);
     display.print(temperatura);
     display.println(" C");
   
     display.setTextSize(1);
     display.setCursor(97, 22);
     display.print("Inter");
     display.setCursor(95, 32);
     display.print(" Casa ");
   
     display.setCursor(0, 44);
     display.print("Presion: ");
     display.print(presion);
     display.println(" hPa");

     display.setCursor(0, 54);
     display.print("Altitud: ");
     display.print(altitud);
     display.println(" msnm");

     display.display();
  }

  // Enviar datos a Firebase si esta listo, registrado y ha pasado el tiempo especificado
  if (Firebase.ready() && signupOK && (millis() - sendDataPrevMillis > timerDelay || sendDataPrevMillis == 0)) {
    sendDataPrevMillis = millis();
    contador_dato = contador_dato + 1;

    Serial.println();
    Serial.println("---- NUMERO DATO ----");
    Serial.print(contador_dato);

    Serial.println();
    Serial.println("---- Temperatura ----");
    Serial.print(temperatura);
    Serial.println(" °C");

    Serial.println();
    Serial.println("------ Presión ------");
    Serial.print(presion);
    Serial.println(" hPa");

    Serial.println();
    Serial.println("------ Altitud ------");    
    Serial.print(altitud);
    Serial.println(" msnm");

    Serial.println();
    Serial.println("---- Fecha  Hora ----");
    Serial.print(fechahora);

    // Almacenar datos en la base de datos Firebase
    Serial.println();
    Serial.println("---------------Almacenando Datos");
    digitalWrite(LED, HIGH);

    // Escribir un valor de contador tipo int en la base de datos
    if (Firebase.RTDB.setInt(&fbdo, "Dato", contador_dato)) {
      Serial.println("PASSED");
      Serial.println("PATH: " + fbdo.dataPath());
      Serial.println("TYPE: " + fbdo.dataType());
    } else {
      Serial.println("FAILED");
      Serial.println("REASON: " + fbdo.errorReason());
    }

    // Escribir un valor de temperatura tipo float en la base de datos
    if (Firebase.RTDB.setFloat(&fbdo, "Temperatura", temperatura)) {
      Serial.println("PASSED");
      Serial.println("PATH: " + fbdo.dataPath());
      Serial.println("TYPE: " + fbdo.dataType());
    } else {
      Serial.println("FAILED");
      Serial.println("REASON: " + fbdo.errorReason());
    }

    // Escribir un valor de temperatura tipo float en la base de datos
    if (Firebase.RTDB.setFloat(&fbdo, "Presion", presion)) {
      Serial.println("PASSED");
      Serial.println("PATH: " + fbdo.dataPath());
      Serial.println("TYPE: " + fbdo.dataType());
    } else {
      Serial.println("FAILED");
      Serial.println("REASON: " + fbdo.errorReason());
    }

    // Escribir un valor de altitud tipo float en la base de datos
    if (Firebase.RTDB.setFloat(&fbdo, "Altitud", altitud)) {
      Serial.println("PASSED");
      Serial.println("PATH: " + fbdo.dataPath());
      Serial.println("TYPE: " + fbdo.dataType());
    } else {
      Serial.println("FAILED");
      Serial.println("REASON: " + fbdo.errorReason());
    }

    // Escribir un valor de altitud tipo float en la base de datos
    if (Firebase.RTDB.setString(&fbdo, "Fecha-hora", fechahora)) {
      Serial.println("PASSED");
      Serial.println("PATH: " + fbdo.dataPath());
      Serial.println("TYPE: " + fbdo.dataType());
    } else {
      Serial.println("FAILED");
      Serial.println("REASON: " + fbdo.errorReason());
    }

    // ── Historial acumulado (líneas nuevas) ────────────────────────
    FirebaseJson registro;
    registro.set("Dato",contador_dato);
    registro.set("Temperatura", temperatura);
    registro.set("Presion",     presion);
    registro.set("Altitud",     altitud);
    registro.set("Fecha-hora",  fechahora); // segundos desde arranque
    
    if (Firebase.RTDB.pushJSON(&fbdo, "Z-Historial", &registro)) {
       Serial.println("Historial guardado: " + fbdo.pushName());
    }  else {
       Serial.println("Error historial: " + fbdo.errorReason());
    }

    digitalWrite(LED, LOW);
    Serial.println("---------------");
  }

}
