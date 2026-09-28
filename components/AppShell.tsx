'use client';

import { Provider, useAtomValue } from 'jotai';
import UploadToast from '@/components/UploadToast';
import { globalStore, showFooterAtom, useLoadCredentials } from "@/lib/atoms";
import Nav from "@/components/Nav";
import FullscreenContainer from "@/components/FullscreenContainer";
import LoadingSpinner from "@/components/LoadingSpinner";

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

// Client-side app chrome: state store, credentials gate, nav and upload toast.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={globalStore}>
      <CredentialsWrapper>
        <Nav />
        {children}
        <GlobalUI />
      </CredentialsWrapper>
    </Provider>
  );
}
