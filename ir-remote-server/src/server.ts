import * as Net from "net";

export type ServerConfig = {
  /**
   * The port to run the server on
   */
  port: number;
};

export function startIRServer({ port }: ServerConfig): Net.Server {
  const server = Net.createServer();
  const subscribers: { sock: Net.Socket; devices: string[] }[] = [];

  server.listen(port, () => {
    console.log(`Server listening on port ${port}.`);
  });

  server.on("connection", (socket) => {
    console.log("Client connected");

    socket.on("data", (chunk) => {
      const data = chunk.toString().trim();

      // Handle subscribers who want to listen to IR signals from nodes
      const [, subscribeDevice] = data.match(/subscribe (\s+)/) ?? [];
      if (subscribeDevice !== undefined) {
        const sub = subscribers.find((s) => s.sock === socket);
        if (sub) {
          sub.devices.push(subscribeDevice);
        } else {
          subscribers.push({ sock: socket, devices: [subscribeDevice] });
        }

        return;
      }

      // The incoming data is not a subscription request, so forward
      // the data from this device to all subscribers
      const device = data.slice(0, data.indexOf(" "));
      if (device !== undefined) {
        subscribers
          .filter((s) => s.devices.includes(device))
          .forEach((s) => {
            s.sock.write(data);
          });
      }
    });

    socket.on("end", () => {
      console.log("Closing connection with client");

      const sub = subscribers.findIndex((s) => s.sock === socket);
      if (sub) {
        console.log("Client was a subscriber, removing from list");
        subscribers.splice(sub, 1);
      }
    });

    socket.on("error", (err) => {
      console.log(`Error: ${err}`);
    });
  });

  return server;
}
