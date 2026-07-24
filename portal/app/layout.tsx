import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bucks Haven Farm Portal",
  description: "Farm operations portal for Bucks Haven Farm",
  icons: { icon: "/logo-mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
