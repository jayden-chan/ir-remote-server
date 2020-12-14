import { readFileSync } from "fs";
import { execFile } from "child_process";
import * as Net from "net";
const PORT = 3000;

// Mapping from button hex code to human readable code
type ButtonMap = {
  [key: string]: string;
};

const MAP: ButtonMap = JSON.parse(
  readFileSync("button-map.json", { encoding: "utf8" })
);

function main() {
  const server = Net.createServer();
  let prev_code = "";
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}.`);
  });

  server.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("data", (chunk) => {
      const data = chunk.toString().trim();
      const key = MAP[data];
      if (process.argv.includes("--debug")) {
        console.log(`Data: ${data} Key: ${key}`);
      }

      if (key !== undefined) {
        prev_code = key;

        if (keymap[key] !== undefined) {
          execHandler(keymap[key]);
        } else {
          console.log(key);
        }
      } else if (data === "repeat") {
        if (keymap[prev_code] !== undefined) {
          execHandler(keymap[prev_code]);
        } else {
          console.log(`${prev_code} (repeat)`);
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
}

function execHandler(handler: Handler): void {
  if (handler.key) {
    execFile("xdotool", ["key", handler.key]);
  } else if (handler.func) {
    handler.func();
  } else if (handler.command) {
    execFile(handler.command[0], handler.command.slice(1));
  } else if (handler.mouse) {
    const mouse = handler.mouse;
    if (mouse.moveTo) {
      const [x, y] = mouse.moveTo;
      execFile("xdotool", ["mousemove", "--", `${x}`, `${y}`]);
    } else if (mouse.move) {
      const [x, y] = mouse.move;
      execFile("xdotool", ["mousemove_relative", "--", `${x}`, `${y}`]);
    } else if (mouse.click) {
      let code = 1;
      switch (mouse.click) {
        /* prettier-ignore */ case "left": code = 1; break;
        /* prettier-ignore */ case "middle": code = 2; break;
        /* prettier-ignore */ case "right": code = 3; break;
        /* prettier-ignore */ case "up": code = 4; break;
        /* prettier-ignore */ case "down": code = 5; break;
      }
      execFile("xdotool", ["click", `${code}`]);
    }
  }
}

type Handler = {
  key?: string;
  mouse?: {
    moveTo?: [number, number];
    move?: [number, number];
    click?: "right" | "left" | "middle" | "up" | "down";
  };
  func?: () => void;
  command?: string[];
};

const keymap: {
  [key: string]: Handler;
} = {
  OK: { mouse: { click: "left" } },
  HOME: { key: "space" },
  LIVETV: { key: "Left" },
  GUIDE: { key: "Right" },
  VOLUP: { key: "Up" },
  VOLDOWN: { key: "Down" },
  MENU: { key: "f" },
  LAST: { key: "V" },
  STOP: { key: "ctrl+q" },
  VOD: { mouse: { click: "right" } },
};

main();
