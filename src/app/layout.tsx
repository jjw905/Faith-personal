import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { AppProvider } from "@/context/app-context";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "보안회의록 | AI 회의록 자동화 플랫폼",
  description:
    "보안 및 접근 제어 기능이 내재된 AI 기반 회의록 자동화 웹 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthSessionProvider>
          <AppProvider>{children}</AppProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
