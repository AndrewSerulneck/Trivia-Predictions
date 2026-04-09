type HightopLogoProps = {
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<HightopLogoProps["size"]>, string> = {
  sm: "h-16 w-[19.5rem]",
  md: "h-24 w-[29rem]",
};

export function HightopLogo({ size = "md", className = "" }: HightopLogoProps) {
  return (
    <figure
      role="img"
      aria-label="Hightop Challenge"
      className={`relative overflow-hidden ${SIZE_CLASSES[size]} ${className}`.trim()}
    >
      {/* The exported SVG has substantial canvas padding, so we scale/crop to keep the oval logo prominent. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/hightop-logo.svg"
        alt="Hightop Challenge"
        className="h-full w-full scale-[1.9] object-cover object-center"
        draggable={false}
      />
      <span className="sr-only">Hightop Challenge</span>
    </figure>
  );
}
