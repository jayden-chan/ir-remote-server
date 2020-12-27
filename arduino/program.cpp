#include <Arduino.h>

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

/* ==================== start of TUNEABLE PARAMETERS ====================
 * An IR detector/demodulator is connected to GPIO pin 14
 * e.g. D5 on a NodeMCU board.
 * Note: GPIO 16 won't work on the ESP8266 as it does not have interrupts.
 */
const uint16_t kRecvPin = 14;
const uint16_t kIrLed = 4; // ESP8266 GPIO send pin to use. Recommended: 4 (D2).

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
IRsend irsend(kIrLed);  // Set the GPIO to be used to sending the message.
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
    // the remote and sending the "repeat" packets.
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

/* The repeating section of the code */
void loop() {
  if (client.connected() && client.available()) {
    uint64_t recv = 0;
    int offset = 0;

    unsigned char proto = client.read();

    while (client.available()) {
      char c = client.read();
      recv |= (c << offset);
      offset += 8;
    }

    if (proto == 0) {
      irsend.sendNEC(recv);
    } else if (proto == 1) {
      irsend.sendRC5(recv);
    } else if (proto == 2) {
      irsend.sendRCMM(recv);
    }

    Serial.println(uint64ToString(recv, 16));
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
}
