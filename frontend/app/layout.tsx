import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
    title: "Give Me Pic",
    description: "Capture, organise, and revisit your lecture notes with AI-powered search.",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Give Me Pic",
    },
};

export const viewport: Viewport = {
    themeColor: "#0050cb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`h-full ${inter.variable}`}>
            <head>
                <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
            </head>
            <body className="h-full font-sans">{children}</body>
        </html>
    );
}
