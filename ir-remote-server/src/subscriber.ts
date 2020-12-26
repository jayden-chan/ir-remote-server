import { execFile, spawn } from "child_process";
import * as Net from "net";
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
  port: number;
  /**
   * The hostname of the server
   */
  host: string;
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
  private delay = 0;
  private prevCode = "";
  private repeatCount = 0;
  private codemap: KeyCodeMap;
  private keymaps: { [key: string]: Keymap };

  constructor({ port, host, keymaps, repeatDelay, codemap }: SubscriberConfig) {
    this.socket = Net.connect({ port, host });
    this.codemap = codemap;
    this.keymaps = keymaps;
    if (repeatDelay) {
      this.delay = repeatDelay;
    }
  }

  public async subscribe(device: string): Promise<void> {
    this.socket.write(`subscribe ${device}`);
  }

  public listen(): void {
    this.socket.on("data", (c) => {
      const chunk = c.toString().trim();
      const [, connectSuccess] = chunk.match(/success (\w+)/) ?? [];
      if (connectSuccess !== undefined) {
        console.log(`Successfully connected to device ${connectSuccess}`);
        return;
      }

      const [, device, data] = chunk.match(/(\w+) (\w+)/) ?? [];
      if (device === undefined || data === undefined) {
        console.error(
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
      console.error(`No keymap found for device ${device}`);
      return;
    }

    if (key !== undefined) {
      this.prevCode = key;
      this.repeatCount = 0;

      if (keymap[key] !== undefined) {
        execHandler(keymap[key], this.repeatCount);
      } else {
        console.error(`No handler registered for ${key}`);
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
        console.error(
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
