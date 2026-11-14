import { QRCodeSVG } from "qrcode.react";
import { APP_DOWNLOAD_DISPLAY_URL, APP_DOWNLOAD_URL } from "@/lib/appDownloadLink";

// The QR to `hightopchallenge.com/app` on the venue display (pre-game and idle). Rules: it never moves, is never
// covered and never animates; dark modules on a white plate with a 4-module quiet zone, so a phone reads it from
// across the room. Nothing is layered over it: halos and effects live outside the plate.

type AppDownloadQrProps = {
  /** Side of the QR modules in canvas px (the plate adds the quiet zone). */
  size: number;
  /** Show the short URL under the plate. */
  caption?: boolean;
};

// Version-3 QR (29 modules): 4 modules of quiet zone is size * 4 / 29 ≈ size * 0.14.
const quietZonePx = (size: number) => Math.round(size * 0.14);

/** The white plate's side, quiet zone included. */
export const appDownloadQrPlatePx = (size: number): number => size + quietZonePx(size) * 2;

export const AppDownloadQr = ({ size, caption = true }: AppDownloadQrProps) => (
  <div className="flex flex-col items-center" data-testid="app-download-qr">
    <div className="rounded-[28px] bg-white" style={{ padding: quietZonePx(size) }}>
      <QRCodeSVG
        value={APP_DOWNLOAD_URL}
        size={size}
        level="M"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#020617"
        title="Download the Hightop Challenge app"
      />
    </div>
    {caption ? (
      <p className="mt-5 text-4xl font-extrabold tracking-wide text-slate-200">{APP_DOWNLOAD_DISPLAY_URL}</p>
    ) : null}
  </div>
);
