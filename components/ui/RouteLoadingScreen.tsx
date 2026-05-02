"use client";

export function RouteLoadingScreen() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[2400] flex h-screen w-screen items-center justify-center bg-black">
      <div className="flex flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 h-28 w-28 [animation:spin_2.1s_linear_infinite]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hightop-logo.svg"
            alt="Hightop Challenge"
            className="h-full w-full object-contain drop-shadow-[0_0_14px_rgba(255,255,255,0.22)]"
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
        <p className="text-[1.08rem] font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]">
          Hightop Challenge: Game On
        </p>
      </div>
    </div>
  );
}
