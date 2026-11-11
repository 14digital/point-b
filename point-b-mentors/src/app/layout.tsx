import type { Metadata } from "next";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { ChatWidget } from "@/components/chat-widget";
import { ActivityTracker } from "@/components/activity-tracker";
import { PaymentDueBar } from "@/components/payment-due-bar";
import { AuthProvider } from "@/lib/auth";
import { siteUrl } from "@/lib/server-api";

const display = Newsreader({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  openGraph: { siteName: "POINT B Mentors", type: "website", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  title: "POINT B Mentors — 30 minutes with someone who's been there",
  description:
    "Book a private 30-minute conversation with experienced professionals. Local and international mentors, transparent pricing, straightforward booking.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <ActivityTracker />
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
          <PaymentDueBar />
          <ChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
