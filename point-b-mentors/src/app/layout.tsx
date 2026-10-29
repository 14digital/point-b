import type { Metadata } from "next";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { AuthProvider } from "@/lib/auth";

const display = Newsreader({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POINT B Mentors — 30 minutes with someone who's been there",
  description:
    "Book a private 30-minute conversation with experienced professionals. Local and international mentors, transparent pricing, straightforward booking.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
