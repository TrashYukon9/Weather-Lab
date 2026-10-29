import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import * as THREE from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  Clock,
  Cloud,
  CloudRain,
  Gauge,
  LocateFixed,
  MapPin,
  RefreshCw,
  Thermometer,
  Wind,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  FORECAST_STEPS,
  LAYERS,
  getMapGrid,
  legendGradient,
  legendRange,
  renderLayerPixels,
  sampleAt,
  type LayerConfig,
  type LayerKey,
  type MapGrid,
} from "./MapData";

import type { TranslationKey } from "../i18n/translations";
import { useI18n } from "../i18n/useI18n";
import { useSettings } from "../settings/settingsContext";
import { useUnits, type UnitFormatter } from "../settings/units";

import "./MapPage.css";

/* ------------------------------------------------------------------------ */
/* Tipos e constantes                                                       */
/* ------------------------------------------------------------------------ */

// A página só precisa destes campos da cidade (a GeocodingResult do App.tsx já serve).
interface MapCity {
  name: string;

  country: string;

  latitude: number;

  longitude: number;
}

interface MapPageProps {
  city: MapCity;

  // Aumenta quando o usuário pede "atualizar" (ou na atualização automática).
  refreshKey: number;
}

// Guarda a resposta junto com a "chave" do pedido que a gerou.
// grid === null significa que o pedido falhou.
interface MapResult {
  requestKey: string;

  grid: MapGrid | null;
}

// Ponto que a pessoa tocou no globo.
interface Probe {
  lat: number;

  lng: number;
}

// "Controle remoto" do globo: o React chama estas funções, o three.js obedece.
interface SceneApi {
  setCity: (lat: number, lng: number) => void;

  flyToCity: () => void;

  paint: (pixels: Uint8Array | null) => void;

  setProbe: (probe: Probe | null) => void;
}

// Imagem da Terra (NASA Blue Marble), servida pelo jsDelivr a partir do pacote three-globe.
const EARTH_TEXTURE_URL =
  "https://cdn.jsdelivr.net/npm/three-globe@2.45.6/example/img/earth-blue-marble.jpg";

// Tamanho da imagem das camadas (1 pixel = cerca de 0,35° de longitude).
const OVERLAY_WIDTH = 1024;

const OVERLAY_HEIGHT = 512;

const LAYER_ICONS: Record<LayerKey, LucideIcon> = {
  clouds: Cloud,

  temperature: Thermometer,

  precipitation: CloudRain,

  wind: Wind,

  pressure: Gauge,
};

/* ------------------------------------------------------------------------ */
/* Utilidades                                                               */
/* ------------------------------------------------------------------------ */

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");

    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

// Latitude/longitude -> ponto na esfera de raio 1 (longitude 0 fica virada para +Z).
function latLngToVector(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;

  const theta = ((90 - lng) * Math.PI) / 180;

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),

    radius * Math.cos(phi),

    radius * Math.sin(phi) * Math.sin(theta),
  );
}

// O caminho inverso: ponto na esfera -> latitude/longitude.
function vectorToLatLng(point: THREE.Vector3): Probe {
  const unit = point.clone().normalize();

  return {
    lat: (Math.asin(unit.y) * 180) / Math.PI,

    lng: (Math.atan2(unit.x, unit.z) * 180) / Math.PI,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function formatCoordinates(
  { lat, lng }: Probe,
  t: (key: TranslationKey) => string,
): string {
  const northSouth = lat >= 0 ? t("dir.short.n") : t("dir.short.s");
  const eastWest = lng >= 0 ? t("dir.short.e") : t("dir.short.w");
  return `${Math.abs(lat).toFixed(1)}° ${northSouth}, ${Math.abs(lng).toFixed(1)}° ${eastWest}`;
}

// Os dados do mapa ficam em unidades métricas; aqui convertemos só para mostrar.
function formatLayerValue(
  key: LayerKey,
  value: number,
  units: UnitFormatter,
): string {
  if (key === "temperature") return units.temperatureWithUnit(value);
  if (key === "wind") return units.wind(value);
  if (key === "pressure") return units.pressure(value);
  if (key === "precipitation") return units.precipitation(value, true);
  return `${Math.round(value)}%`;
}

function formatTime(seconds: number, locale: string): string {
  return new Date(seconds * 1000).toLocaleString(locale, {
    weekday: "short",

    day: "numeric",

    month: "short",

    hour: "2-digit",

    minute: "2-digit",
  });
}

// Brilho suave em volta do planeta (um círculo com degradê, sempre virado para a câmera).
function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");

  canvas.width = 256;

  canvas.height = 256;

  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);

    gradient.addColorStop(0, "rgba(120, 235, 200, 0.42)");

    gradient.addColorStop(0.72, "rgba(120, 235, 200, 0.42)");

    gradient.addColorStop(0.85, "rgba(90, 170, 255, 0.16)");

    gradient.addColorStop(1, "rgba(90, 170, 255, 0)");

    context.fillStyle = gradient;

    context.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

// Marcador: um ponto central + um anel (usado para a cidade e para o ponto tocado).
function createMarker(color: number, withPulse: boolean) {
  const group = new THREE.Group();

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 24, 24),

    new THREE.MeshBasicMaterial({ color }),
  );

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.026, 0.033, 48),

    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  group.add(dot, ring);

  let pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null =
    null;

  if (withPulse) {
    pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.036, 48),

      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    group.add(pulse);
  }

  group.visible = false;

  return { group, pulse };
}

/* ------------------------------------------------------------------------ */
/* Página                                                                   */
/* ------------------------------------------------------------------------ */

function MapPage({ city, refreshKey }: MapPageProps) {
  const { t, locale } = useI18n();

  const units = useUnits();

  const { reducedMotion } = useSettings();

  // A cena 3D é criada uma vez; ela lê este "recado" a cada quadro.
  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const initialRefreshKey = useRef(refreshKey);

  // O navegador consegue desenhar em 3D? (se não, mostramos um aviso)
  const [webglOk] = useState(() => canUseWebGL());

  const [layerKey, setLayerKey] = useState<LayerKey>("clouds");

  const [step, setStep] = useState(0);

  const [probe, setProbe] = useState<Probe | null>(null);

  // "attempt" aumenta a cada clique em "Tentar novamente" e refaz o pedido.
  const [attempt, setAttempt] = useState(0);

  const [result, setResult] = useState<MapResult | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);

  const labelRef = useRef<HTMLDivElement>(null);

  const apiRef = useRef<SceneApi | null>(null);

  const requestKey = `grid-${attempt}-${refreshKey}`;

  const layer: LayerConfig =
    LAYERS.find((item) => item.key === layerKey) ?? LAYERS[0];

  /* ---- Dados do tempo (grade mundial) ---- */

  useEffect(() => {
    const controller = new AbortController();

    getMapGrid(
      controller.signal,
      attempt > 0 || refreshKey !== initialRefreshKey.current,
    )
      .then((grid) => setResult({ requestKey, grid }))

      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;

        console.error("Erro ao buscar os dados do mapa:", error);

        setResult({ requestKey, grid: null });
      });

    return () => controller.abort();
  }, [requestKey, attempt, refreshKey]);

  // Só vale a resposta que pertence ao pedido atual; senão, está carregando.
  const currentResult = result?.requestKey === requestKey ? result : null;

  const isLoading = currentResult === null;

  const grid = currentResult?.grid ?? null;

  /* ---- Cena 3D (criada uma vez e destruída ao sair da aba) ---- */

  useEffect(() => {
    const stage = stageRef.current;

    if (!webglOk || !stage) return;

    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error("Não foi possível iniciar o WebGL:", error);

      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    renderer.domElement.className = "map-canvas";

    renderer.domElement.setAttribute("role", "img");

    stage.prepend(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);

    camera.position.set(0, 0, 3);

    const controls = new OrbitControls(camera, renderer.domElement);

    controls.enablePan = false;

    controls.enableDamping = true;

    controls.dampingFactor = 0.08;

    controls.rotateSpeed = 0.5;

    controls.zoomSpeed = 0.7;

    controls.minDistance = 1.4;

    controls.maxDistance = 6;

    let disposed = false;

    /* -- A Terra -- */

    const earthMaterial = new THREE.MeshBasicMaterial({ color: 0x1b3a5c });

    const textureLoader = new THREE.TextureLoader();

    textureLoader.setCrossOrigin("anonymous");

    textureLoader.load(
      EARTH_TEXTURE_URL,

      (texture) => {
        if (disposed) {
          texture.dispose();

          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;

        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        earthMaterial.map = texture;

        earthMaterial.color.set(0xd5dcea);

        earthMaterial.needsUpdate = true;
      },

      undefined,

      (error) => console.error("Erro ao carregar a imagem da Terra:", error),
    );

    const earthGeometry = new THREE.SphereGeometry(1, 96, 64);

    const earth = new THREE.Mesh(earthGeometry, earthMaterial);

    // Gira a esfera para que a longitude 0 fique virada para +Z (testado).
    earth.rotation.y = -Math.PI / 2;

    scene.add(earth);

    /* -- Camada do tempo (nuvens, temperatura...) por cima da Terra -- */

    const overlayData = new Uint8Array(OVERLAY_WIDTH * OVERLAY_HEIGHT * 4);

    const overlayTexture = new THREE.DataTexture(
      overlayData,

      OVERLAY_WIDTH,

      OVERLAY_HEIGHT,

      THREE.RGBAFormat,
    );

    overlayTexture.colorSpace = THREE.SRGBColorSpace;

    overlayTexture.magFilter = THREE.LinearFilter;

    overlayTexture.minFilter = THREE.LinearFilter;

    overlayTexture.generateMipmaps = false;

    overlayTexture.needsUpdate = true;

    const overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      transparent: true,
      depthWrite: false,
    });

    const overlayGeometry = new THREE.SphereGeometry(1.004, 96, 64);

    const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial);

    overlay.rotation.y = -Math.PI / 2;

    overlay.visible = false;

    scene.add(overlay);

    /* -- Brilho em volta do planeta -- */

    const glowTexture = createGlowTexture();

    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
    });

    const glow = new THREE.Sprite(glowMaterial);

    scene.add(glow);

    /* -- Marcadores: cidade atual e ponto tocado -- */

    const cityMarker = createMarker(0x63f59f, true);

    const probeMarker = createMarker(0xffffff, false);

    scene.add(cityMarker.group, probeMarker.group);

    const cityNormal = new THREE.Vector3(0, 0, 1);

    let hasCity = false;

    /* -- Tamanho e enquadramento -- */

    let baseDistance = 3;

    let userMoved = false;

    function layout() {
      if (!stage) return;

      const width = stage.clientWidth;

      const height = stage.clientHeight;

      if (width === 0 || height === 0) return;

      renderer.setSize(width, height);

      camera.aspect = width / height;

      camera.updateProjectionMatrix();

      // Distância em que o planeta inteiro cabe na tela (retrato ou paisagem).
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);

      baseDistance =
        Math.max(2.5, 2.5 / camera.aspect) / (2 * Math.tan(halfFov));

      controls.maxDistance = baseDistance * 1.8;

      if (!userMoved) camera.position.setLength(baseDistance * 0.92);
    }

    layout();

    const resizeObserver = new ResizeObserver(layout);

    resizeObserver.observe(stage);

    /* -- Viagem da câmera até a cidade -- */

    interface Flight {
      startPosition: THREE.Vector3;

      rotation: THREE.Quaternion;

      startTime: number;

      duration: number;

      fromDistance: number;

      toDistance: number;
    }

    let flight: Flight | null = null;

    function flyTo(normal: THREE.Vector3, instant: boolean) {
      const toDistance = baseDistance * 0.85;

      if (instant || reducedMotionRef.current) {
        camera.position.copy(normal).setLength(toDistance);

        controls.update();

        return;
      }

      const startPosition = camera.position.clone();

      flight = {
        startPosition,

        rotation: new THREE.Quaternion().setFromUnitVectors(
          startPosition.clone().normalize(),

          normal.clone().normalize(),
        ),

        startTime: performance.now(),

        duration: 1400,

        fromDistance: startPosition.length(),

        toDistance,
      };
    }

    // Se a pessoa pegar o globo no meio da viagem, a viagem para.
    controls.addEventListener("start", () => {
      flight = null;

      userMoved = true;
    });

    /* -- Tocar no globo: mostra os valores daquele ponto -- */

    const raycaster = new THREE.Raycaster();

    const pointer = new THREE.Vector2();

    let downX = 0;

    let downY = 0;

    let downTime = 0;

    function onPointerDown(event: PointerEvent) {
      downX = event.clientX;

      downY = event.clientY;

      downTime = performance.now();
    }

    // Só conta como "toque" se o dedo/mouse quase não se moveu (senão era arrastar).
    function onPointerUp(event: PointerEvent) {
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY);

      if (moved > 6 || performance.now() - downTime > 500) return;

      const rect = renderer.domElement.getBoundingClientRect();

      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,

        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );

      raycaster.setFromCamera(pointer, camera);

      const hit = raycaster.intersectObject(earth)[0];

      if (hit) setProbe(vectorToLatLng(hit.point));
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    renderer.domElement.addEventListener("pointerup", onPointerUp);

    /* -- Animação (roda a cada quadro) -- */

    const labelPosition = new THREE.Vector3();

    function animate(time: number) {
      if (flight) {
        const progress = Math.min(
          (time - flight.startTime) / flight.duration,
          1,
        );

        const eased = easeInOut(progress);

        const turn = new THREE.Quaternion().slerp(flight.rotation, eased);

        camera.position
          .copy(flight.startPosition)
          .applyQuaternion(turn)
          .setLength(
            flight.fromDistance +
              (flight.toDistance - flight.fromDistance) * eased,
          );

        if (progress >= 1) flight = null;
      }

      controls.update();

      // O brilho acompanha o tamanho do planeta na tela.
      const distance = camera.position.length();

      glow.scale.setScalar(
        (2 * (1 / Math.sqrt(1 - 1 / (distance * distance)))) / 0.72,
      );

      // Anel que "pulsa" na cidade.
      if (cityMarker.pulse && cityMarker.group.visible) {
        const cycle = reducedMotionRef.current ? 0 : (time % 1800) / 1800;

        cityMarker.pulse.scale.setScalar(1 + cycle * 2.6);

        cityMarker.pulse.material.opacity = reducedMotionRef.current
          ? 0
          : 0.7 * (1 - cycle);
      }

      // Etiqueta com o nome da cidade, presa ao marcador (some se estiver atrás do planeta).
      const label = labelRef.current;

      if (label && hasCity) {
        labelPosition.copy(cityNormal).multiplyScalar(1.02);

        const facingCamera = labelPosition.dot(camera.position) > 1.02;

        labelPosition.project(camera);

        const x = (labelPosition.x * 0.5 + 0.5) * stage!.clientWidth;

        const y = (-labelPosition.y * 0.5 + 0.5) * stage!.clientHeight;

        label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -165%)`;

        label.style.opacity = facingCamera ? "1" : "0";
      }

      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(animate);

    /* -- Funções que o React usa -- */

    apiRef.current = {
      setCity(lat, lng) {
        cityNormal.copy(latLngToVector(lat, lng));

        cityMarker.group.position.copy(cityNormal).multiplyScalar(1.006);

        cityMarker.group.lookAt(cityNormal.clone().multiplyScalar(2));

        cityMarker.group.visible = true;

        // Na primeira vez o globo já abre virado para a cidade; depois, viaja até ela.
        flyTo(cityNormal, !hasCity);

        hasCity = true;
      },

      flyToCity() {
        if (hasCity) flyTo(cityNormal, false);
      },

      paint(pixels) {
        if (!pixels) {
          overlay.visible = false;

          return;
        }

        overlayData.set(pixels);

        overlayTexture.needsUpdate = true;

        overlay.visible = true;
      },

      setProbe(next) {
        if (!next) {
          probeMarker.group.visible = false;

          return;
        }

        const normal = latLngToVector(next.lat, next.lng);

        probeMarker.group.position.copy(normal).multiplyScalar(1.006);

        probeMarker.group.lookAt(normal.clone().multiplyScalar(2));

        probeMarker.group.visible = true;
      },
    };

    /* -- Limpeza: libera memória da placa de vídeo ao sair da aba -- */

    return () => {
      disposed = true;

      apiRef.current = null;

      renderer.setAnimationLoop(null);

      resizeObserver.disconnect();

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);

      renderer.domElement.removeEventListener("pointerup", onPointerUp);

      controls.dispose();

      earthGeometry.dispose();

      overlayGeometry.dispose();

      earthMaterial.map?.dispose();

      earthMaterial.dispose();

      overlayTexture.dispose();

      overlayMaterial.dispose();

      glowTexture.dispose();

      glowMaterial.dispose();

      for (const marker of [cityMarker, probeMarker]) {
        marker.group.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();

            object.material.dispose();
          }
        });
      }

      renderer.dispose();

      renderer.domElement.remove();
    };
  }, [webglOk]);

  /* ---- Marcador da cidade (e viagem até ela quando a cidade muda) ---- */

  useEffect(() => {
    apiRef.current?.setCity(city.latitude, city.longitude);
  }, [city.latitude, city.longitude]);

  /* ---- Pinta a camada escolhida (quando chegam dados, ou muda camada/horário) ---- */

  useEffect(() => {
    const values = grid?.values[layer.key][step];

    apiRef.current?.paint(
      values
        ? renderLayerPixels(values, layer, OVERLAY_WIDTH, OVERLAY_HEIGHT)
        : null,
    );
  }, [grid, layer, step]);

  /* ---- Marcador do ponto tocado ---- */

  useEffect(() => {
    apiRef.current?.setProbe(probe);
  }, [probe]);

  // Descrição do globo para leitores de tela, no idioma escolhido.
  useEffect(() => {
    stageRef.current
      ?.querySelector("canvas")
      ?.setAttribute("aria-label", t("map.canvasLabel"));
  }, [t, webglOk]);

  // Valores de todas as camadas no ponto tocado.
  const probeValues = useMemo(() => {
    if (!probe || !grid) return null;

    return LAYERS.map((item) => ({
      layer: item,

      value: sampleAt(
        grid.values[item.key][step],

        probe.lat,

        probe.lng,

        item.clamp,
      ),
    }));
  }, [probe, grid, step]);

  const [legendMin, legendMax] = legendRange(layer);

  const cityLabel = [city.name, city.country].filter(Boolean).join(", ");

  const layerStyle = { "--legend": legendGradient(layer) } as CSSProperties;

  return (
    <section className="map-page" aria-labelledby="map-page-title">
      <header className="map-header">
        <h1 id="map-page-title">{t("nav.maps")}</h1>

        <p className="map-meta">
          <span>
            <MapPin aria-hidden="true" />

            {cityLabel}
          </span>

          {grid && (
            <span>
              <Clock aria-hidden="true" />
              {t("map.forecastFor", {
                time: formatTime(grid.times[step], locale),
              })}
            </span>
          )}
        </p>
      </header>

      <div className="map-panel glass-panel">
        <div className="map-stage" ref={stageRef}>
          {!webglOk && (
            <p className="map-fallback" role="alert">
              {t("map.noWebgl")}
            </p>
          )}

          {/* Etiqueta da cidade (a posição é calculada a cada quadro) */}

          <div className="map-city-label" ref={labelRef}>
            <i aria-hidden="true" />

            {city.name}
          </div>

          <div className="map-layers" role="group" aria-label={t("map.layers")}>
            {LAYERS.map((item) => {
              const Icon = LAYER_ICONS[item.key];

              const active = item.key === layerKey;

              return (
                <button
                  aria-pressed={active}
                  className={`map-chip ${active ? "map-chip-active" : ""}`}
                  key={item.key}
                  onClick={() => setLayerKey(item.key)}
                  title={t(item.labelKey)}
                  type="button"
                >
                  <Icon aria-hidden="true" />

                  <span>{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>

          {probe && probeValues && (
            <aside className="map-readout" aria-live="polite">
              <header>
                <div>
                  <strong>{t("map.selectedPoint")}</strong>

                  <span>{formatCoordinates(probe, t)}</span>
                </div>

                <button
                  aria-label={t("common.close")}
                  onClick={() => setProbe(null)}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </header>

              <ul>
                {probeValues.map(({ layer: item, value }) => {
                  const Icon = LAYER_ICONS[item.key];

                  return (
                    <li key={item.key}>
                      <span>
                        <Icon aria-hidden="true" />

                        {t(item.labelKey)}
                      </span>

                      <strong>
                        {formatLayerValue(item.key, value, units)}
                      </strong>
                    </li>
                  );
                })}
              </ul>
            </aside>
          )}

          <div className="map-bottom">
            <div className="map-legend" style={layerStyle} aria-hidden="true">
              <strong>{t(layer.labelKey)}</strong>

              <div className="map-legend-bar" />

              <div className="map-legend-scale">
                <span>{formatLayerValue(layer.key, legendMin, units)}</span>

                <span>{formatLayerValue(layer.key, legendMax, units)}</span>
              </div>
            </div>

            <div
              className="map-steps"
              role="group"
              aria-label={t("map.timeStep")}
            >
              {FORECAST_STEPS.map((item, index) => (
                <button
                  aria-pressed={index === step}
                  className={`map-chip ${index === step ? "map-chip-active" : ""}`}
                  key={item.hours}
                  onClick={() => setStep(index)}
                  type="button"
                >
                  {item.hours === 0 ? t("common.now") : `+${item.hours} h`}
                </button>
              ))}
            </div>

            <button
              className="map-chip map-locate"
              onClick={() => apiRef.current?.flyToCity()}
              type="button"
            >
              <LocateFixed aria-hidden="true" />

              <span>{t("map.myCity")}</span>
            </button>
          </div>

          {isLoading && (
            <p className="map-status" role="status">
              {t("map.loading")}
            </p>
          )}

          {!isLoading && !grid && (
            <div className="map-error" role="alert">
              <p>{t("map.error")}</p>

              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                <RefreshCw aria-hidden="true" />
                {t("common.retry")}
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="map-footnote">{t("map.footnote")}</p>
    </section>
  );
}

export default MapPage;
