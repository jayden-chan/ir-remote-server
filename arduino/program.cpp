#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <IRac.h>
#include <IRrecv.h>
#include <IRremoteESP8266.h>
#include <IRtext.h>
#include <IRutils.h>
#include <assert.h>

#ifndef STASSID
#define STASSID "your-wifi-ssid"
#define STAPSK "your-wifi-password"
#endif

const char *ssid = STASSID;
const char *password = STAPSK;

const char *host = "192.168.1.225";
const uint16_t port = 3000;

/* ==================== start of TUNEABLE PARAMETERS ====================
 * An IR detector/demodulator is connected to GPIO pin 14
 * e.g. D5 on a NodeMCU board.
 * Note: GPIO 16 won't work on the ESP8266 as it does not have interrupts.
 */
const uint16_t kRecvPin = 14;

/* The Serial connection baud rate.
 * i.e. Status message will be sent to the PC at this baud rate.
 * Try to avoid slow speeds like 9600, as you will miss messages and
 * cause other problems. 115200 (or faster) is recommended.
 * NOTE: Make sure you set your Serial Monitor to the same speed.
 */
const uint32_t kBaudRate = 115200;

/* As this program is a special purpose capture/decoder, let us use a larger
 * than normal buffer so we can handle Air Conditioner remote codes.
 */
const uint16_t kCaptureBufferSize = 1024;
const uint8_t kTimeout = 15;

/* Alternatives:
 * const uint8_t kTimeout = 90;
 * Suits messages with big gaps like XMP-1 & some aircon units, but can
 * accidentally swallow repeated messages in the rawData[] output.
 *
 * const uint8_t kTimeout = kMaxTimeoutMs;
 * This will set it to our currently allowed maximum.
 * Values this high are problematic because it is roughly the typical boundary
 * where most messages repeat.
 * e.g. It will stop decoding a message and start sending it to serial at
 *      precisely the time when the next message is likely to be transmitted,
 *      and may miss it.

 * Set the smallest sized "UNKNOWN" message packets we actually care about.
 * This value helps reduce the false-positive detection rate of IR background
 * noise as real messages. The chances of background IR noise getting detected
 * as a message increases with the length of the kTimeout value. (See above)
 * The downside of setting this message too large is you can miss some valid
 * short messages for protocols that this library doesn't yet decode.
 *
 * Set higher if you get lots of random short UNKNOWN messages when nothing
 * should be sending a message.
 * Set lower if you are sure your setup is working, but it doesn't see messages
 * from your device. (e.g. Other IR remotes work.)
 * NOTE: Set this value very high to effectively turn off UNKNOWN detection.
 */
const uint16_t kMinUnknownSize = 12;

/* How much percentage lee way do we give to incoming signals in order to match
 * it?
 * e.g. +/- 25% (default) to an expected value of 500 would mean matching a
 *      value between 375 & 625 inclusive.
 * Note: Default is 25(%). Going to a value >= 50(%) will cause some protocols
 *       to no longer match correctly. In normal situations you probably do not
 *       need to adjust this value. Typically that's when the library detects
 *       your remote's message some of the time, but not all of the time.
 */
const uint8_t kTolerancePercentage =
    kTolerance; /* kTolerance is normally 25% */

/* Legacy (No longer supported!)
 *
 * Change to `true` if you miss/need the old "Raw Timing[]" display.
 */
#define LEGACY_TIMING_INFO false
/* ==================== end of TUNEABLE PARAMETERS ==================== */

/* Use turn on the save buffer feature for more complete capture coverage. */
IRrecv irrecv(kRecvPin, kCaptureBufferSize, kTimeout, true);
decode_results results; /* Somewhere to store the results */
WiFiClient client;

/* This section of code runs only once at start-up. */
void setup() {
#if defined(ESP8266)
  Serial.begin(kBaudRate, SERIAL_8N1, SERIAL_TX_ONLY);
#else /* ESP8266 */
  Serial.begin(kBaudRate, SERIAL_8N1);
#endif /* ESP8266 */
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

  Serial.print("connecting to ");
  Serial.print(host);
  Serial.print(':');
  Serial.println(port);

  /* Use WiFiClient class to create TCP connections */
  if (!client.connect(host, port)) {
    Serial.println("connection failed");
  } else {
    Serial.println("Connected!");
  }
}

/* The repeating section of the code */
void loop() {
  /* Check if the IR code has been received. */
  if (irrecv.decode(&results)) {
    if (!client.connected()) {
      Serial.println("Client disconnected, attempting reconnect...");
      if (!client.connect(host, port)) {
        Serial.println("Connection failed");
      } else {
        Serial.println("Connected!");
      }
    } else {
      if (!results.overflow && results.decode_type != UNKNOWN) {
        if (results.repeat) {
          client.println("repeat");
        } else {
          client.println(uint64ToString(results.value, 16));
        }
        yield();
      }
    }
  }
}
