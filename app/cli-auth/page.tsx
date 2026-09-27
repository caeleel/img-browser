'use client';

import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { credentialsAtom } from '@/lib/atoms';

type Status = 'idle' | 'sending' | 'done' | 'error';

// Hands the saved bucket credentials to a CLI (e.g. `npm run sync-phone`) listening on
// this computer's loopback interface. The CLI opens this page with ?port=&state=.
export default function CliAuthPage() {
  const credentials = useAtomValue(credentialsAtom);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<URLSearchParams | null>(null);

  // Read the query string after mount so the prerendered HTML matches the first client render.
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);

  const port = Number(params?.get('port'));
  const state = params?.get('state') || '';
  const validRequest = Number.isInteger(port) && port > 1024 && port < 65536 && /^[a-f0-9]{32,}$/.test(state);

  const authorize = async () => {
    setStatus('sending');
    setError(null);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, credentials }),
      });
      if (!response.ok) throw new Error(`The sync tool responded with ${response.status}`);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the sync tool');
      setStatus('error');
    }
  };

  let body: React.ReactNode;
  if (!params) {
    body = null;
  } else if (!validRequest) {
    body = <p>This page is opened by the sync tool. Run <code>npm run sync-phone</code> to start it.</p>;
  } else if (!credentials) {
    body = (
      <p>
        You&apos;re not logged in. <Link href="/" className="text-blue-600 underline">Log in</Link>, then
        re-run the sync tool.
      </p>
    );
  } else if (status === 'done') {
    body = <p>Done — the sync tool has your credentials. You can close this tab.</p>;
  } else {
    body = (
      <>
        <p className="mb-6">
          A sync tool on this computer (port {port}) is asking for access to your photo bucket.
        </p>
        <button
          onClick={authorize}
          disabled={status === 'sending'}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : 'Authorize'}
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-600">
            {error}. Make sure the sync tool is still running, and allow local network access if the
            browser asks.
          </p>
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold mb-6">Authorize sync tool</h1>
        {body}
      </div>
    </div>
  );
}
