'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Provider } from 'jotai';
import UploadToast from '@/components/UploadToast';
import { globalStore } from "@/lib/atoms";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Provider store={globalStore}>
          <div className="fixed top-0 z-50 flex justify-center left-0 right-0 pointer-events-none">
            <Nav />
          </div>
          {children}
          <UploadToast />
        </Provider>
      </body>
    </html>
  );
}
