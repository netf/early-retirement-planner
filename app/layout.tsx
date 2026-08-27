import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  ...(process.env.SITE_URL ? { metadataBase: new URL(process.env.SITE_URL) } : {}),
  title: "Early Retirement Planner",
  description:
    "Will your money last if you stop work early? A free planner for the UK, US, Poland and Romania: your accounts, property, pensions and spending run through 1,000 possible futures of markets and inflation, with each country’s tax and pension rules applied year by year. Nothing you enter leaves your browser.",
  openGraph: {
    title: "Early Retirement Planner",
    description: "Know when work becomes optional. UK, US, Poland and Romania: your savings, property and spending tested across 1,000 possible futures of markets and inflation, with real tax rules. Runs entirely in your browser.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 2400,
        height: 1260,
        alt: "Early Retirement Planner — Will the money last to 95? 57%, Not yet. UK, US and Poland; nothing leaves your browser.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Early Retirement Planner",
    description: "Will your money last if you stop work early? UK, US, Poland and Romania, 1,000 simulated futures, real tax rules, nothing leaves your browser.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

/** Cloudflare Web Analytics: cookie-less visit counting, only when a token is supplied at build time. */
const BEACON_TOKEN = process.env.CF_BEACON_TOKEN || "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        {BEACON_TOKEN ? <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: BEACON_TOKEN })} /> : null}
      </body>
    </html>
  );
}
