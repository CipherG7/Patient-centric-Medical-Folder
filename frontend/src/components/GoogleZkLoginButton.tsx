import { useEffect, useRef, useState } from 'react';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { authApi } from '@/lib/api';

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function GoogleZkLoginButton({ onError }: { onError: (message: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const clientId = import.meta.env.VITE_ZKLOGIN_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;
    let cancelled = false;

    const initializeGoogle = async () => {
      const ephemeralKeypair = Ed25519Keypair.generate();
      const randomness = crypto.getRandomValues(new Uint8Array(16));
      const randomnessValue = BigInt(`0x${Array.from(randomness, (byte) => byte.toString(16).padStart(2, '0')).join('')}`).toString();
      const challenge = await authApi.zkLoginChallenge({
        ephemeralPublicKey: encodeBase64(ephemeralKeypair.getPublicKey().toRawBytes()),
        randomness: randomnessValue,
      });
      const maxEpoch = challenge.maxEpoch;
      if (cancelled || !buttonRef.current) return;

      const configure = () => {
        if (cancelled || !buttonRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: challenge.nonce,
          cancel_on_tap_outside: true,
          callback: ({ credential }) => {
            if (!credential) {
              onError('Google did not return an ID token. Please try again.');
              return;
            }
            sessionStorage.setItem('zklogin_pending_jwt', credential);
            sessionStorage.setItem('zklogin_pending_challenge_id', challenge.challengeId);
            sessionStorage.setItem('zklogin_ephemeral_secret', ephemeralKeypair.getSecretKey());
            sessionStorage.setItem('zklogin_ephemeral_public', encodeBase64(ephemeralKeypair.getPublicKey().toRawBytes()));
            sessionStorage.setItem('zklogin_randomness', randomnessValue);
            sessionStorage.setItem('zklogin_max_epoch', String(maxEpoch));
            window.location.assign('/choose-role');
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          width: 320,
        });
        setReady(true);
      };

      if (window.google) {
        configure();
      } else {
        let script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_URL}"]`);
        if (!script) {
          script = document.createElement('script');
          script.src = GOOGLE_SCRIPT_URL;
          script.async = true;
          script.defer = true;
          document.head.appendChild(script);
        }
        script.addEventListener('load', configure, { once: true });
        script.addEventListener('error', () => onError('Google sign-in could not be loaded.'), { once: true });
      }
    };

    void initializeGoogle().catch((error: unknown) => {
      onError(error instanceof Error ? error.message : 'Unable to prepare Google sign-in');
    });

    return () => {
      cancelled = true;
    };
  }, [clientId, onError]);

  if (!clientId) {
    return <p className="text-xs text-amber-700">Google sign-in needs VITE_ZKLOGIN_CLIENT_ID configured.</p>;
  }

  return (
    <div className="min-h-10">
      {!ready && <p className="py-2 text-center text-xs text-slate-500">Preparing Google sign-in…</p>}
      <div ref={buttonRef} className="flex justify-center" />
    </div>
  );
}