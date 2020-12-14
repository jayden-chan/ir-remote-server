import { execFile } from "child_process";

export function showTag(tag: number): void {
  const code = `local awful = require("awful")
local screen = awful.screen.focused()
local tag = screen.tags[${tag}]
if tag then
    tag:view_only()
end`;

  execFile("awesome-client", [code]);
}

export function key(code: string): void {
  execFile("xdotool", ["key", code]);
}

export function keys(keys: string[]): void {
  execFile("xdotool", ["key", ...keys]);
}

export type MouseButton = "left" | "middle" | "right" | "up" | "down";
export function click(button: MouseButton): void {
  let code = 1;
  switch (button) {
    /* prettier-ignore */ case "left": code = 1; break;
    /* prettier-ignore */ case "middle": code = 2; break;
    /* prettier-ignore */ case "right": code = 3; break;
    /* prettier-ignore */ case "up": code = 4; break;
    /* prettier-ignore */ case "down": code = 5; break;
  }
  execFile("xdotool", ["click", `${code}`]);
}

export function scroll(direction: "up" | "down"): void {
  if (direction == "down") {
    execFile("xdotool", ["click", "--repeat", "5", "5"]);
  } else {
    execFile("xdotool", ["click", "--repeat", "5", "4"]);
  }
}

export function mousejump([x, y]: [number, number]): void {
  execFile("xdotool", ["mousemove", "--", `${x}`, `${y}`]);
}

export function mousemove([x, y]: [number, number]): void {
  execFile("xdotool", ["mousemove_relative", "--", `${x}`, `${y}`]);
}

export function notify(title: string, message: string, icon: string): void {
  execFile("notify-send", [title, message, "-i", icon, "-t", "3000"]);
}
