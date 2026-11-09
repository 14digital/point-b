import { ImageResponse } from "next/og";

export const alt = "POINT B Mentors: 30 minutes with someone who's been there";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "30 minutes with someone who's been there.";

/** The site's brand serif, if Google Fonts can be reached at build time; the default font otherwise. */
async function serif() {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Newsreader:opsz@72&text=${encodeURIComponent(`POINT B Mentors${HEADLINE}`)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch { return null; }
}

/** The preview shown when a link to the site is shared. */
export default async function OpengraphImage() {
  const font = await serif();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#111111", color: "#ffffff", padding: 80, fontFamily: font ? "Newsreader" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44 }}>
          <div style={{ display: "flex", position: "relative", width: 86, height: 48 }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 48, height: 48, borderRadius: 48, border: "5px solid #ffffff" }} />
            <div style={{ position: "absolute", left: 38, top: 0, width: 48, height: 48, borderRadius: 48, background: "#ffffff" }} />
          </div>
          <div style={{ display: "flex", marginLeft: 8 }}>POINT B&nbsp;<span style={{ color: "#e9c880" }}>Mentors</span></div>
        </div>
        <div style={{ display: "flex", fontSize: 104, lineHeight: 1.06, letterSpacing: -1, maxWidth: 1000 }}>{HEADLINE}</div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Newsreader", data: font, style: "normal", weight: 400 }] : undefined },
  );
}
