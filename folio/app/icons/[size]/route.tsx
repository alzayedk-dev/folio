import { ImageResponse } from "next/og";

// App icons for the home screen, drawn on the fly: emerald rounded square with a rising line.
const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "512-maskable": { px: 512, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const cfg = SIZES[size];
  if (!cfg) return new Response("Not found", { status: 404 });
  const { px, maskable } = cfg;
  const inset = maskable ? px * 0.2 : px * 0.12; // maskable icons keep the mark inside the safe zone
  const stroke = Math.round(px * 0.075);

  return new ImageResponse(
    (
      <div
        style={{
          width: px,
          height: px,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#047857" : "#ffffff",
        }}
      >
        <div
          style={{
            width: px - (maskable ? 0 : inset),
            height: px - (maskable ? 0 : inset),
            borderRadius: maskable ? 0 : px * 0.22,
            background: "#047857",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={px - inset * 2} height={px - inset * 2} viewBox="0 0 32 32">
            <path d="M6 23l7-8 5 4 8-11" stroke="white" strokeWidth={(stroke / px) * 32} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}
