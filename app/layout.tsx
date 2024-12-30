'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Provider, useAtomValue } from 'jotai';
import UploadToast from '@/components/UploadToast';
import { globalStore, showFooterAtom, useLoadCredentials } from "@/lib/atoms";
import Nav from "@/components/Nav";
import SelectedItemsUI from '@/components/SelectedItemsUI';
import FullscreenContainer from "@/components/FullscreenContainer";
import LoadingSpinner from "@/components/LoadingSpinner";

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
    <div className={`fixed z-20 left-4 ${showFooter ? 'bottom-16' : 'bottom-4'}`} style={{
      transition: 'bottom 0.3s ease-in-out'
    }}>
      <UploadToast />
    </div>
  );
}

function CredentialsWrapper({ children }: { children: React.ReactNode }) {
  const loading = useLoadCredentials();
  if (loading) return (
    <FullscreenContainer>
      <LoadingSpinner size="large" />
    </FullscreenContainer>
  )
  return children;
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
          <CredentialsWrapper>
            <Nav />
            {children}
            <GlobalUI />
          </CredentialsWrapper>
        </Provider>
      </body>
    </html>
  );
}
