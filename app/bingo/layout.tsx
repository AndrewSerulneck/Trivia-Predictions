import { BingoThemeScope } from "@/components/bingo/BingoThemeScope";

export default function BingoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="tp-bingo-route-shell relative min-h-[100svh] rounded-[1.1rem] border border-amber-200/60 bg-[radial-gradient(circle_at_12%_16%,rgba(254,215,170,0.5)_0%,rgba(254,215,170,0)_42%),radial-gradient(circle_at_88%_86%,rgba(254,202,202,0.35)_0%,rgba(254,202,202,0)_40%),linear-gradient(165deg,#fb923c_0%,#f97316_45%,#ea580c_100%)] p-2 shadow-[0_10px_28px_rgba(124,45,18,0.35)]">
      <BingoThemeScope />
      {children}
    </div>
  );
}
