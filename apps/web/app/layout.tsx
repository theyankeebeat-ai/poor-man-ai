import type { Metadata } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Poor Man AI",
  description: "Next.js cockpit with a Go retrieval brain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="cyber-dark">
      <body>{children}</body>
    </html>
  );
}
