/* Todas as chaves que o Weather Lab grava no navegador, num só lugar. */

export const SETTINGS_KEY = "weather-lab-settings";
export const FAVORITES_KEY = "weather-lab-favorites";
export const OLD_FAVORITES_KEY = "weather-lab-saved-cities";
export const RECENT_KEY = "weather-lab-recent";
export const LAST_CITY_KEY = "weather-lab-last-city";
export const MAP_CACHE_KEY = "weather-lab-map-grid-v1";

// Guardada só enquanto a aba está aberta (evita repetir a mesma notificação).
export const ALERTS_SENT_KEY = "weather-lab-alerts-sent";

// Tudo o que "Limpar dados locais" apaga. Nada fora desta lista é tocado.
export const ALL_LOCAL_KEYS = [
  SETTINGS_KEY,
  FAVORITES_KEY,
  OLD_FAVORITES_KEY,
  RECENT_KEY,
  LAST_CITY_KEY,
  MAP_CACHE_KEY,
];

export function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(`Erro ao ler ${key}:`, error);
    return null;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Erro ao salvar ${key}:`, error);
  }
}

export function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Erro ao apagar ${key}:`, error);
  }
}
