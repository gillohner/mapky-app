export type PubkyEnvironment = "testnet" | "staging" | "production";

interface MapkyConfig {
  env: PubkyEnvironment;

  pkarr: {
    relays: string[];
  };

  homeserver: {
    publicKey: string;
    url: string;
  };

  relay: {
    url: string;
  };

  nexus: {
    url: string;
  };

  gateway: {
    url: string;
    baseFilePath: string;
    baseAvatarPath: string;
  };

  profile: {
    path: string;
  };

  protomaps: {
    url: string;
    key: string;
  };
}

const DEFAULT_HOMESERVERS: Record<PubkyEnvironment, string> = {
  testnet: "8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo",
  staging: "ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy",
  production: "ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy",
};

const DEFAULT_HOMESERVER_URLS: Record<PubkyEnvironment, string> = {
  testnet: "http://localhost:6286",
  staging: "https://homeserver.staging.pubky.app",
  production: "https://homeserver.pubky.app",
};

const DEFAULT_RELAYS: Record<PubkyEnvironment, string> = {
  testnet: "http://localhost:15412/link",
  staging: "https://httprelay.staging.pubky.app/link/",
  production: "https://httprelay.pubky.app/link/",
};

const DEFAULT_GATEWAYS: Record<PubkyEnvironment, string> = {
  testnet: "http://localhost:8080",
  staging: "https://nexus.staging.pubky.app",
  production: "https://nexus.pubky.app",
};

const DEFAULT_PKARR_RELAYS: string[] = [
  "https://pkarr.pubky.app",
  "https://pkarr.pubky.org",
];

function getEnvironment(): PubkyEnvironment {
  const env = import.meta.env.VITE_PUBKY_ENV?.toLowerCase();
  if (env === "testnet" || env === "staging" || env === "production") {
    return env;
  }
  return "staging";
}

function buildConfig(): MapkyConfig {
  const environment = getEnvironment();

  const parseRelays = (value: string | undefined): string[] => {
    if (!value) return DEFAULT_PKARR_RELAYS;
    const relays = value
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    return relays.length ? relays : DEFAULT_PKARR_RELAYS;
  };

  return {
    env: environment,

    pkarr: {
      relays: parseRelays(import.meta.env.VITE_PKARR_RELAYS),
    },

    homeserver: {
      publicKey:
        import.meta.env.VITE_PUBKY_HOMESERVER ||
        DEFAULT_HOMESERVERS[environment],
      url:
        import.meta.env.VITE_PUBKY_HOMESERVER_URL ||
        DEFAULT_HOMESERVER_URLS[environment],
    },

    relay: {
      url: import.meta.env.VITE_PUBKY_RELAY || DEFAULT_RELAYS[environment],
    },

    nexus: {
      url: import.meta.env.VITE_NEXUS_URL || DEFAULT_GATEWAYS[environment],
    },

    gateway: {
      url:
        import.meta.env.VITE_PUBKY_GATEWAY || DEFAULT_GATEWAYS[environment],
      baseFilePath:
        import.meta.env.VITE_PUBKY_GATEWAY_BASE_FILE_PATH || "/static/files",
      baseAvatarPath:
        import.meta.env.VITE_PUBKY_GATEWAY_BASE_AVATAR_PATH ||
        "/static/avatar",
    },

    profile: {
      path:
        import.meta.env.VITE_PUBKY_PROFILE_PATH ||
        "/pub/pubky.app/profile.json",
    },

    protomaps: {
      url:
        import.meta.env.VITE_PROTOMAPS_URL ||
        "https://api.protomaps.com/tiles/v4.pmtiles",
      key: import.meta.env.VITE_PROTOMAPS_KEY || "",
    },
  };
}

export const config: MapkyConfig = buildConfig();

export const isTestnet = config.env === "testnet";
export const isProduction = config.env === "production";
