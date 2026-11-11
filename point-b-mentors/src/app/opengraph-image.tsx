import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

export const alt = "POINT B Mentors: 30 minutes with someone who's been there";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "30 minutes with someone who's been there.";

/** The site's brand serif, if Google Fonts can be reached at build time; the default font otherwise. */
async function serif() {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Newsreader:opsz@72&text=${encodeURIComponent(HEADLINE)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch { return null; }
}

/** The white-wordmark logo as a data URL. The build may run from the project root or from the website folder. */
async function logo() {
  for (const dir of [process.cwd(), join(process.cwd(), "point-b-mentors")]) {
    try { return `data:image/png;base64,${(await readFile(join(dir, "public/brand/pointb-logo-light.png"))).toString("base64")}`; } catch { /* try the next place */ }
  }
  return null;
}

/** The preview shown when a link to the site is shared. */
export default async function OpengraphImage() {
  const [font, mark] = await Promise.all([serif(), logo()]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#111111", color: "#ffffff", padding: 80, fontFamily: font ? "Newsreader" : "serif" }}>
        {mark ? <img src={mark} alt="" width={335} height={80} /> : <div style={{ display: "flex", fontSize: 48, fontWeight: 700, letterSpacing: 2 }}>POINT B.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", width: 96, height: 8, borderRadius: 8, background: "#b7de5b" }} />
          <div style={{ display: "flex", fontSize: 100, lineHeight: 1.06, letterSpacing: -1, maxWidth: 1000 }}>{HEADLINE}</div>
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Newsreader", data: font, style: "normal", weight: 400 }] : undefined },
  );
}
