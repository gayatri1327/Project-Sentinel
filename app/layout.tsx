import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sentinel — Autonomous Incident Resolution Engine",
  description: "AI-powered production monitoring and autonomous remediation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, background: "#080c12" }}>{children}</body>
    </html>
  );
}
