import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showcase — Private work, ready to share",
  description: "Secure temporary showcase experiences for private web projects.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth bg-canvas">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased selection:bg-signal selection:text-black">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
