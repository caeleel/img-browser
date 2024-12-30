'use client';

import { useState } from 'react';

interface LoginProps {
  onLogin: (spaceName: string, accessToken: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(accessKeyId, secretAccessKey);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6">Photo Browser</h1>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Access Key ID</label>
            <input
              type="text"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Secret Access Key</label>
            <input
              type="password"
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Connect
          </button>
        </form>

        {/* Dummy divs for tailwind */}
        <div className="rotate-90 hidden fill-[#fff] stroke-[#fff]">a</div>
        <div className="rotate-180 hidden fill-[#888] stroke-[#888]">b</div>
        <div className="-rotate-90 hidden">c</div>
      </div>
    </div>
  );
} 