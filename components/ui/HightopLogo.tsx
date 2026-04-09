type HightopLogoProps = {
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<HightopLogoProps["size"]>, string> = {
  sm: "h-12 w-[14.5rem]",
  md: "h-16 w-[19.5rem]",
};

export function HightopLogo({ size = "md", className = "" }: HightopLogoProps) {
  return (
    <div
      role="img"
      aria-label="Hightop Challenge"
      className={`relative ${SIZE_CLASSES[size]} ${className}`.trim()}
    >
      <div
        className="h-full w-full bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/brand/hightop-logo.svg')" }}
      />
      <span className="sr-only">Hightop Challenge</span>
    </div>
  );
}
