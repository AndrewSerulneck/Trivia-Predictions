import { BingoThemeScope } from "@/components/bingo/BingoThemeScope";

export default function BingoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="tp-bingo-route-shell relative min-h-[100svh] rounded-[1.1rem] border border-sky-300/30 bg-slate-950 px-2 pb-2 shadow-[0_10px_28px_rgba(0,0,0,0.5)]">
      <BingoThemeScope />
      {children}
    </div>
  );
}
