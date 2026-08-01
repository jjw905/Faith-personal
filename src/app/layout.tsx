import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { AppProvider } from "@/context/app-context";

import "./globals.css";

/** 영문(라틴) — 한글 글리프가 없어 아래 Pretendard로 넘어간다. */
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-latin",
  subsets: ["latin"],
  display: "swap",
});

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Apple SD Gothic Neo",
    "Segoe UI",
    "sans-serif",
  ],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Faith | AI 회의록",
  description:
    "화자 구분 받아쓰기, 요약·타임라인까지 자동으로 만드는 AI 회의록. 개인정보 마스킹은 부가로 따라옵니다.",
};

/** Android Chrome: 키보드가 레이아웃을 줄여 하단 입력이 가려지지 않게 한다. iOS는 visualViewport로 보정. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      className={`${plusJakarta.variable} ${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300..500,0..1,-50..200&icon_names=audio_file,data_object,description,draft,edit_note,image,ink_highlighter,label,markdown,notifications,notifications_off,password,picture_as_pdf,slideshow,subtitles,table_chart,text_snippet,vertical_align_center,video_file,visibility,visibility_off&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">
        <AuthSessionProvider>
          <AppProvider>{children}</AppProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
