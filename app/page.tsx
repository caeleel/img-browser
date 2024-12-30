'use client';

import { useState, useEffect } from 'react';
import Login from '../components/Login';
import BucketBrowser from '../components/BucketBrowser';
import { clearS3Cache } from '@/lib/s3';
import FullscreenContainer from '@/components/FullscreenContainer';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAtom } from 'jotai';
import { credentialsAtom } from '@/lib/atoms';

export default function Home() {
  const [credentials, setCredentials] = useAtom(credentialsAtom);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedCredentials = localStorage.getItem('doCredentials');
    if (savedCredentials) {
      setCredentials(JSON.parse(savedCredentials));
    }
    setLoading(false);
  }, []);

  const handleLogin = (accessKeyId: string, secretAccessKey: string) => {
    const creds = { accessKeyId, secretAccessKey };
    localStorage.setItem('doCredentials', JSON.stringify(creds));
    setCredentials(creds);
  };

  const handleLogout = () => {
    localStorage.removeItem('doCredentials');
    clearS3Cache();
    setCredentials(null);
  };

  if (loading) {
    return <FullscreenContainer>
      <LoadingSpinner size="large" />
    </FullscreenContainer>
  }

  return (
    <div className="bg-white">
      {!credentials ? (
        <Login onLogin={handleLogin} />
      ) : (
        <BucketBrowser onLogout={handleLogout} />
      )}
    </div>
  );
} 