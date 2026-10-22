import { HightopLoader } from "@/components/ui/HightopLoader";

export default function NFLPickEmLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ht-canvas">
      <HightopLoader variant="plain" size="lg" delayMs={0} showLabel label="Loading NFL Pick 'Em..." />
    </div>
  );
}
