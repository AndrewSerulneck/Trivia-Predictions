interface ExplodingLogoProps {
  width?: number;
}

export const ExplodingLogo = ({ width = 320 }: ExplodingLogoProps) => (
  <img
    src="/brand/HTC_Logo_Final_Transparent%20copy.png"
    alt="Hightop Challenge"
    width={width}
    className="block h-auto max-w-full select-none animate-logo-burst"
    draggable={false}
    loading="eager"
    decoding="sync"
  />
);
