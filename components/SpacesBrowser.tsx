'use client';

import { useState, useEffect } from 'react';
import Login from './Login';
import BucketBrowser from './BucketBrowser';

export default function SpacesBrowser() {
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
    setCredentials(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-blue-800">
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-500"></div>
      </div>
    </div>
  }

  return (
    <div className="min-h-screen bg-blue-800">
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