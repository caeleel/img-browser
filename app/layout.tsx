'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Provider, useAtomValue } from 'jotai';
import UploadToast from '@/components/UploadToast';
import { globalStore, selectedItemsAtom, showFooterAtom } from "@/lib/atoms";
import Nav from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function Toasts() {
  const showFooter = useAtomValue(showFooterAtom);

  return (
    <div className={`fixed flex gap-2 z-50 left-4 ${showFooter ? 'bottom-16' : 'bottom-4'}`} style={{
      transition: 'bottom 0.3s ease-in-out'
    }}>
      <UploadToast />
    </div>
  )
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        onClick={() => {
          globalStore.set(selectedItemsAtom, {})
        }}
      >
        <Provider store={globalStore}>
          <div className="fixed top-0 z-40 flex justify-center left-0 right-0 pointer-events-none">
            <Nav />
          </div>
          {children}
          <Toasts />
        </Provider>
      </body>
    </html>
  );
}
