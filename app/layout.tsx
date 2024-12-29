'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Provider, useAtomValue } from 'jotai';
import UploadToast from '@/components/UploadToast';
import { globalStore, showFooterAtom } from "@/lib/atoms";
import Nav from "@/components/Nav";
import SelectedItemsUI from '@/components/SelectedItemsUI';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function GlobalUI() {
  const showFooter = useAtomValue(showFooterAtom);

  return (
    <>
      <SelectedItemsUI />
      <div className={`fixed z-20 left-4 ${showFooter ? 'bottom-16' : 'bottom-4'}`} style={{
        transition: 'bottom 0.3s ease-in-out'
      }}>
        <UploadToast />
      </div>
    </>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Provider store={globalStore}>
          <div className="sticky top-0 z-10 flex justify-center left-0 right-0 pointer-events-none bg-neutral-100/50 backdrop-blur-lg h-[84px] lg:h-[48px] border-b border-black/5">
            <Nav />
          </div>
          {children}
          <GlobalUI />
        </Provider>
      </body>
    </html>
  );
}
