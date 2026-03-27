import axios from "axios";
import { config } from "@/lib/config";

export const nexusClient = axios.create({
  baseURL: config.nexus.url,
});
