import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  Bell, Info, Languages, MapPin, Palette, RefreshCw, Shield, SlidersHorizontal, Thermometer,
  type LucideIcon,
} from "lucide-react";

import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/useI18n";
import { APP_INFO } from "../settings/appInfo";
import { getCurrentCoordinates, getLocationPermission, type LocationError } from "../settings/geolocation";
import {
  INDICATORS, LANGUAGES, MIN_INDICATORS, START_PAGES,
  type IndicatorKey, type Language, type Settings, type StoredCity,
} from "../settings/settings";
import { useSettings } from "../settings/settingsContext";

import "./SettingsPage.css";

/* ------------------------------------------------------------------------ */
/* Tipos e constantes                                                       */
/* ------------------------------------------------------------------------ */

interface SettingsPageProps {
  currentCity: StoredCity;
  savedCities: StoredCity[];
  recentCount: number;
  lastUpdated: number | null;
  loading: boolean;
  onRefresh: () => void;
  searchCities: (query: string, signal: AbortSignal) => Promise<StoredCity[]>;
  onUseLocation: () => Promise<void>; // rejeita com LocationError
  onClearFavorites: () => void;
  onClearRecents: () => void;
  onClearAll: () => void;
}

type SectionId = "experience" | "weather" | "language" | "location" | "appearance" | "updates" | "alerts" | "privacy" | "about";

const SECTIONS: { id: SectionId; Icon: LucideIcon }[] = [
  { id: "experience", Icon: SlidersHorizontal },
  { id: "weather", Icon: Thermometer },
  { id: "language", Icon: Languages },
  { id: "location", Icon: MapPin },
  { id: "appearance", Icon: Palette },
  { id: "updates", Icon: RefreshCw },
  { id: "alerts", Icon: Bell },
  { id: "privacy", Icon: Shield },
  { id: "about", Icon: Info },
];

// Nomes dos idiomas ficam no próprio idioma (assim dá para achar o seu mesmo se estiver perdido).
const LANGUAGE_NAMES: Record<Language, string> = { "pt-BR": "Português (Brasil)", "en-US": "English (US)", es: "Español" };

const START_PAGE_KEYS: Record<(typeof START_PAGES)[number], TranslationKey> = {
  inicio: "nav.home", favoritos: "nav.saved", previsao: "nav.forecast", mapas: "nav.maps", "qualidade-ar": "nav.air",
};

const INDICATOR_LABELS: Record<IndicatorKey, TranslationKey> = {
  wind: "ind.wind", humidity: "ind.humidity", max: "ind.max", min: "ind.min", feels: "ind.feels", gusts: "ind.gusts",
  uv: "ind.uv", pressure: "ind.pressure", sunrise: "ind.sunrise", sunset: "ind.sunset", rain: "ind.rain",
};

type LocationStatus = "idle" | "checking" | "granted" | LocationError;

/* ------------------------------------------------------------------------ */
/* Peças de interface reutilizáveis                                         */
/* ------------------------------------------------------------------------ */

// Uma linha de configuração: título, descrição curta e o controle.
function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

// Escolha de uma opção entre poucas (botões lado a lado).
function Segmented<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="set-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={option.value === value ? "set-segment set-segment-active" : "set-segment"}
          disabled={option.disabled}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <button aria-checked={checked} aria-label={label} className="set-switch" onClick={() => onChange(!checked)} role="switch" type="button">
      <i />
    </button>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return <p className={`set-notice set-notice-${tone}`} role="status">{children}</p>;
}

/* ------------------------------------------------------------------------ */
/* Página                                                                   */
/* ------------------------------------------------------------------------ */

function SettingsPage(props: SettingsPageProps) {
  const { currentCity, savedCities, recentCount, lastUpdated, loading, onRefresh, onUseLocation, onClearFavorites, onClearRecents, onClearAll } = props;
  const { t, locale } = useI18n();
  const { settings, setSettings, resetSettings, reducedMotion } = useSettings();
  const [section, setSection] = useState<SectionId>("experience");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [notificationNote, setNotificationNote] = useState<"" | "unsupported" | "denied">("");
  const [confirm, setConfirm] = useState<"favorites" | "all" | null>(null);
  const [done, setDone] = useState<TranslationKey | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; items: StoredCity[] } | null>(null);

  const change = (update: (current: Settings) => Settings) => setSettings(update);

  // A busca vem do App como função nova a cada render; guardamos a mais recente aqui.
  const searchRef = useRef(props.searchCities);
  useEffect(() => { searchRef.current = props.searchCities; });

  /* -- Permissão de localização: só consulta, sem abrir o pedido na tela -- */
  useEffect(() => {
    let alive = true;
    void getLocationPermission().then((state) => {
      if (alive) setLocationStatus(state === "granted" ? "granted" : state === "denied" ? "denied" : "idle");
    });
    return () => { alive = false; };
  }, []);

  /* -- Busca da cidade padrão (com pausa entre as teclas) -- */
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchRef.current(text, controller.signal)
        .then((items) => setResults({ query: text, items }))
        .catch((error: unknown) => {
          if ((error as Error).name !== "AbortError") setResults({ query: text, items: [] });
        });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const shownResults = results && results.query === query.trim() ? results.items : [];

  function setDefaultCity(city: StoredCity | null) {
    change((s) => ({ ...s, startup: { ...s.startup, defaultCity: city, cityMode: city ? "default" : s.startup.cityMode === "default" ? "last" : s.startup.cityMode } }));
    setQuery("");
  }

  async function chooseLocationMode() {
    change((s) => ({ ...s, startup: { ...s.startup, cityMode: "location" } }));
    setLocationStatus("checking");
    try {
      await getCurrentCoordinates(); // é aqui que o navegador pergunta (a pessoa acabou de pedir)
      setLocationStatus("granted");
    } catch (error) {
      setLocationStatus(error as LocationError);
    }
  }

  async function showMyLocation() {
    setLocationStatus("checking");
    try {
      await onUseLocation();
      setLocationStatus("granted");
    } catch (error) {
      setLocationStatus(typeof error === "string" ? (error as LocationError) : "unavailable");
    }
  }

  async function toggleBrowserNotifications(next: boolean) {
    setNotificationNote("");
    if (!next) return change((s) => ({ ...s, alerts: { ...s.alerts, browser: false } }));
    if (typeof Notification === "undefined") return setNotificationNote("unsupported");
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") change((s) => ({ ...s, alerts: { ...s.alerts, browser: true } }));
    else setNotificationNote("denied");
  }

  function toggleIndicator(key: IndicatorKey) {
    change((s) => {
      const selected = s.home.indicators;
      const next = selected.includes(key) ? selected.filter((item) => item !== key) : INDICATORS.filter((item) => item === key || selected.includes(item));
      return next.length < MIN_INDICATORS ? s : { ...s, home: { ...s.home, indicators: next } };
    });
  }

  function runConfirmed() {
    if (confirm === "favorites") { onClearFavorites(); setDone("set.privacy.doneFavorites"); }
    if (confirm === "all") { onClearAll(); setDone("set.privacy.doneAll"); }
    setConfirm(null);
  }

  const locationMessage: Record<LocationStatus, TranslationKey | null> = {
    idle: null, checking: "set.loc.checking", granted: "set.loc.granted", denied: "set.loc.denied",
    unavailable: "set.loc.unavailable", timeout: "set.loc.timeout", unsupported: "set.loc.unsupported",
  };
  const locationKey = locationMessage[locationStatus];
  const updatedText = lastUpdated === null ? t("set.updates.never") : t("home.updatedAt", { time: new Date(lastUpdated).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) });
  const cityName = (city: StoredCity) => [city.name, city.country].filter(Boolean).join(", ");

  /* ---- Conteúdo de cada seção ---- */

  const content: Record<SectionId, ReactNode> = {
    experience: (
      <>
        <Row title={t("set.exp.startPage")} description={t("set.exp.startPageHint")}>
          <select aria-label={t("set.exp.startPage")} className="set-select" value={settings.startup.page}
            onChange={(event) => change((s) => ({ ...s, startup: { ...s.startup, page: event.target.value as (typeof START_PAGES)[number] } }))}>
            {START_PAGES.map((page) => <option key={page} value={page}>{t(START_PAGE_KEYS[page])}</option>)}
          </select>
        </Row>
        <Row title={t("set.exp.detail")} description={t("set.exp.detailHint")}>
          <Segmented label={t("set.exp.detail")} value={settings.home.mode} onChange={(mode) => change((s) => ({ ...s, home: { ...s.home, mode } }))}
            options={[{ value: "compact", label: t("set.exp.compact") }, { value: "detailed", label: t("set.exp.detailed") }]} />
        </Row>
        <Notice>{t("set.exp.indicatorsNote")}</Notice>
      </>
    ),
    weather: (
      <>
        <Row title={t("set.units.temperature")}>
          <Segmented label={t("set.units.temperature")} value={settings.units.temperature} onChange={(v) => change((s) => ({ ...s, units: { ...s.units, temperature: v } }))}
            options={[{ value: "c", label: "°C" }, { value: "f", label: "°F" }]} />
        </Row>
        <Row title={t("set.units.wind")}>
          <Segmented label={t("set.units.wind")} value={settings.units.wind} onChange={(v) => change((s) => ({ ...s, units: { ...s.units, wind: v } }))}
            options={[{ value: "kmh", label: "km/h" }, { value: "ms", label: "m/s" }, { value: "mph", label: "mph" }]} />
        </Row>
        <Row title={t("set.units.pressure")}>
          <Segmented label={t("set.units.pressure")} value={settings.units.pressure} onChange={(v) => change((s) => ({ ...s, units: { ...s.units, pressure: v } }))}
            options={[{ value: "hpa", label: "hPa" }, { value: "inhg", label: "inHg" }]} />
        </Row>
        <Row title={t("set.units.precipitation")}>
          <Segmented label={t("set.units.precipitation")} value={settings.units.precipitation} onChange={(v) => change((s) => ({ ...s, units: { ...s.units, precipitation: v } }))}
            options={[{ value: "mm", label: "mm" }, { value: "in", label: "in" }]} />
        </Row>
        <Row title={t("set.indicators.title")} description={t("set.indicators.hint", { min: MIN_INDICATORS })}>
          <div className="set-chips">
            {INDICATORS.map((key) => {
              const active = settings.home.indicators.includes(key);
              return (
                <button aria-pressed={active} className={active ? "set-chip set-chip-active" : "set-chip"} key={key}
                  disabled={active && settings.home.indicators.length <= MIN_INDICATORS} onClick={() => toggleIndicator(key)} type="button">
                  {t(INDICATOR_LABELS[key])}
                </button>
              );
            })}
          </div>
        </Row>
      </>
    ),
    language: (
      <>
        <Row title={t("set.lang.title")} description={t("set.lang.hint")}>
          <Segmented label={t("set.lang.title")} value={settings.language} onChange={(language) => change((s) => ({ ...s, language }))}
            options={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))} />
        </Row>
        <Notice>{t("set.lang.note")}</Notice>
      </>
    ),
    location: (
      <>
        <Row title={t("set.loc.mode")} description={t("set.loc.modeHint")}>
          <Segmented label={t("set.loc.mode")} value={settings.startup.cityMode}
            onChange={(mode) => (mode === "location" ? void chooseLocationMode() : change((s) => ({ ...s, startup: { ...s.startup, cityMode: mode } })))}
            options={[
              { value: "last", label: t("set.loc.last") },
              { value: "default", label: t("set.loc.default"), disabled: !settings.startup.defaultCity },
              { value: "location", label: t("set.loc.location") },
            ]} />
        </Row>
        <Row title={t("set.loc.defaultCity")} description={settings.startup.defaultCity ? cityName(settings.startup.defaultCity) : t("set.loc.noDefault")}>
          <div className="set-stack">
            <div className="set-actions">
              <button className="set-button" onClick={() => setDefaultCity(currentCity)} type="button">{t("set.loc.useCurrent", { name: currentCity.name })}</button>
              {settings.startup.defaultCity && <button className="set-button set-button-quiet" onClick={() => setDefaultCity(null)} type="button">{t("set.loc.remove")}</button>}
            </div>
            {savedCities.length > 0 && (
              <select aria-label={t("set.loc.pickSaved")} className="set-select" value="" onChange={(event) => {
                const city = savedCities.find((item) => `${item.latitude},${item.longitude}` === event.target.value);
                if (city) setDefaultCity(city);
              }}>
                <option value="">{t("set.loc.pickSaved")}</option>
                {savedCities.map((city) => <option key={`${city.latitude},${city.longitude}`} value={`${city.latitude},${city.longitude}`}>{cityName(city)}</option>)}
              </select>
            )}
            <input aria-label={t("set.loc.search")} className="set-input" onChange={(event) => setQuery(event.target.value)} placeholder={t("set.loc.search")} type="search" value={query} />
            {shownResults.length > 0 && (
              <ul className="set-results">
                {shownResults.map((city) => (
                  <li key={`${city.latitude},${city.longitude}`}>
                    <button onClick={() => setDefaultCity(city)} type="button"><strong>{city.name}</strong><small>{[city.admin1, city.country].filter(Boolean).join(", ")}</small></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Row>
        <Row title={t("set.loc.nowTitle")} description={t("set.loc.nowHint")}>
          <button className="set-button" disabled={locationStatus === "checking"} onClick={() => void showMyLocation()} type="button"><MapPin aria-hidden="true" />{t("set.loc.nowButton")}</button>
        </Row>
        {locationKey && <Notice tone={locationStatus === "granted" || locationStatus === "checking" ? "info" : "warning"}>{t(locationKey)}</Notice>}
      </>
    ),
    appearance: (
      <>
        <Row title={t("set.look.theme")} description={t("set.look.themeHint")}>
          <Segmented label={t("set.look.theme")} value={settings.appearance.theme} onChange={(theme) => change((s) => ({ ...s, appearance: { ...s.appearance, theme } }))}
            options={[{ value: "dark", label: t("set.look.dark") }, { value: "light", label: t("set.look.light") }, { value: "auto", label: t("set.look.auto") }]} />
        </Row>
        <Row title={t("set.look.glass")} description={t("set.look.glassHint")}>
          <Segmented label={t("set.look.glass")} value={settings.appearance.glass} onChange={(glass) => change((s) => ({ ...s, appearance: { ...s.appearance, glass } }))}
            options={[{ value: "full", label: t("set.look.glassFull") }, { value: "reduced", label: t("set.look.glassReduced") }]} />
        </Row>
        <Row title={t("set.look.motion")} description={t("set.look.motionHint")}>
          <Segmented label={t("set.look.motion")} value={settings.appearance.motion} onChange={(motion) => change((s) => ({ ...s, appearance: { ...s.appearance, motion } }))}
            options={[{ value: "system", label: t("set.look.motionSystem") }, { value: "reduced", label: t("set.look.motionReduced") }]} />
        </Row>
        {reducedMotion && settings.appearance.motion === "system" && <Notice>{t("set.look.motionActive")}</Notice>}
      </>
    ),
    updates: (
      <>
        <Row title={t("set.updates.now")} description={updatedText}>
          <button className="set-button" disabled={loading} onClick={onRefresh} type="button"><RefreshCw aria-hidden="true" />{t("set.updates.button")}</button>
        </Row>
        <Row title={t("set.updates.auto")} description={t("set.updates.autoHint")}>
          <Segmented label={t("set.updates.auto")} value={settings.data.autoRefreshMinutes} onChange={(autoRefreshMinutes) => change((s) => ({ ...s, data: { autoRefreshMinutes } }))}
            options={[{ value: 0, label: t("set.updates.off") }, { value: 15, label: "15 min" }, { value: 30, label: "30 min" }, { value: 60, label: "60 min" }]} />
        </Row>
        <Notice>{t("set.updates.note")}</Notice>
      </>
    ),
    alerts: (
      <>
        <Notice>{t("set.alerts.note")}</Notice>
        <Row title={t("set.alerts.rain")} description={t("set.alerts.rainHint")}>
          <Switch checked={settings.alerts.rain} label={t("set.alerts.rain")} onChange={(rain) => change((s) => ({ ...s, alerts: { ...s.alerts, rain } }))} />
        </Row>
        {settings.alerts.rain && (
          <Row title={t("set.alerts.threshold")} description={t("set.alerts.thresholdHint")}>
            <Segmented label={t("set.alerts.threshold")} value={settings.alerts.rainThreshold} onChange={(rainThreshold) => change((s) => ({ ...s, alerts: { ...s.alerts, rainThreshold } }))}
              options={[{ value: 50, label: "50%" }, { value: 70, label: "70%" }, { value: 90, label: "90%" }]} />
          </Row>
        )}
        <Row title={t("set.alerts.storm")} description={t("set.alerts.stormHint")}>
          <Switch checked={settings.alerts.storm} label={t("set.alerts.storm")} onChange={(storm) => change((s) => ({ ...s, alerts: { ...s.alerts, storm } }))} />
        </Row>
        <Row title={t("set.alerts.browser")} description={t("set.alerts.browserHint")}>
          <Switch checked={settings.alerts.browser} label={t("set.alerts.browser")} onChange={(value) => void toggleBrowserNotifications(value)} />
        </Row>
        {notificationNote && <Notice tone="warning">{t(notificationNote === "denied" ? "set.alerts.denied" : "set.alerts.unsupported")}</Notice>}
      </>
    ),
    privacy: (
      <>
        <Row title={t("set.privacy.storedTitle")} description={t("set.privacy.storedHint")}>
          <ul className="set-list">
            <li>{t("set.privacy.settings")}</li>
            <li>{t("set.privacy.favorites", { count: savedCities.length })}</li>
            <li>{t("set.privacy.recents", { count: recentCount })}</li>
            <li>{t("set.privacy.lastCity")}</li>
            <li>{t("set.privacy.mapCache")}</li>
          </ul>
        </Row>
        <Notice>{t("set.privacy.network")}</Notice>
        <Row title={t("set.privacy.restore")} description={t("set.privacy.restoreHint")}>
          <button className="set-button" onClick={() => { resetSettings(); setDone("set.privacy.doneRestore"); }} type="button">{t("set.privacy.restoreButton")}</button>
        </Row>
        <Row title={t("set.privacy.clearRecents")} description={t("set.privacy.clearRecentsHint")}>
          <button className="set-button" disabled={recentCount === 0} onClick={() => { onClearRecents(); setDone("set.privacy.doneRecents"); }} type="button">{t("set.privacy.clearRecentsButton")}</button>
        </Row>
        <Row title={t("set.privacy.clearFavorites")} description={t("set.privacy.clearFavoritesHint", { count: savedCities.length })}>
          <button className="set-button set-button-danger" disabled={savedCities.length === 0} onClick={() => setConfirm("favorites")} type="button">{t("set.privacy.clearFavoritesButton")}</button>
        </Row>
        <Row title={t("set.privacy.clearAll")} description={t("set.privacy.clearAllHint")}>
          <button className="set-button set-button-danger" onClick={() => setConfirm("all")} type="button">{t("set.privacy.clearAllButton")}</button>
        </Row>
        {confirm && (
          <div className="set-confirm" role="alertdialog" aria-labelledby="set-confirm-title">
            <strong id="set-confirm-title">{t("set.privacy.confirmTitle")}</strong>
            <p>{confirm === "favorites" ? t("set.privacy.confirmFavorites", { count: savedCities.length }) : t("set.privacy.confirmAll", { count: savedCities.length })}</p>
            <div className="set-actions">
              <button className="set-button set-button-danger" onClick={runConfirmed} type="button">{t("set.privacy.confirmYes")}</button>
              <button className="set-button set-button-quiet" onClick={() => setConfirm(null)} type="button">{t("common.cancel")}</button>
            </div>
          </div>
        )}
        {done && !confirm && <Notice>{t(done)}</Notice>}
      </>
    ),
    about: (
      <>
        <Row title={APP_INFO.name} description={APP_INFO.version ? t("set.about.version", { version: APP_INFO.version }) : undefined}>
          <span className="set-about-pill">{t("set.about.tagline")}</span>
        </Row>
        <Row title={t("set.about.data")} description={t("set.about.dataHint")}>
          <a className="set-link" href={APP_INFO.dataSource.url} rel="noreferrer" target="_blank">{APP_INFO.dataSource.name}</a>
        </Row>
        {APP_INFO.technologies.length > 0 && (
          <Row title={t("set.about.tech")}>
            <ul className="set-tags">
              {APP_INFO.technologies.map((item) => <li key={item.name}>{item.name}{item.version && <small>{item.version}</small>}</li>)}
            </ul>
          </Row>
        )}
        {(APP_INFO.githubUrl || APP_INFO.portfolioUrl) && (
          <Row title={t("set.about.links")}>
            <div className="set-actions">
              {APP_INFO.githubUrl && <a className="set-link" href={APP_INFO.githubUrl} rel="noreferrer" target="_blank">GitHub</a>}
              {APP_INFO.portfolioUrl && <a className="set-link" href={APP_INFO.portfolioUrl} rel="noreferrer" target="_blank">{t("set.about.portfolio")}</a>}
            </div>
          </Row>
        )}
        <Notice>{t("set.about.credits")}</Notice>
      </>
    ),
  };

  return (
    <section className="set-page" aria-labelledby="set-title">
      <header className="set-header">
        <h1 id="set-title">{t("nav.settings")}</h1>
        <p>{t("set.subtitle")}</p>
      </header>
      <div className="set-layout">
        <nav className="set-nav" aria-label={t("set.sections")}>
          {SECTIONS.map(({ id, Icon }) => (
            <button aria-current={section === id ? "page" : undefined} className={section === id ? "set-nav-item set-nav-item-active" : "set-nav-item"}
              key={id} onClick={() => { setSection(id); setConfirm(null); setDone(null); }} type="button">
              <Icon aria-hidden="true" />
              <span>{t(`set.sec.${id}` as TranslationKey)}</span>
            </button>
          ))}
        </nav>
        <div className="set-panel glass-panel">
          <h2>{t(`set.sec.${section}` as TranslationKey)}</h2>
          <p className="set-intro">{t(`set.sec.${section}.intro` as TranslationKey)}</p>
          {content[section]}
        </div>
      </div>
    </section>
  );
}

export default SettingsPage;
