import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trend-Radar · nexana",
  description: "Internes Werkzeug zur Früherkennung von Drop-Kandidaten",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
