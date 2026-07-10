import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "COE 10.0 — 2026 Programs by Priority",
  description:
    "High-contrast, accessible live view of the UCSF Campus Life Services Facilities Services 2026 program portfolio. Data synced from Smartsheet.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
