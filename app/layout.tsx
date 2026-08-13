import type { Metadata, Viewport } from "next";
import { Anton, Space_Grotesk, Syne } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const grotesk = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-impact",
  subsets: ["latin"],
  weight: "400",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#080909",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0].trim();
  const directHost = requestHeaders.get("host")?.trim();
  const candidateHost = forwardedHost || directHost || "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(candidateHost) ? candidateHost : "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost") ? "http" : "https";

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "MRanking — Bring the pack. Own the order.",
    description: "Turn any playlist into a game, a winner and a ranking worth arguing about.",
    openGraph: {
      title: "MRanking — Bring the pack. Own the order.",
      description: "Build a pack, choose the rules and settle the ranking your way.",
      images: [{ url: "/og-v2.png", width: 1536, height: 1024, alt: "MRanking — bring the pack and own the order." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "MRanking — Bring the pack. Own the order.",
      description: "Build a pack, choose the rules and settle the ranking your way.",
      images: ["/og-v2.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${syne.variable} ${anton.variable}`}>
        {children}
      </body>
    </html>
  );
}
