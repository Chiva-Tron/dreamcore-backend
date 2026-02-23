import express from "express";
import { registerRequestContext } from "./middleware/request-context";
import { registerRoutes } from "./routes";
import { notFoundHandler } from "./middleware/not-found";
import { errorHandler } from "./middleware/error-handler";
import { requestLoggingMiddleware } from "./middleware/request-logging";
import { requireJsonContentType } from "./middleware/require-json-content-type";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(requireJsonContentType);
  app.use(express.json({ limit: "256kb" }));
  app.use(registerRequestContext);
  app.use(requestLoggingMiddleware);

  registerRoutes(app);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
