export type LocationError = "unsupported" | "denied" | "unavailable" | "timeout";

export interface Coordinates { latitude: number; longitude: number }

// Pede a posição ao navegador (só deve ser chamada quando o usuário pediu).
export function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject("unsupported" satisfies LocationError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) =>
        reject((error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable") satisfies LocationError),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

// Descobre se a permissão já foi dada, SEM abrir o pedido na tela.
export async function getLocationPermission(): Promise<PermissionState | "unsupported"> {
  try {
    if (!navigator.permissions) return "unsupported";
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "unsupported";
  }
}
