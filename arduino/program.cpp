#include <Arduino.h>
#include <ArduinoOTA.h>

#include <ESP8266WiFi.h>
#include <IRremoteESP8266.h>

#include <IRac.h>
#include <IRrecv.h>
#include <IRsend.h>
#include <IRtext.h>
#include <IRutils.h>
#include <assert.h>

#ifndef STASSID
#define STASSID "your-wifi-ssid"
#define STAPSK "your-wifi-password"
#endif

#define SERVER_HOST "your-ir-remote-server-ip";
#define SERVER_PORT 10765;
#define DEVICE_ID "1"

#define DEBUG_MODE

const char *ssid = STASSID;
const char *password = STAPSK;

const char *host = SERVER_HOST;
const uint16_t port = SERVER_PORT;

const uint16_t kRecvPin = 14;
const uint16_t kIrLed = 4; // ESP8266 GPIO send pin to use. Recommended: 4 (D2).
const uint32_t kBaudRate = 115200;

const uint16_t kCaptureBufferSize = 1024;
const uint8_t kTimeout = 15;

const uint16_t kMinUnknownSize = 12;
const uint8_t kTolerancePercentage = kTolerance;

IRrecv irrecv(kRecvPin, kCaptureBufferSize, kTimeout, true);
IRsend irsend(kIrLed);  // Set the GPIO to be used to sending the message.
decode_results results; /* Somewhere to store the results */
WiFiClient client;

/* This section of code runs only once at start-up. */
void setup() {
#if defined(ESP8266)
  Serial.begin(kBaudRate, SERIAL_8N1, SERIAL_TX_ONLY);
#else             /* ESP8266 */
  Serial.begin(kBaudRate, SERIAL_8N1);
#endif            /* ESP8266 */
  while (!Serial) /* Wait for the serial connection to be establised. */
    delay(50);
  /* Perform a low level sanity checks that the compiler performs bit field
   * packing as we expect and Endianness is as we expect.
   */
  assert(irutils::lowLevelSanityCheck() == 0);

  Serial.printf("\n" D_STR_IRRECVDUMP_STARTUP "\n", kRecvPin);
#if DECODE_HASH
  /* Ignore messages with less than minimum on or off pulses. */
  irrecv.setUnknownThreshold(kMinUnknownSize);
#endif /* DECODE_HASH */
  irrecv.setTolerance(
      kTolerancePercentage); /* Override the default tolerance. */
  irrecv.enableIRIn();       /* Start the receiver */

  irsend.begin();

  /* We start by connecting to a WiFi network */
  Serial.println();
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  /* Explicitly set the ESP8266 to be a WiFi-client, otherwise, it by default,
     would try to act as both a client and an access-point and could cause
     network-issues with your other WiFi-devices on your WiFi-network. */
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());

  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }

    Serial.println("Start updating " + type);
  });

  ArduinoOTA.onEnd([]() { Serial.println("\nEnd"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });

  ArduinoOTA.begin();

  Serial.println("OTA Ready");

  Serial.print("connecting to ");
  Serial.print(host);
  Serial.print(':');
  Serial.println(port);

  ensureClient();
}

int ensureClient() {
  if (client.connected()) {
    return 1;
  }

  if (client.connect(host, port)) {
#ifdef DEBUG_MODE
    Serial.println("Connected!");
#endif

    // We can't have Nagle's algorithm buffering the packets because
    // it will lead to strange timings when holding down a button on
    // the remote.
    client.setNoDelay(true);

    client.print("register " DEVICE_ID);
    return 1;
  } else {
#ifdef DEBUG_MODE
    Serial.println("Connection failed");
#endif
    return 0;
  }
}

void loop() {
  if (client.connected() && client.available()) {
    uint64_t recv = 0;
    int offset = 0;
    int bytes_read = 0;

    uint8_t proto;
    uint8_t repeat_count;
    uint8_t num_bits;

    while (client.available()) {
      if (bytes_read == 0) {
        proto = client.read();
      } else if (bytes_read == 1) {
        repeat_count = client.read();
      } else if (bytes_read == 2) {
        num_bits = client.read();
      } else {
        char c = client.read();
        recv |= (c << offset);
        offset += 8;
      }

      bytes_read += 1;
    }

#ifdef DEBUG_MODE
    Serial.println(bytes_read, DEC);
    Serial.println(proto, DEC);
    Serial.println(repeat_count, DEC);
    Serial.println(num_bits, DEC);
    Serial.println(uint64ToString(recv, 16));
#endif

    if (bytes_read >= 4) {
      if (proto == 0) {
        irsend.sendNEC(recv, num_bits, repeat_count);
      } else if (proto == 1) {
        irsend.sendRC5(recv, num_bits, repeat_count);
      } else if (proto == 2) {
        irsend.sendRCMM(recv, num_bits, repeat_count);
      }
    }
  }

  /* Check if the IR code has been received. */
  if (irrecv.decode(&results)) {
    if (ensureClient() && !results.overflow && results.decode_type != UNKNOWN) {
#ifdef DEBUG_MODE
      Serial.print(resultToHumanReadableBasic(&results));
#endif
      if (results.repeat) {
        String send_data = DEVICE_ID " repeat";
#ifdef DEBUG_MODE
        Serial.println(send_data);
#endif
        client.print(send_data);
      } else {
        String send_data = DEVICE_ID " " + uint64ToString(results.value, 16);
#ifdef DEBUG_MODE
        Serial.println(send_data);
#endif
        client.print(send_data);
      }
      yield();
    }
  }

  ArduinoOTA.handle();
}
