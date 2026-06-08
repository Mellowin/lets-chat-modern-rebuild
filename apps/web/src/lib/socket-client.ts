import { io, type Socket } from "socket.io-client";
import { getWsUrl } from "./env";

const WS_URL = getWsUrl();

export function createSocket(token: string): Socket {
  return io(WS_URL, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: true,
  });
}
