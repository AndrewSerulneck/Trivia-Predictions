// Shared treasure/coin marks for the points pill. Extracted so the home
// hamburger bar and the in-game AppBar render an identical score affordance.

export function TreasureChestIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`${className} drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]`}>
      <path d="M9 27h46l-6-13H15z" fill="#8b4513" stroke="#111827" strokeWidth="3" />
      <rect x="10" y="28" width="44" height="8" rx="3" fill="#7c3f00" stroke="#111827" strokeWidth="3" />
      <rect x="6" y="34" width="52" height="24" rx="5" fill="#a85500" stroke="#111827" strokeWidth="3" />
      <rect x="29" y="28" width="6" height="30" fill="#f4b400" stroke="#111827" strokeWidth="2" />
      <circle cx="32" cy="45" r="4.5" fill="#ffe26a" stroke="#111827" strokeWidth="2" />
      <ellipse cx="32" cy="32" rx="15" ry="3.8" fill="#2d1400" opacity="0.52" />
    </svg>
  );
}

export function GoldCoinIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`${className} tp-coin-idle drop-shadow-[0_2px_2px_rgba(106,64,0,0.45)]`}>
      <defs>
        <linearGradient id="tp-coin-rim-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff5bf" />
          <stop offset="28%" stopColor="#ffd769" />
          <stop offset="62%" stopColor="#f2b437" />
          <stop offset="100%" stopColor="#b67612" />
        </linearGradient>
        <linearGradient id="tp-coin-core-gradient" x1="10%" y1="8%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="#fff9d8" />
          <stop offset="44%" stopColor="#ffdc73" />
          <stop offset="100%" stopColor="#d98b12" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="17" ry="4.8" fill="rgba(74,40,0,0.24)" />
      <circle cx="32" cy="32" r="24.5" fill="url(#tp-coin-rim-gradient)" stroke="#774600" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="17.5" fill="url(#tp-coin-core-gradient)" stroke="#8a5200" strokeWidth="1.9" />
      <ellipse
        cx="26.5"
        cy="22.5"
        rx="9.6"
        ry="5.5"
        className="tp-coin-idle-shimmer"
        fill="rgba(255,255,255,0.46)"
      />
      <path d="M23 35h18" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 28h10" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 42h10" stroke="#8a5200" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
