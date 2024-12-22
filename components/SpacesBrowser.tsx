'use client';

import { useState, useEffect } from 'react';
import Login from './Login';
import BucketBrowser from './BucketBrowser';

export default function SpacesBrowser() {
  const [credentials, setCredentials] = useState<{
    accessKeyId: string;
    secretAccessKey: string;
  } | null>(null);

  useEffect(() => {
    const savedCredentials = localStorage.getItem('doCredentials');
    if (savedCredentials) {
      setCredentials(JSON.parse(savedCredentials));
    }
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

  return (
    <div className="min-h-screen bg-black">
      {!credentials ? (
        <Login onLogin={handleLogin} />
      ) : (
        <BucketBrowser
          credentials={credentials}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
} 