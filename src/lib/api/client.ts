import axios from "axios";
import { config } from "@/lib/config";

// In dev, Vite proxies /v0 → nexus (avoids CORS).
// In production, use the full nexus URL.
const baseURL = import.meta.env.DEV ? "" : config.nexus.url;

export const nexusClient = axios.create({
  baseURL,
});
