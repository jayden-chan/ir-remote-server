import { execFile } from "child_process";
import { readFileSync } from "fs";
import { KeyCodeMap, Handler, startIRServer } from "./server";
import { mousemove, showTag } from "./util";

function main() {
  const codemap: KeyCodeMap = JSON.parse(
    readFileSync("button-map.json", { encoding: "utf8" })
  );

  const getMouseFunc = (dir: string) => {
    return (repeatCount: number) => {
      const j = Math.min(100, (repeatCount + 1) * 10);
      const x = dir === "right" ? j : dir === "left" ? -j : 0;
      const y = dir === "down" ? j : dir === "up" ? -j : 0;
      mousemove([x, y]);
    };
  };

  const getTagFunc = (tag: number) => {
    return (_: number) => {
      showTag(tag);
    };
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
    UP: { func: getMouseFunc("up") },
    DOWN: { func: getMouseFunc("down") },
    LEFT: { func: getMouseFunc("left") },
    RIGHT: { func: getMouseFunc("right") },
    1: { func: getTagFunc(1) },
    2: { func: getTagFunc(2) },
    3: { func: getTagFunc(3) },
    4: { func: getTagFunc(4) },
    5: { func: getTagFunc(5) },
    6: { func: getTagFunc(6) },
  };

  startIRServer({ port: 3000, keymap, codemap, repeatDelay: 3 });
}

main();
