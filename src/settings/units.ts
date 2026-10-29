import { useMemo } from "react";
import type { Units } from "./settings";
import { useSettings } from "./settingsContext";

/* Os dados chegam SEMPRE em unidades métricas (°C, km/h, hPa, mm) e só são
   convertidos aqui, na hora de mostrar. Assim favoritos, cache e regras do app
   nunca misturam unidades, e a conversão acontece uma única vez. */

export interface Quantity { value: string; unit: string }

export interface UnitFormatter {
  temperature: (celsius: number) => string; // "21°"
  temperatureUnit: string; // "°C" ou "°F"
  temperatureWithUnit: (celsius: number) => string; // "21°C"
  windParts: (kmh: number) => Quantity;
  wind: (kmh: number) => string;
  pressureParts: (hpa: number) => Quantity;
  pressure: (hpa: number) => string;
  precipitationParts: (mm: number, perHour?: boolean) => Quantity;
  precipitation: (mm: number, perHour?: boolean) => string;
}

const join = ({ value, unit }: Quantity) => `${value} ${unit}`;

export function createUnitFormatter(units: Units, locale: string): UnitFormatter {
  const number = (value: number, digits: number) =>
    value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  const toTemperature = (c: number) => (units.temperature === "f" ? (c * 9) / 5 + 32 : c);
  const temperatureUnit = units.temperature === "f" ? "°F" : "°C";

  const windParts = (kmh: number): Quantity => {
    if (units.wind === "ms") return { value: number(kmh / 3.6, 1), unit: "m/s" };
    if (units.wind === "mph") return { value: number(kmh * 0.621371, 0), unit: "mph" };
    return { value: number(kmh, 0), unit: "km/h" };
  };
  const pressureParts = (hpa: number): Quantity =>
    units.pressure === "inhg" ? { value: number(hpa * 0.029530, 2), unit: "inHg" } : { value: number(hpa, 0), unit: "hPa" };
  const precipitationParts = (mm: number, perHour = false): Quantity => {
    const suffix = perHour ? "/h" : "";
    return units.precipitation === "in"
      ? { value: number(mm / 25.4, 2), unit: `in${suffix}` }
      : { value: number(mm, 1), unit: `mm${suffix}` };
  };

  return {
    temperature: (c) => `${Math.round(toTemperature(c))}°`,
    temperatureUnit,
    temperatureWithUnit: (c) => `${Math.round(toTemperature(c))}${temperatureUnit}`,
    windParts,
    wind: (kmh) => join(windParts(kmh)),
    pressureParts,
    pressure: (hpa) => join(pressureParts(hpa)),
    precipitationParts,
    precipitation: (mm, perHour) => join(precipitationParts(mm, perHour)),
  };
}

export function useUnits(): UnitFormatter {
  const { settings } = useSettings();
  return useMemo(() => createUnitFormatter(settings.units, settings.language), [settings.units, settings.language]);
}
