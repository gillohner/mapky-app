import { config } from "@/lib/config";

const baseURL = import.meta.env.DEV ? "" : config.gateway.url;

export async function ingestUserIntoNexus(
  publicKey: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/v0/ingest/${publicKey}`, {
      method: "PUT",
    });

    if (!response.ok) {
      console.error(
        `Failed to ingest user into Nexus: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error ingesting user into Nexus:", error);
    return false;
  }
}
