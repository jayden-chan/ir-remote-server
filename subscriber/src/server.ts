import { execFile, spawn } from "child_process";
import * as Net from "net";
import * as util from "./util";

export { util };

export type KeyCodeMap = {
  [key: string]: string;
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

export type ServerConfig = {
  /**
   * The port to run the server on
   */
  port: number;
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
  keymap: {
    [key: string]: Handler;
  };
};

export function startIRSubscriber({
  port,
  keymap,
  repeatDelay,
  codemap,
}: ServerConfig): Net.Server {
  const server = Net.createServer();
  const delay = repeatDelay ?? 0;

  let prevCode = "";
  let repeatCount = 0;
  server.listen(port, () => {
    console.log(`Server listening on port ${port}.`);
  });

  server.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("data", (chunk) => {
      const data = chunk.toString().trim();
      const key = codemap[data];

      if (key !== undefined) {
        prevCode = key;
        repeatCount = 0;

        if (keymap[key] !== undefined) {
          execHandler(keymap[key], repeatCount);
        } else {
          console.log(`No handler registered for ${key}`);
        }
      } else if (data === "repeat") {
        repeatCount += 1;
        if (keymap[prevCode] !== undefined) {
          const handler = keymap[prevCode];
          if (handler.delay !== undefined && repeatCount >= handler.delay) {
            execHandler(keymap[prevCode], repeatCount);
          } else if (repeatCount >= delay) {
            execHandler(keymap[prevCode], repeatCount - delay + 1);
          }
        } else {
          console.log(
            `No handler registered for ${prevCode} (repeat ${repeatCount})`
          );
        }
      }
    });

    socket.on("end", () => {
      console.log("Closing connection with client");
    });

    socket.on("error", (err) => {
      console.log(`Error: ${err}`);
    });
  });

  return server;
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
