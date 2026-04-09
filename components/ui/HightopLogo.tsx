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
    <img
      src="/brand/hightop-logo.svg"
      alt="Hightop Challenge"
      className={`tp-clean-button rounded-xl border border-[#243344]/25 bg-[#fff8ee] px-2 py-1 shadow-sm ${SIZE_CLASSES[size]} ${className}`.trim()}
      loading="eager"
      decoding="async"
    />
  );
}
