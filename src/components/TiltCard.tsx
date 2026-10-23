import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  intensity?: number;
}

type TiltStyle = CSSProperties & {
  "--tilt-x": string;
  "--tilt-y": string;
  "--light-x": string;
  "--light-y": string;
};

export default function TiltCard({
  children,
  className = "",
  intensity = 5,
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const [isHovered, setIsHovered] = useState(false);

  const [tilt, setTilt] = useState({
    x: 0,
    y: 0,
    lightX: 50,
    lightY: 50,
  });

  function handlePointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (
      event.pointerType !== "mouse" ||
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches
    ) {
      return;
    }

    const card = cardRef.current;

    if (!card) return;

    const rect = card.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const normalizedX = (x - centerX) / centerX;
    const normalizedY = (y - centerY) / centerY;

    setTilt({
      x: -normalizedY * intensity,
      y: normalizedX * intensity,
      lightX: (x / rect.width) * 100,
      lightY: (y / rect.height) * 100,
    });
  }

  function handlePointerLeave() {
    setIsHovered(false);

    setTilt({
      x: 0,
      y: 0,
      lightX: 50,
      lightY: 50,
    });
  }

  const style: TiltStyle = {
    "--tilt-x": `${tilt.x}deg`,
    "--tilt-y": `${tilt.y}deg`,
    "--light-x": `${tilt.lightX}%`,
    "--light-y": `${tilt.lightY}%`,
  };

  return (
    <div
      ref={cardRef}
      className={`tilt-card ${className}`}
      style={style}
      onPointerEnter={() => setIsHovered(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-tilted={isHovered}
    >
      <div className="tilt-card-content">
        {children}
      </div>

      <div
        className="tilt-card-highlight"
        aria-hidden="true"
      />
    </div>
  );
}