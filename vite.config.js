import { defineConfig } from "vite";
import { handleChatRequest } from "./src/chat-api.js";

export default defineConfig(() => {
  const gemmaApi = {
    name: "gemma-chat",
    configureServer(server) {
      server.middlewares.use("/api/chat", (req, res) => {
        handleChatRequest(req, res);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/chat", (req, res) => {
        handleChatRequest(req, res);
      });
    },
  };

  return {
    server: { host: "0.0.0.0", port: 5173 },
    preview: { host: "0.0.0.0", port: 4173 },
    plugins: [gemmaApi],
  };
});
