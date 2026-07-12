import type { Metadata } from "next";
import "./globals.css";

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
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
