import {
  Banknote,
  Beer,
  BookOpen,
  Bus,
  Camera,
  Church,
  Coffee,
  Cross,
  Dumbbell,
  Film,
  Fuel,
  GraduationCap,
  Hotel,
  Landmark,
  type LucideIcon,
  Mail,
  MapPin,
  ParkingMeter,
  Pill,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Train,
  TreePine,
  Utensils,
} from "lucide-react";

/**
 * Map Nominatim's `type` field (sub-tag value, e.g. "restaurant",
 * "cafe", "hotel") to a Lucide icon. Falls back to `MapPin` for
 * anything we don't have a specific icon for.
 *
 * Kept small on purpose — only the categories that actually
 * communicate something distinct on a tiny map marker. Generic
 * "amenity" / "yes" / "unclassified" stays on the default.
 */
const ICONS: Record<string, LucideIcon> = {
  // Food & drink
  restaurant: Utensils,
  food_court: Utensils,
  fast_food: Utensils,
  cafe: Coffee,
  ice_cream: Coffee,
  bar: Beer,
  pub: Beer,
  biergarten: Beer,
  nightclub: Beer,

  // Lodging
  hotel: Hotel,
  hostel: Hotel,
  guest_house: Hotel,
  motel: Hotel,
  apartment: Hotel,

  // Shopping
  shop: ShoppingBag,
  supermarket: ShoppingCart,
  marketplace: ShoppingCart,
  convenience: ShoppingCart,
  mall: ShoppingBag,
  bakery: ShoppingBag,
  butcher: ShoppingBag,

  // Money
  bank: Banknote,
  atm: Banknote,
  bureau_de_change: Banknote,

  // Health
  pharmacy: Pill,
  hospital: Cross,
  clinic: Cross,
  doctors: Cross,
  dentist: Cross,
  veterinary: Cross,

  // Education
  school: GraduationCap,
  university: GraduationCap,
  college: GraduationCap,
  kindergarten: GraduationCap,
  library: BookOpen,

  // Nature & leisure
  park: TreePine,
  garden: TreePine,
  forest: TreePine,
  fitness_centre: Dumbbell,
  fitness_station: Dumbbell,
  gym: Dumbbell,
  sports_centre: Dumbbell,

  // Culture & tourism
  museum: Landmark,
  monument: Landmark,
  memorial: Landmark,
  attraction: Camera,
  viewpoint: Camera,
  artwork: Camera,
  gallery: Camera,
  cinema: Film,
  theatre: Film,
  arts_centre: Film,

  // Religion
  place_of_worship: Church,
  church: Church,
  cathedral: Church,
  monastery: Church,

  // Transport
  bus_station: Bus,
  bus_stop: Bus,
  train_station: Train,
  station: Train,
  airport: Plane,
  aerodrome: Plane,
  fuel: Fuel,
  charging_station: Fuel,
  parking: ParkingMeter,

  // Services
  post_office: Mail,
  post_box: Mail,
};

export function categoryIcon(type: string | null | undefined): LucideIcon {
  if (!type) return MapPin;
  return ICONS[type] ?? MapPin;
}
