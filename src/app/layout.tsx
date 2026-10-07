import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });


export const metadata: Metadata = {
  title: "Trend-Radar · nexana",
  description: "Internes Werkzeug zur Früherkennung von Drop-Kandidaten",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html lang="de" data-theme={theme === "light" || theme === "dark" ? theme : undefined} className={`${bricolage.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Zum Inhalt springen
        </a>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
