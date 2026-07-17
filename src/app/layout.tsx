import type { Metadata } from "next";
import "./globals.css";
import { PortalChrome } from "./components/PortalChrome";

export const metadata: Metadata = {
  title: "CleanUp",
  description: "Get your folders in order — scan, review, apply, undo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PortalChrome />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
