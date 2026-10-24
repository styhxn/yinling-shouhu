import type { GeofenceShape } from "../../store/db.js";

const EARTH_RADIUS_M = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceToGeofence(
  point: { lat: number; lng: number },
  shape: GeofenceShape
): number {
  const [lng, lat] = shape.center;
  return distanceMeters(point.lat, point.lng, lat, lng);
}

export function isInsideGeofence(
  point: { lat: number; lng: number },
  shape: GeofenceShape
): boolean {
  if (shape.type !== "circle") return true;
  return distanceToGeofence(point, shape) <= shape.radius;
}
