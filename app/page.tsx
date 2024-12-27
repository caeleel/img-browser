'use client';

import { useState, useEffect } from 'react';
import Login from '../components/Login';
import BucketBrowser from '../components/BucketBrowser';
import { clearS3Cache } from '@/lib/s3';

export default function Home() {
  const [credentials, setCredentials] = useState<{
    accessKeyId: string;
    secretAccessKey: string;
  } | null>(null);
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
    return <div className="min-h-screen bg-white">
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500"></div>
      </div>
    </div>
  }

  return (
    <div className="min-h-screen bg-white">
      {!credentials ? (
        <Login onLogin={handleLogin} />
      ) : (
        <BucketBrowser
          onLogout={handleLogout}
          credentials={credentials}
        />
      )}
    </div>
  );
} 