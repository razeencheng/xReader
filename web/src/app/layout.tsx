import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "xReader",
  description: "Information aggregation platform",
};

export const viewport: Viewport = {
  themeColor: "#f9f7f1",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full bg-[var(--bg-body)] antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg-body)]">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
