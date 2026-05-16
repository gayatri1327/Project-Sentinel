import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel — Autonomous Incident Resolution Engine",
  description: "AI-powered production monitoring and autonomous remediation dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-navy-900">
      <body className="bg-navy-900 text-slate-200 font-mono antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
