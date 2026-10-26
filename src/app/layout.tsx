import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Self-hosted at build time by next/font: no runtime requests to Google, CSP stays font-src 'self'.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Thusa",
  description: "Get paid on your parents' payday.",
  applicationName: "Thusa",
  icons: {
    icon: [
      { url: "/thusa-logo/favicon.ico", sizes: "any" },
      { url: "/thusa-logo/favicon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/thusa-logo/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Analytics/>
      {children} 
      <SpeedInsights/>
        
        </body>
     
    </html>
  );
}
