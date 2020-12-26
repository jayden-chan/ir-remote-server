import { execFile, spawn } from "child_process";
import * as Net from "net";

import { DEFAULT_PORT } from "./index";
import * as util from "./util";

export type KeyCodeMap = {
  [key: string]: string;
};

export type Keymap = {
  [key: string]: Handler;
};

export type Handler = Partial<{
  delay: number;
  key: string;
  mouse: Partial<{
    moveTo: [number, number];
    move: [number, number];
    click: "right" | "left" | "middle";
    scroll: "up" | "down";
  }>;
  func: (repeatCount: number) => void;
  command: string[];
  spawn: string[];
}>;

export type SubscriberConfig = {
  /**
   * The port of the server
   */
  port?: number;

  /**
   * The hostname of the server
   */
  host: string;

  /**
   * Whether or not to emit logs to stdout
   */
  shouldLog?: boolean;

  /**
   * The number of key repeat codes to skip before
   * resuming invocation of the key handler
   */
  repeatDelay?: number;

  /**
   * The mapping between key Hex codes and human-readable
   * key codes (ex. 40BD01FE -> HOME)
   */
  codemap: KeyCodeMap;

  /**
   * The handlers for the key codes
   */
  keymaps: {
    [key: string]: Keymap;
  };
};

export class IRSubscriber {
  private socket: Net.Socket;
  private delay: number;
  private prevCode = "";
  private repeatCount = 0;
  private codemap: KeyCodeMap;
  private keymaps: { [key: string]: Keymap };
  private shouldLog: boolean;

  constructor({
    port,
    host,
    keymaps,
    repeatDelay,
    codemap,
    shouldLog,
  }: SubscriberConfig) {
    this.socket = Net.connect({ port: port ?? DEFAULT_PORT, host });
    this.codemap = codemap;
    this.keymaps = keymaps;
    this.shouldLog = shouldLog ?? true;
    this.delay = repeatDelay ?? 0;
  }

  public async subscribe(device: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.write(`subscribe ${device}`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private log(message?: any, ...optionalParams: any[]) {
    if (this.shouldLog) {
      if (optionalParams && optionalParams.length > 0) {
        console.log(message, optionalParams);
      } else {
        console.log(message);
      }
    }
  }

  private error(message?: any, ...optionalParams: any[]) {
    if (this.shouldLog) {
      if (optionalParams && optionalParams.length > 0) {
        console.error(message, optionalParams);
      } else {
        console.error(message);
      }
    }
  }

  public start() {
    this.socket.on("data", (c) => {
      const chunk = c.toString().trim();
      const [, connectSuccess] = chunk.match(/success (\w+)/) ?? [];
      if (connectSuccess !== undefined) {
        this.log(`Successfully connected to device ${connectSuccess}`);
        return;
      }

      const [, device, data] = chunk.match(/(\w+) (\w+)/) ?? [];
      if (device === undefined || data === undefined) {
        this.error(
          `Recived chunk but was unable to extract device/data: ${chunk}`
        );
        return;
      }

      this.handleDevicePacket(device, data);
    });
  }

  public close(): void {
    this.socket.destroy();
  }

  private handleDevicePacket(device: string, data: string): void {
    const key = this.codemap[data];
    const keymap = this.keymaps[device];
    if (keymap === undefined) {
      this.error(`No keymap found for device ${device}`);
      return;
    }

    if (key !== undefined) {
      this.prevCode = key;
      this.repeatCount = 0;

      if (keymap[key] !== undefined) {
        execHandler(keymap[key], this.repeatCount);
      } else {
        this.error(`No handler registered for ${key}`);
      }
    } else if (data === "repeat") {
      this.repeatCount += 1;
      if (keymap[this.prevCode] !== undefined) {
        const handler = keymap[this.prevCode];
        if (handler.delay !== undefined && this.repeatCount >= handler.delay) {
          execHandler(keymap[this.prevCode], this.repeatCount);
        } else if (this.repeatCount >= this.delay) {
          execHandler(keymap[this.prevCode], this.repeatCount - this.delay + 1);
        }
      } else {
        this.error(
          `No handler registered for ${this.prevCode} (repeat ${this.repeatCount})`
        );
      }
    }
  }
}

function execHandler(handler: Handler, repeatCount: number): void {
  if (handler.key) {
    util.key(handler.key);
  } else if (handler.func) {
    handler.func(repeatCount);
  } else if (handler.spawn) {
    spawn(handler.spawn[0], handler.spawn.slice(1));
  } else if (handler.command) {
    execFile(handler.command[0], handler.command.slice(1));
  } else if (handler.mouse) {
    const mouse = handler.mouse;
    if (mouse.moveTo) {
      util.mousejump(mouse.moveTo);
    } else if (mouse.move) {
      util.mousemove(mouse.move);
    } else if (mouse.click) {
      util.click(mouse.click);
    } else if (mouse.scroll) {
      util.scroll(mouse.scroll);
    }
  }
}
