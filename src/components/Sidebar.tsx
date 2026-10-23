import {
  CalendarDays,
  CloudSun,
  Heart,
  House,
  Map,
  Settings,
  Wind,
} from "lucide-react";

export type WeatherPage =
  | "inicio"
  | "previsao"
  | "mapas"
  | "favoritos"
  | "qualidade-ar"
  | "configuracoes";

interface SidebarProps {
  activePage: WeatherPage;
  onNavigate: (page: WeatherPage) => void;
}

const navigationItems = [
  {
    id: "inicio",
    label: "Início",
    Icon: House,
  },
  {
    id: "previsao",
    label: "Previsão",
    Icon: CalendarDays,
  },
  {
    id: "mapas",
    label: "Mapas",
    Icon: Map,
  },
  {
    id: "favoritos",
    label: "Locais salvos",
    Icon: Heart,
  },
  {
    id: "qualidade-ar",
    label: "Qualidade do ar",
    Icon: Wind,
  },
  {
    id: "configuracoes",
    label: "Configurações",
    Icon: Settings,
  },
] satisfies {
  id: WeatherPage;
  label: string;
  Icon: typeof House;
}[];

export default function Sidebar({
  activePage,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="glass-sidebar">
      {/* Identidade visual */}

      <button
        type="button"
        className="glass-brand"
        onClick={() => onNavigate("inicio")}
        aria-label="Weather Lab — voltar ao início"
      >
        <span className="glass-brand-icon">
          <CloudSun size={27} strokeWidth={1.7} />
        </span>

        <span className="glass-brand-name">
          <strong>WEATHER</strong>
          <span>LAB</span>
        </span>
      </button>

      {/* Título da navegação */}

      <div className="glass-sidebar-caption">
        EXPLORAR
      </div>

      {/* Opções de navegação */}

      <nav
        className="glass-navigation"
        aria-label="Navegação principal"
      >
        {navigationItems.map(
          ({ id, label, Icon }) => {
            const isActive = activePage === id;

            return (
              <button
                key={id}
                type="button"
                className={`glass-nav-item ${
                  isActive ? "is-active" : ""
                }`}
                aria-current={
                  isActive ? "page" : undefined
                }
                onClick={() => onNavigate(id)}
              >
                <span className="glass-nav-icon">
                  <Icon
                    size={20}
                    strokeWidth={1.8}
                  />
                </span>

                <span className="glass-nav-label">
                  {label}
                </span>

                {isActive && (
                  <span
                    className="glass-nav-indicator"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          },
        )}
      </nav>

      {/* Rodapé */}

      <div className="glass-sidebar-footer">
        <span className="glass-footer-orb">
          <CloudSun size={21} />
        </span>

        <div>
          <strong>Weather Lab</strong>
          <span>Seu clima, em um só lugar.</span>
        </div>
      </div>
    </aside>
  );
}