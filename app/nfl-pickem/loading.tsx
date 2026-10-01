import { HightopLoader } from "@/components/ui/HightopLoader";

export default function NFLPickEmLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <HightopLoader variant="plain" size="lg" delayMs={0} showLabel label="Loading NFL Pick 'Em..." />
    </div>
  );
}
