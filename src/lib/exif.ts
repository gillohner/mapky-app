import exifr from "exifr";

export interface GeoExif {
  lat?: number;
  lon?: number;
  heading?: number;
  pitch?: number;
  /** UNIX microseconds — DateTimeOriginal */
  capturedAt?: number;
  /** True when XMP GPano.ProjectionType === "equirectangular" OR image has 2:1 aspect ratio */
  isEquirectangular?: boolean;
}

/** Check if an image has 2:1 aspect ratio (equirectangular heuristic). */
export function checkEquirectangularAspect(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      URL.revokeObjectURL(img.src);
      resolve(Math.abs(ratio - 2.0) < 0.05);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(false);
    };
    img.src = URL.createObjectURL(file);
  });
}

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export function isHeic(file: File): boolean {
  return HEIC_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name);
}

export async function extractGeoExif(file: File): Promise<GeoExif> {
  if (isHeic(file)) {
    throw new Error("HEIC files aren't supported yet — please export as JPEG.");
  }

  try {
    // exifr's `pick` option DOES NOT return the computed `latitude`/`longitude`
    // virtual fields — only raw tag names literally in the pick list. Using
    // pick silently drops GPS from the result. Parse everything relevant and
    // read the computed fields directly.
    const parsed = (await exifr.parse(file, {
      gps: true,
      xmp: true,
      exif: true,
    })) as Record<string, unknown> | undefined;

    if (!parsed) return {};

    const lat =
      typeof parsed.latitude === "number" ? parsed.latitude : undefined;
    const lon =
      typeof parsed.longitude === "number" ? parsed.longitude : undefined;
    const heading =
      typeof parsed.GPSImgDirection === "number"
        ? parsed.GPSImgDirection
        : undefined;
    const pitch =
      typeof parsed.GPSPitch === "number" ? parsed.GPSPitch : undefined;

    const dt = parsed.DateTimeOriginal;
    const capturedAt =
      dt instanceof Date
        ? dt.getTime() * 1000
        : typeof dt === "number"
          ? dt * 1000
          : undefined;

    // Equirectangular detection — XMP GPano namespace, either as
    // `ProjectionType` directly or nested under `GPano.ProjectionType`.
    const directProj = parsed.ProjectionType;
    const gpano = parsed.GPano as { ProjectionType?: unknown } | undefined;
    const projType =
      typeof directProj === "string"
        ? directProj
        : typeof gpano?.ProjectionType === "string"
          ? gpano.ProjectionType
          : undefined;
    const isEquirectangular =
      projType != null && projType.toLowerCase() === "equirectangular";

    return { lat, lon, heading, pitch, capturedAt, isEquirectangular };
  } catch {
    return {};
  }
}
