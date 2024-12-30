'use client';

import { useState, useEffect } from 'react';
import Login from '../components/Login';
import BucketBrowser from '../components/BucketBrowser';
import { clearS3Cache } from '@/lib/s3';
import { useAtom } from 'jotai';
import { credentialsAtom, useLoadCredentials } from '@/lib/atoms';

export default function Home() {
  const [credentials, setCredentials] = useAtom(credentialsAtom);

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