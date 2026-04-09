type HightopLogoProps = {
  size?: "sm" | "md" | "xl";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<HightopLogoProps["size"]>, string> = {
  sm: "h-12 w-12",
  md: "h-14 w-14",
  xl: "h-24 w-24",
};

export function HightopLogo({ size = "md", className = "" }: HightopLogoProps) {
  return (
    <figure
      role="img"
      aria-label="Hightop Challenge"
      className={`relative max-w-full ${SIZE_CLASSES[size]} ${className}`.trim()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hightop-logo.svg"
        alt="Hightop Challenge"
        className="h-full w-full object-contain object-center"
        draggable={false}
      />
      <span className="sr-only">Hightop Challenge</span>
    </figure>
  );
}
