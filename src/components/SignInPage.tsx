import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Monitor,
  Smartphone,
  User,
  UserCheck,
} from 'lucide-react';
import { SEED_MENU_ITEMS } from '../data/seedMenu';
import { formatKSh } from '../lib/nairobiTime';
import { CafeteriaSettings, MenuItem } from '../types';
import { MenuFoodImage } from './MenuFoodImage';
import { PWAInstallButton } from './PWAInstallButton';

interface SignInPageProps {
  route: '/' | '/board' | '/kitchen' | '/cashier' | '/admin';
  cafeteriaSettings: CafeteriaSettings;
  menuItems: MenuItem[];
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (name: string, email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  onGuestSignIn: (guestName: string, guestPhone: string) => Promise<void>;
  onOpenBoard: () => void;
  externalError?: string;
}

export function SignInPage({
  route,
  cafeteriaSettings,
  menuItems,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onPasswordReset,
  onGuestSignIn,
  onOpenBoard,
  externalError,
}: SignInPageProps) {
  const [authTab, setAuthTab] = useState<'signin' | 'signup' | 'guest'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const displayError = localError || externalError || '';

  const previewSpecials =
    menuItems.length > 0
      ? menuItems.filter((m) => m.category === 'Special Corner').slice(0, 6)
      : SEED_MENU_ITEMS.filter((m) => m.category === 'Special Corner');

  const handleSubmitEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setInfoMsg('');
    if (!email.trim() || !password) {
      setLocalError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await onEmailSignIn(email.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Email sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setInfoMsg('');
    if (!fullName.trim()) {
      setLocalError('Enter your full name.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await onEmailSignUp(fullName.trim(), email.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setLocalError('');
    setInfoMsg('');
    if (!email.trim()) {
      setLocalError('Enter your email address above first, then tap Forgot password.');
      return;
    }
    setBusy(true);
    try {
      await onPasswordReset(email.trim());
      setInfoMsg(`Password reset email sent to ${email.trim()}. Check your inbox.`);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  };

  const handleGuestContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setInfoMsg('');
    setBusy(true);
    try {
      await onGuestSignIn(guestName.trim() || 'Walk-in Guest', guestPhone.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not start guest session.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleClick = async () => {
    setLocalError('');
    setInfoMsg('');
    setBusy(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
      {(route === '/kitchen' || route === '/cashier' || route === '/admin') && (
        <div className="bg-[#1C1714] text-[#FAF6EE] border border-[#D49B27] px-4 py-3 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            Workstation Route:{' '}
            <strong className="font-ticket text-[#D49B27]">{route}</strong> — Sign in with your
            assigned staff Google or Email account to open this station.
          </span>
        </div>
      )}

      {/* Hero Split: Left Brand & Visual + Right Dedicated Sign-In Box */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        {/* Left: Editorial Welcome & Food Photography */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-5 min-w-0">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#B93829] font-semibold">
              University Cafeteria · Open {cafeteriaSettings.openTime} –{' '}
              {cafeteriaSettings.closeTime} EAT
            </p>
            <h1
              className="font-display text-3xl sm:text-5xl font-bold text-[#1C1714] leading-[1.1]"
              style={{ textWrap: 'balance' }}
            >
              Campus Meals, Straight from the Kitchen Ticket
            </h1>
            <p className="text-sm sm:text-base text-[#61554C] leading-relaxed max-w-xl">
              Sign in with Google or Email & Password to use your daily Full-Board allowance, or
              order immediately as a Walk-in Guest via M-Pesa STK Push.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenBoard}
                className="min-h-[44px] px-4 py-2 border border-[#1C1714] text-xs sm:text-sm font-semibold text-[#1C1714] hover:bg-[#1C1714] hover:text-[#FAF6EE] transition-colors flex items-center gap-2"
              >
                <Monitor className="w-4 h-4" />
                View Live /board
              </button>
              <PWAInstallButton variant="landing" />
            </div>
          </div>

          <div className="bg-[#F2EBD9] border border-[#D9CEBC] overflow-hidden">
            <img
              src="/src/assets/images/hero_jawaka_spread_1795003276742.jpg"
              alt="Jawaka Catering university meal spread with pilau, chapati, sukuma, ugali, and chai"
              referrerPolicy="no-referrer"
              className="w-full h-56 sm:h-72 object-cover"
            />
          </div>
        </div>

        {/* Right: Multi-Method Sign-In Panel */}
        <div className="lg:col-span-6 bg-white border border-[#D9CEBC] flex flex-col justify-between min-w-0">
          <div>
            {/* Auth Method Tabs */}
            <div className="grid grid-cols-3 border-b border-[#D9CEBC]">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signin');
                  setLocalError('');
                  setInfoMsg('');
                }}
                className={`min-h-[50px] px-2 text-xs sm:text-sm font-semibold transition-colors ${
                  authTab === 'signin'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-[#FAF6EE] text-[#61554C] hover:text-[#1C1714]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('signup');
                  setLocalError('');
                  setInfoMsg('');
                }}
                className={`min-h-[50px] px-2 text-xs sm:text-sm font-semibold border-x border-[#D9CEBC] transition-colors ${
                  authTab === 'signup'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-[#FAF6EE] text-[#61554C] hover:text-[#1C1714]'
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('guest');
                  setLocalError('');
                  setInfoMsg('');
                }}
                className={`min-h-[50px] px-2 text-xs sm:text-sm font-semibold transition-colors ${
                  authTab === 'guest'
                    ? 'bg-[#D49B27] text-[#1C1714]'
                    : 'bg-[#FAF6EE] text-[#61554C] hover:text-[#1C1714]'
                }`}
              >
                Walk-in Guest
              </button>
            </div>

            <div className="p-5 sm:p-7 space-y-5">
              {displayError && (
                <div className="bg-[#FCECE9] border border-[#B93829] px-3.5 py-2.5 text-xs text-[#B93829] leading-relaxed">
                  {displayError}
                </div>
              )}

              {infoMsg && (
                <div className="bg-[#EDF5EE] border border-[#2E6F40] px-3.5 py-2.5 text-xs text-[#2E6F40] leading-relaxed">
                  {infoMsg}
                </div>
              )}

              {/* Google Sign-In Button shown on Sign In & Create Account tabs */}
              {authTab !== 'guest' && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleGoogleClick()}
                    className="w-full min-h-[48px] px-4 border border-[#1C1714] bg-white hover:bg-[#FAF6EE] text-[#1C1714] text-sm font-semibold flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  <div className="relative flex items-center">
                    <div className="flex-1 border-t border-[#E6DDD0]" />
                    <span className="px-3 text-xs text-[#61554C]">or with email & password</span>
                    <div className="flex-1 border-t border-[#E6DDD0]" />
                  </div>
                </>
              )}

              {/* TAB 1: EMAIL & PASSWORD SIGN IN */}
              {authTab === 'signin' && (
                <form onSubmit={(e) => void handleSubmitEmailSignIn(e)} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#61554C] mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="student@spu.ac.ke"
                        className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[#61554C]">Password</label>
                      <button
                        type="button"
                        onClick={() => void handleForgotPassword()}
                        className="text-xs text-[#B93829] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full min-h-[44px] pl-9 pr-10 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#61554C]"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[48px] bg-[#B93829] text-white text-sm font-bold hover:bg-[#9C2E21] transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Signing In...' : 'Sign In with Email'}
                  </button>
                </form>
              )}

              {/* TAB 2: CREATE ACCOUNT WITH EMAIL & PASSWORD */}
              {authTab === 'signup' && (
                <form onSubmit={(e) => void handleSubmitEmailSignUp(e)} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[#61554C] mb-1">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type="text"
                        autoComplete="name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Amina Wanjiku"
                        className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#61554C] mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="student@spu.ac.ke"
                        className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#61554C] mb-1">
                        Password (min 6)
                      </label>
                      <input
                        required
                        minLength={6}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#61554C] mb-1">
                        Confirm Password
                      </label>
                      <input
                        required
                        minLength={6}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••"
                        className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[48px] bg-[#1C1714] text-[#FAF6EE] text-sm font-bold hover:bg-[#332B26] transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Creating Account...' : 'Create Account & Continue'}
                  </button>
                </form>
              )}

              {/* TAB 3: WALK-IN GUEST MODE */}
              {authTab === 'guest' && (
                <form onSubmit={(e) => void handleGuestContinue(e)} className="space-y-4">
                  <div className="bg-[#FFF5D6] border border-[#D49B27] p-3.5">
                    <h2 className="font-display text-lg font-bold text-[#1C1714]">
                      Walk-in Customer Guest Mode
                    </h2>
                    <p className="text-xs text-[#61554C] mt-1 leading-relaxed">
                      No Google account or student ID needed. Browse all 72 cafeteria dishes, pay
                      directly via M-Pesa STK Push, and get a live ticket number for pickup.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#61554C] mb-1">
                      Your Name (optional, shown on kitchen ticket)
                    </label>
                    <div className="relative">
                      <UserCheck className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Walk-in Guest"
                        className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#61554C] mb-1">
                      M-Pesa Phone Number (optional now, asked at checkout)
                    </label>
                    <div className="relative">
                      <Smartphone className="w-4 h-4 text-[#61554C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="0712345678"
                        className="w-full min-h-[44px] pl-9 pr-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[50px] bg-[#D49B27] text-[#1C1714] text-sm font-bold hover:brightness-95 transition-all disabled:opacity-50"
                  >
                    {busy ? 'Opening Guest Menu...' : 'Continue as Walk-in Guest'}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Bottom Quick-Switch for Walk-in Guests */}
          {authTab !== 'guest' && (
            <div className="border-t border-[#E6DDD0] bg-[#FAF6EE] px-5 sm:px-7 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[#61554C]">
                Ordering as a walk-in visitor without an account?
              </span>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('guest');
                  setLocalError('');
                  setInfoMsg('');
                }}
                className="text-xs font-bold text-[#B93829] hover:underline"
              >
                Use Walk-in Guest Mode →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Printed Menu Teaser & Authentic Food Photography */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-white border border-[#D9CEBC] p-4 sm:p-6 min-w-0">
          <div className="flex items-baseline justify-between border-b-2 border-[#1C1714] pb-2 mb-4">
            <h2 className="font-display text-2xl font-bold">Special Corner</h2>
            <span className="text-xs text-[#61554C]">Today's Prices in KSh</span>
          </div>
          <div className="divide-y divide-[#F0E8DA]">
            {previewSpecials.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-3 min-w-0"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-14 sm:w-16 aspect-[4/3] overflow-hidden border border-[#D9CEBC] bg-[#F3ECE0] shrink-0">
                    <MenuFoodImage item={item} className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-sm sm:text-base font-medium text-[#1C1714] break-words min-w-0">
                      {item.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden sm:block flex-1 border-b border-dotted border-[#BFB3A2] mx-2 mb-1 min-w-[20px]"
                    />
                  </div>
                </div>
                <span className="font-ticket text-sm sm:text-base font-bold tabular-nums shrink-0">
                  {formatKSh(item.price)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          <div className="bg-white border border-[#D9CEBC] p-2">
            <div className="aspect-4/3 bg-[#F2EBD9] overflow-hidden">
              <img
                src="/src/assets/images/special_beef_kikwetu_1795003274652.jpg"
                alt="Beef Kikwetu with crispy wedges and kachumbari"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-xs font-medium text-[#1C1714] mt-2 px-1">Beef Kikwetu</p>
          </div>
          <div className="bg-white border border-[#D9CEBC] p-2">
            <div className="aspect-4/3 bg-[#F2EBD9] overflow-hidden">
              <img
                src="/src/assets/images/breakfast_chai_mandazi_1795003275816.jpg"
                alt="Kenyan spiced chai with golden mandazi and samosas"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-xs font-medium text-[#1C1714] mt-2 px-1">Chai & Snacks</p>
          </div>
        </div>
      </section>
    </div>
  );
}
