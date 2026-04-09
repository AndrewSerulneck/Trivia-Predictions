type HightopLogoProps = {
  size?: "sm" | "md";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<HightopLogoProps["size"]>, string> = {
  sm: "h-10 w-auto",
  md: "h-14 w-auto",
};

export function HightopLogo({ size = "md", className = "" }: HightopLogoProps) {
  return (
    <div
      role="img"
      aria-label="Hightop Challenge"
      className={`tp-clean-button relative overflow-hidden rounded-xl border border-[#243344]/25 bg-[#fff8ee] px-2 py-1 shadow-sm ${SIZE_CLASSES[size]} ${className}`.trim()}
    >
      <div
        className="h-full w-full bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/brand/hightop-logo.svg')" }}
      />
      <span className="sr-only">Hightop Challenge</span>
    </div>
  );
}
