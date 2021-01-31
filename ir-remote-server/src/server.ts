import * as Net from "net";
import { DEFAULT_PORT } from "./index";

export type ServerConfig = {
  /**
   * Which port to listen on
   */
  port?: number;

  /**
   * Whether or not to emit logs to stdout
   */
  shouldLog?: boolean;
};

export class IRServer {
  port: number;
  shouldLog: boolean;
  server: Net.Server | null;
  subscribers: { sock: Net.Socket; devices: string[] }[] = [];
  devices: { sock: Net.Socket; id: string }[] = [];

  constructor(config?: ServerConfig) {
    const { port = DEFAULT_PORT, shouldLog = true } = config ?? {};
    this.port = port;
    this.shouldLog = shouldLog;
    this.server = Net.createServer();
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

  public stop() {
    if (this.server !== null) {
      this.server.close();
      this.server = null;
    }
  }

  public start() {
    if (this.server === null) {
      this.error("Server has been destroyed already");
      return;
    }

    this.server.listen(this.port, () => {
      this.log(`Server listening on port ${this.port}.`);
    });

    this.server.on("connection", (socket) => {
      this.log("Client connected");
      // The server is responsible for forwarding packets from the IR nodes
      // to subscribers, as well as sending packets to the IR nodes for emitting
      // codes. We can't have these packet timings being changed by Nagle's algorithm
      // because it leads to weird timings when pressing buttons on a remote
      // (especially when holding down a button)
      socket.setNoDelay(true);

      socket.on("data", (chunk) => {
        const data = chunk.toString().trim();
        if (data.length === 0) return;
        if (process.env.IRS_DEBUG) {
          this.log(data);
        }

        // Handle subscribers who want to listen to IR signals from nodes
        const [, subscribeDevice] = data.match(/subscribe (\w+)/) ?? [];
        if (subscribeDevice !== undefined) {
          if (this.devices.every((d) => d.id !== subscribeDevice)) {
            this.error(
              `${socket.remoteAddress} tried to subscribe to device ${subscribeDevice} but it was not registered`
            );
            socket.write(`fail device ${subscribeDevice} is not registered`);
            return;
          }

          const sub = this.subscribers.find((s) => s.sock === socket);
          if (sub) {
            sub.devices.push(subscribeDevice);
          } else {
            this.subscribers.push({ sock: socket, devices: [subscribeDevice] });
          }

          this.log(
            `Added subscription from ${socket.remoteAddress} to ${subscribeDevice}`
          );
          socket.write(`success ${subscribeDevice}`);
          return;
        }

        // Handle device registration requests
        const [, deviceRegister] = data.match(/register (\w+)/) ?? [];
        if (deviceRegister !== undefined) {
          this.log(`Registering device ${deviceRegister}`);
          const existing = this.devices.findIndex(
            (d) => d.id === deviceRegister
          );
          if (existing !== -1) {
            this.log(`Device was previously registered, removing old entry`);
            this.devices.splice(existing, 1);
          }

          this.devices.push({ sock: socket, id: deviceRegister });
          return;
        }

        // Send IR signals using an IR node
        const [, protocol, repeat_count, num_bits, sendDevice, sendData] =
          data.match(/send (\w+) (\d+) (\d+) (\w+) (\w+)/) ?? [];
        if (protocol !== undefined) {
          const dev = this.devices.find((d) => d.id === sendDevice);
          if (dev === undefined) {
            this.error(
              `Attempted to send data to device "${sendDevice}" but device was not found`
            );
            return;
          }

          const paddedData =
            sendData.length % 2 !== 0 ? `0${sendData}` : sendData;
          const hexMatches = paddedData.match(/\w{1,2}/g);
          if (hexMatches === null) {
            this.error(`Send data (${paddedData}) is in the wrong format`);
            return;
          }

          let protoByte = 0;
          switch (protocol) {
            /* prettier-ignore */ case "NEC": protoByte = 0; break;
            /* prettier-ignore */ case "RC5": protoByte = 1; break;
            /* prettier-ignore */ case "RCMM": protoByte = 2; break;
          }

          const repeatCountByte = parseInt(repeat_count);
          const numBitsByte = parseInt(num_bits);

          const code = hexMatches.map((byte) => parseInt(byte, 16)).reverse();
          const data = [protoByte, repeatCountByte, numBitsByte, ...code];
          this.log(`Sending [${data.join(",")}] to device ${dev.id}`);
          dev.sock.write(new Uint8Array(data));

          return;
        }

        // The incoming data doesn't match any special commands so
        // it must be data from an IR device, forward it to the subscribers
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
        this.log("Closing connection with client");

        const sub = this.subscribers.findIndex((s) => s.sock === socket);
        if (sub !== -1) {
          this.log("Client was a subscriber, removing from list");
          this.subscribers.splice(sub, 1);
        }
      });

      socket.on("error", (err) => {
        this.log(`Error: ${err}`);
      });
    });
  }
}
