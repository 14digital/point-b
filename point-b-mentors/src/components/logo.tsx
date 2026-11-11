import Image from "next/image";

/** The POINT B logo: the P mark and the wordmark. "light" has a white wordmark for dark backgrounds. */
export function Logo({ className = "", tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <Image src={`/brand/pointb-logo-${tone}.png`} alt="POINT B Mentors" width={669} height={160} priority
      className={`h-7 w-auto sm:h-8 ${className}`} />
  );
}
