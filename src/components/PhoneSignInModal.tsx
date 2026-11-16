import { useEffect, useState } from 'react';
import { ConfirmationResult } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  clearPhoneRecaptcha,
  sendPhoneOtp,
  signInWithGoogle,
} from '../lib/firebase';
import { normalizeTzPhone } from '../types/vicoba';

interface PhoneSignInModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  subtitle?: string;
}

export default function PhoneSignInModal({
  open,
  onClose,
  onSuccess,
  title = 'Sign In with Mobile Number',
  subtitle = 'Enter your Tanzanian mobile money number to receive a verification SMS code, or use Google for Admin access.',
}: PhoneSignInModalProps) {
  const [phoneInput, setPhoneInput] = useState('+255 7');
  const [otpCode, setOtpCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneConfigHelp, setPhoneConfigHelp] = useState(false);

  const [copiedHost, setCopiedHost] = useState(false);

  useEffect(() => {
    if (!open) {
      setOtpCode('');
      setConfirmation(null);
      setError(null);
      setPhoneConfigHelp(false);
      clearPhoneRecaptcha('recaptcha-container');
    }
  }, [open]);

  if (!open) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 1800);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPhoneConfigHelp(false);

    const normalized = normalizeTzPhone(phoneInput);
    if (!/^\+[1-9][0-9]{8,14}$/.test(normalized)) {
      setError('Enter a valid mobile number (e.g. +255 754 123 456 or 0754 123 456).');
      return;
    }

    setSendingCode(true);
    try {
      const result = await sendPhoneOtp(normalized, 'recaptcha-container');
      setConfirmation(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('operation-not-allowed') ||
        msg.includes('captcha-check-failed') ||
        msg.includes('invalid-app-credential') ||
        msg.includes('unauthorized-domain')
      ) {
        setPhoneConfigHelp(true);
        setError(
          'Phone SMS sign-in requires Phone Auth enabled and this domain whitelisted in Firebase Console (Authentication → Settings → Authorized domains).'
        );
      } else {
        setError(msg || 'Could not send SMS verification code. Please check your number.');
      }
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmation) return;
    if (otpCode.trim().length < 6) {
      setError('Enter the 6-digit SMS verification code.');
      return;
    }

    setVerifyingCode(true);
    setError(null);
    try {
      await confirmation.confirm(otpCode.trim());
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid or expired verification code. Please try again.'
      );
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.'
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#17231C]/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-signin-title"
    >
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E5DEC9] bg-white shadow-xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-[#EFEAE0] px-5 py-4">
          <div>
            <h2
              id="phone-signin-title"
              className="font-display text-base font-bold text-[#17231C]"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-[#55635A]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-[#8A948D] hover:bg-[#FAF7F0] hover:text-[#17231C]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!confirmation ? (
            <form onSubmit={handleSendOtp} className="space-y-3.5">
              <div>
                <label
                  htmlFor="signin-phone-input"
                  className="block text-xs font-medium text-[#37463D] mb-1.5"
                >
                  Mobile Money Phone Number
                </label>
                <div className="relative">
                  <Phone
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8A948D]"
                    aria-hidden="true"
                  />
                  <input
                    id="signin-phone-input"
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+255 754 123 456"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white pl-9 pr-3 py-2.5 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[#55635A]">
                  Supports +255 or 07XX / 06XX Tanzanian numbers.
                </p>
              </div>

              <button
                type="submit"
                disabled={sendingCode}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114226] disabled:opacity-60 transition-colors"
              >
                {sendingCode ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Sending SMS Code...
                  </>
                ) : (
                  'Send SMS Verification Code'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3.5">
              <div className="rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] p-3 text-xs text-[#114226] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#165432] shrink-0" aria-hidden="true" />
                <span>
                  SMS verification code sent to{' '}
                  <strong className="font-mono">{normalizeTzPhone(phoneInput)}</strong>.
                </span>
              </div>

              <div>
                <label
                  htmlFor="signin-otp-input"
                  className="block text-xs font-medium text-[#37463D] mb-1.5"
                >
                  6-Digit SMS Code
                </label>
                <input
                  id="signin-otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2.5 font-mono text-lg tracking-widest text-center text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmation(null);
                    setOtpCode('');
                    setError(null);
                  }}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-3.5 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                >
                  Change Number
                </button>
                <button
                  type="submit"
                  disabled={verifyingCode}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114226] disabled:opacity-60 transition-colors"
                >
                  {verifyingCode ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      Verify &amp; Sign In
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
              {phoneConfigHelp && currentHost && (
                <div className="pl-6 space-y-1.5 text-[11px] text-red-700">
                  <p>
                    Add this domain in Firebase Console → Authentication → Settings → Authorized domains:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5">
                    <span className="font-mono text-[11px] text-[#17231C] truncate">
                      {currentHost}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyHost}
                      className="shrink-0 inline-flex items-center gap-1 rounded bg-[#FAF7F0] px-2 py-0.5 text-[10px] font-semibold text-[#17231C] hover:bg-[#EAE2D0]"
                    >
                      {copiedHost ? (
                        <>
                          <Check className="h-3 w-3 text-[#165432]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-[#EFEAE0]" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white px-2.5 text-[#55635A]">
                Or continue with Google (Admin &amp; Quick Sign-In)
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={googleLoading}
            onClick={handleGoogleSignIn}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-[#E5DEC9] bg-white px-4 py-2.5 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] disabled:opacity-60 transition-colors"
          >
            {googleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in with Google...
              </>
            ) : (
              'Continue with Google'
            )}
          </button>

          <div id="recaptcha-container" />
        </div>
      </div>
    </div>
  );
}
