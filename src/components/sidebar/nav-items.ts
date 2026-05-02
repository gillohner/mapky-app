import {
  Camera,
  FolderHeart,
  MapPin,
  MessageSquare,
  Route as RouteIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Top-level navigation destinations rendered both by `IconRail`
 * (desktop, vertical icons) and `MobileNavDrawer` (mobile, full-width
 * rows with labels). Add a new entry here and both surfaces pick it
 * up.
 */
export type NavTarget =
  | "/places"
  | "/collections"
  | "/routes"
  | "/captures"
  | "/my-posts";

export interface NavItem {
  to: NavTarget;
  label: string;
  icon: LucideIcon;
  /** When true, only render this item for authenticated users. */
  requiresAuth?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/places", label: "Places", icon: MapPin },
  { to: "/collections", label: "Collections", icon: FolderHeart },
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/captures", label: "Captures", icon: Camera },
  { to: "/my-posts", label: "My Posts", icon: MessageSquare, requiresAuth: true },
];

/**
 * Map a nav target to the URL prefix that counts as "active" for it.
 * Detail pages (e.g. `/place/$id`) belong to their list nav (`/places`).
 */
export function navMatch(to: NavTarget): string {
  switch (to) {
    case "/places":
      return "/place"; // matches /places, /place/...
    case "/collections":
      return "/collection"; // matches /collections, /collection/...
    case "/routes":
      return "/route"; // matches /routes, /route/...
    case "/captures":
      return "/capture"; // matches /captures, /capture/...
    case "/my-posts":
      return "/my-posts";
  }
}
