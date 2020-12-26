import * as Net from "net";
import { DEFAULT_PORT } from "./index";

export class IRServer {
  port: number;
  server: Net.Server | null;
  subscribers: { sock: Net.Socket; devices: string[] }[] = [];

  constructor(port?: number) {
    this.port = port ?? DEFAULT_PORT;
    this.server = Net.createServer();
  }

  public stop() {
    if (this.server !== null) {
      this.server.close();
      this.server = null;
    }
  }

  public start() {
    if (this.server === null) {
      console.error("Server has been destroyed already");
      return;
    }

    this.server.listen(this.port, () => {
      console.log(`Server listening on port ${this.port}.`);
    });

    this.server.on("connection", (socket) => {
      console.log("Client connected");

      socket.on("data", (chunk) => {
        const data = chunk.toString().trim();

        // Handle subscribers who want to listen to IR signals from nodes
        const [, subscribeDevice] = data.match(/subscribe (\w+)/) ?? [];
        if (subscribeDevice !== undefined) {
          const sub = this.subscribers.find((s) => s.sock === socket);
          if (sub) {
            sub.devices.push(subscribeDevice);
          } else {
            this.subscribers.push({ sock: socket, devices: [subscribeDevice] });
          }

          socket.write(`success ${subscribeDevice}`);
          return;
        }

        // The incoming data is not a subscription request, so forward
        // the data from this device to all subscribers
        const device = data.slice(0, data.indexOf(" "));
        if (device !== undefined) {
          this.subscribers
            .filter((s) => s.devices.includes(device))
            .forEach((s) => {
              s.sock.write(data);
            });
        }
      });

      socket.on("end", () => {
        console.log("Closing connection with client");

        const sub = this.subscribers.findIndex((s) => s.sock === socket);
        if (sub) {
          console.log("Client was a subscriber, removing from list");
          this.subscribers.splice(sub, 1);
        }
      });

      socket.on("error", (err) => {
        console.log(`Error: ${err}`);
      });
    });
  }
}
