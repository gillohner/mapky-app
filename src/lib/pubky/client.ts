import { Pubky, Client, Keypair, Session, PublicKey } from "@synonymdev/pubky";
import { config, isTestnet } from "@/lib/config";

export class PubkyClient {
  private static createPubky(): Pubky {
    if (config.env === "testnet") {
      return Pubky.testnet();
    }
    const client = new Client({ pkarr: { relays: config.pkarr.relays } });
    return Pubky.withClient(client);
  }

  static restoreFromRecoveryFile(
    recoveryFile: Uint8Array,
    passphrase: string,
  ): Keypair {
    return Keypair.fromRecoveryFile(recoveryFile, passphrase);
  }

  async signin(keypair: Keypair): Promise<Session> {
    const pubky = PubkyClient.createPubky();
    const signer = pubky.signer(keypair);

    if (isTestnet) {
      const homeserverKey = PublicKey.from(config.homeserver.publicKey);
      return signer.signup(homeserverKey);
    }

    return signer.signin();
  }
}

export const pubkyClient = new PubkyClient();
