import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "xcx.qiyuai.com.cn";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "奇遇AI · 智能内容与自动执行平台";
  const description = "用一句话完成内容创作、视频生成与多平台自动执行。";
  const preview = `${origin}/og.png`;

  return {
    title,
    description,
    icons: {
      icon: "/qiyu-logo.png",
      shortcut: "/qiyu-logo.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "zh_CN",
      url: origin,
      siteName: "奇遇AI",
      images: [{ url: preview, width: 1672, height: 941, alt: "奇遇AI · 智能内容与自动执行平台" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [preview],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
