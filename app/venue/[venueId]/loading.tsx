export default function VenueLoading() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[2300] flex items-center justify-center bg-[#030712] will-change-[opacity] [transform:translateZ(0)]">
      <div className="relative flex w-full max-w-sm flex-col items-center justify-center px-8">
        <div className="absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="relative h-40 w-40 rounded-full border border-white/35 p-3 shadow-[0_0_45px_rgba(56,189,248,0.22)]">
          <div className="absolute inset-0 rounded-full border border-white/20" />
          <div className="relative h-full w-full rounded-full bg-white/95 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hightop-logo.svg"
              alt="Hightop Sports"
              className="h-full w-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
        <p className="mt-3 text-center text-[1.06rem] font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]">
          Hightop Sports: Game On
        </p>
      </div>
    </div>
  );
}
