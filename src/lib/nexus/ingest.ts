import { config } from "@/lib/config";

export async function ingestUserIntoNexus(
  publicKey: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${config.gateway.url}/v0/ingest/${publicKey}`,
      { method: "PUT" },
    );

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
