import { createApp } from "./app";
import { createServer as createHttpServer } from "node:http";

export function createServer() {
  const app = createApp();
  return createHttpServer(app);
}
