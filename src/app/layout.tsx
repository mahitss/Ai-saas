import type { Metadata } from "next";

import { GlobalCommandBar } from "@/components/global-command-bar";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Logicra",
  description: "A structured AI workspace for chat, memory, tasks, and trusted automation.",
  applicationName: "Logicra",
  creator: "Logicra",
  openGraph: {
    title: "Logicra",
    description: "A structured AI workspace for chat, memory, tasks, and trusted automation.",
    siteName: "Logicra",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Logicra",
    description: "A structured AI workspace for chat, memory, tasks, and trusted automation.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background text-foreground antialiased"
      >
        <ThemeProvider>
          <PwaRegister />
          <GlobalCommandBar />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
