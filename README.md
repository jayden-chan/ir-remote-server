# IR Remote Server

Receive and transmit IR remote control codes over the network using NodeJS and ESP8266
microcontrollers.

## Installation
```
yarn add ir-remote-server
```
or
```
npm install ir-remote-server
```

## Usage
Before setting up the typescript code you will need to upload the Arduino code to the
ESP8266 using the Arduino IDE and a USB cable. After the first upload you can deploy the
device and make over-the-air updates with WiFi.

### Server side
```typescript
import { IRServer } from "ir-remote-server";

const server = new IRServer({
  port: 10765,
  shouldLog: false,
});

server.start();
```

### Client side
```typescript
import { KeyCodeMap, Handler, IRSubscriber, IRUtil } from "ir-remote-server";
const { mousemove, key, click } = IRUtil;

const codemap: KeyCodeMap = JSON.parse(
  // Maps hex codes to human readable names
  // Ex: { "40BDA25D": "HOME", "40BD4FB0": "SOURCE" }
  readFileSync("button-map.json", { encoding: "utf8" })
);

const keymap: {
  [key: string]: Handler;
} = {
  HOME: { key: "space" },
  LIVETV: { key: "Left" },
  CHANNELUP: { mouse: { scroll: "up" } },
  CHANNELDOWN: { mouse: { scroll: "down" } },
  MENU: { key: "f" },
  INFO: { key: "alt+Tab" },
  LAST: { key: "V" },
  RECORD: { key: "ctrl+v" },
  MUTE: { key: "m" },
  STOP: { key: "ctrl+q" },
  SERVER: { func: () => { console.log('"Server" button pressed') } },
  YELLOW: { spawn: ["vlc"] },
  RED: { command: ["xdg-open", "https://www.youtube.com"] },
};

const subscriber = new IRSubscriber({
  host: "192.168.1.255",
  keymaps: { "1": keymap },
  codemap,
  repeatDelay: 3,
});

subscriber.start();
subscriber.subscribe("1").catch((err) => {
  console.error(`Failed to subscribe: ${err}`);
  subscriber.close();
});
```
