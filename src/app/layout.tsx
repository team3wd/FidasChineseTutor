import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chinese Tutor Study Companion",
  description: "A responsive, minimalist mobile-first study tool to sync vocabulary from your tutor's Google Doc, study flashcards with Spaced Repetition (SRS), and track mastery.",
  keywords: ["Chinese study", "spaced repetition", "SM-2", "Google Doc sync", "Mandarin tone practice"],
  authors: [{ name: "Antigravity Dev" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chinese Tutor",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
