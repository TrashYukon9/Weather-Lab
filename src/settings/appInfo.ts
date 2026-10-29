import packageInfo from "../../package.json";

/* Informações do "Sobre". Nada aqui é inventado: o nome e as versões vêm do
   package.json do projeto. Os dois links ficam vazios até você preencher; enquanto
   estiverem vazios, a tela Configurações simplesmente não mostra o botão. */

interface PackageInfo {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const info: PackageInfo = packageInfo;
const dependencies = { ...info.dependencies, ...info.devDependencies };

export const APP_INFO = {
  name: "Weather Lab",
  version: info.version ?? "",
  githubUrl: "https://github.com/TrashYukon9/Weather-Lab",
  portfolioUrl: "https://trashyukon9.github.io/DanielWn.site/index.html",
  dataSource: { name: "Open-Meteo", url: "https://open-meteo.com" },
  // Tecnologias: aparecem só se estiverem declaradas no package.json.
  technologies: [
    { name: "React", pkg: "react" },
    { name: "TypeScript", pkg: "typescript" },
    { name: "Vite", pkg: "vite" },
    { name: "three.js", pkg: "three" },
    { name: "Lucide", pkg: "lucide-react" },
  ]
    .filter((item) => item.pkg in dependencies)
    .map((item) => ({ name: item.name, version: dependencies[item.pkg].replace(/^[^\d]*/, "") })),
};
