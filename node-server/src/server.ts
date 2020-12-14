import { execFile } from "child_process";
import * as Net from "net";
import * as xdo from "./util";

export type KeyCodeMap = {
  [key: string]: string;
};

export type Handler = Partial<{
  key: string;
  mouse: Partial<{
    moveTo: [number, number];
    move: [number, number];
    click: "right" | "left" | "middle" | "up" | "down";
  }>;
  func: (repeatCount: number) => void;
  command: string[];
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

export function startIRServer({
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
      if (process.argv.includes("--debug")) {
        console.log(`Data: "${data}" Key: "${key}"`);
      }

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
        if (repeatCount >= delay) {
          if (keymap[prevCode] !== undefined) {
            execHandler(keymap[prevCode], repeatCount - delay + 1);
          } else {
            console.log(
              `No handler registered for ${prevCode} (repeat ${repeatCount})`
            );
          }
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
    xdo.key(handler.key);
  } else if (handler.func) {
    handler.func(repeatCount);
  } else if (handler.command) {
    execFile(handler.command[0], handler.command.slice(1));
  } else if (handler.mouse) {
    const mouse = handler.mouse;
    if (mouse.moveTo) {
      xdo.mousejump(mouse.moveTo);
    } else if (mouse.move) {
      xdo.mousemove(mouse.move);
    } else if (mouse.click) {
      xdo.click(mouse.click);
    }
  }
}
