import { readFileSync } from "fs";
import { KeyCodeMap, Handler, startIRSubscriber } from "./server";
import { mousemove, showTag, key, click } from "./util";

function main() {
  const codemap: KeyCodeMap = JSON.parse(
    readFileSync("button-map.json", { encoding: "utf8" })
  );

  let mousemode = true;

  const getMouseFunc = (dir: string) => {
    return (repeatCount: number) => {
      if (mousemode) {
        const j = Math.min(100, (repeatCount + 1) * 10);
        const x = dir === "right" ? j : dir === "left" ? -j : 0;
        const y = dir === "down" ? j : dir === "up" ? -j : 0;
        mousemove([x, y]);
      } else {
        switch (dir) {
          /* prettier-ignore */ case "up": key("Up"); break;
          /* prettier-ignore */ case "down": key("Down"); break;
          /* prettier-ignore */ case "left": key("Left"); break;
          /* prettier-ignore */ case "right": key("Right"); break;
        }
      }
    };
  };

  const okFunc = () => {
    if (mousemode) {
      click("left");
    } else {
      key("Return");
    }
  };

  const getTagFunc = (tag: number) => {
    return (_: number) => {
      showTag(tag);
    };
  };

  const keymap: {
    [key: string]: Handler;
  } = {
    OK: { func: okFunc },
    HOME: { key: "space" },
    LIVETV: { key: "Left" },
    GUIDE: { key: "Right" },
    VOLUP: { key: "Up" },
    VOLDOWN: { key: "Down" },
    CHANNELUP: { mouse: { scroll: "up" } },
    CHANNELDOWN: { mouse: { scroll: "down" } },
    MENU: { key: "f" },
    INFO: { key: "alt+Tab" },
    BACK: { key: "BackSpace" },
    LAST: { key: "V" },
    RECORD: { key: "ctrl+v" },
    MUTE: { key: "m" },
    STOP: { key: "ctrl+q" },
    SERVER: { func: () => (mousemode = !mousemode) },
    VOD: { mouse: { click: "right" } },
    UP: { func: getMouseFunc("up"), delay: 1 },
    DOWN: { func: getMouseFunc("down"), delay: 1 },
    LEFT: { func: getMouseFunc("left"), delay: 1 },
    RIGHT: { func: getMouseFunc("right"), delay: 1 },
    1: { func: getTagFunc(1) },
    2: { func: getTagFunc(2) },
    3: { func: getTagFunc(3) },
    4: { func: getTagFunc(4) },
    5: { func: getTagFunc(5) },
    6: { func: getTagFunc(6) },
    YELLOW: { spawn: ["vlc"] },
    RED: {
      command: ["xdg-open", "https://www.youtube.com/feed/subscriptions"],
    },
    BLUE: {
      command: ["xdg-open", "https://www.twitch.tv/directory/following/live"],
    },
  };

  startIRSubscriber({ port: 4343, keymap, codemap, repeatDelay: 3 });
}

main();
