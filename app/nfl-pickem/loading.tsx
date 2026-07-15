import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

export default function NFLPickEmLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <BouncingBallLoader size="lg" label="Loading NFL Pick 'Em..." />
    </div>
  );
}
