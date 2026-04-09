type BrandBadgeProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<BrandBadgeProps["size"]>, string> = {
  sm: "h-12 w-20",
  md: "h-16 w-28",
  lg: "h-24 w-40",
};

export function BrandBadge({ size = "md", className = "" }: BrandBadgeProps) {
  return (
    <img
      src="/brand/hightop-badge.svg"
      alt="Hightop Challenge logo"
      className={`rounded-full border-2 border-[#1c2b3a] bg-[#f9f1e6] object-cover shadow-[0_6px_14px_rgba(28,43,58,0.25)] ${SIZE_CLASS[size]} ${className}`.trim()}
      loading="eager"
      decoding="async"
    />
  );
}
