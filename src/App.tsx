import { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ArrowLeft, RefreshCw, ShieldCheck, Utensils } from 'lucide-react';
import { AdminView } from './components/AdminView';
import { CashierView } from './components/CashierView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { KitchenView } from './components/KitchenView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PullToRefresh } from './components/PullToRefresh';
import { PWAInstallButton } from './components/PWAInstallButton';
import { PublicBoardView } from './components/PublicBoardView';
import { SignInPage } from './components/SignInPage';
import { StudentView } from './components/StudentView';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { getNairobiDateString } from './lib/nairobiTime';
import { forceRefreshApp, subscribePwaUpdate } from './lib/pwaRefresh';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  DEFAULT_CAFETERIA_SETTINGS,
  DEFAULT_MPESA_SETTINGS,
  saveUserProfile,
  seedMenuAndSettings,
} from './services/jawakaService';
import {
  AllowanceUsage,
  CafeteriaSettings,
  MenuItem,
  MpesaSettings,
  Order,
  StudentType,
  UserProfile,
  UserRole,
} from './types';

type AppRoute = '/' | '/board' | '/kitchen' | '/cashier' | '/admin';

function parseRoute(pathname: string): AppRoute {
  if (pathname === '/board') return '/board';
  if (pathname === '/kitchen') return '/kitchen';
  if (pathname === '/cashier') return '/cashier';
  if (pathname === '/admin') return '/admin';
  return '/';
}

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials or tap Forgot password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to the Sign In tab.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'This sign-in provider is not enabled yet in Firebase Console (Authentication → Sign-in method). Enable Email/Password and Anonymous Sign-In to activate it.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed.';
  }
}

function JawakaShell() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname));
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<UserRole>('student');
  const guestProvisioningRef = useRef(false);

  // Shared real-time Firestore state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cafeteriaSettings, setCafeteriaSettings] = useState<CafeteriaSettings>(
    DEFAULT_CAFETERIA_SETTINGS
  );
  const [mpesaSettings, setMpesaSettings] = useState<MpesaSettings>(DEFAULT_MPESA_SETTINGS);
  const [orders, setOrders] = useState<Order[]>([]);
  const [allowanceUsage, setAllowanceUsage] = useState<AllowanceUsage | null>(null);

  // Onboarding form state
  const [onbName, setOnbName] = useState('');
  const [onbStudentType, setOnbStudentType] = useState<StudentType>('full_board');
  const [onbStudentNo, setOnbStudentNo] = useState('');
  const [onbPhone, setOnbPhone] = useState('');
  const [onbPin, setOnbPin] = useState('');
  const [onbError, setOnbError] = useState('');
  const [onbSaving, setOnbSaving] = useState(false);
  const [authError, setAuthError] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const [appRefreshing, setAppRefreshing] = useState(false);

  useEffect(() => subscribePwaUpdate(setUpdateReady), []);

  // Browser back/forward sync for /, /board, /kitchen, /cashier, /admin
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateTo = (next: AppRoute) => {
    setRoute(next);
    if (window.location.pathname !== next) {
      window.history.pushState({}, '', next);
    }
    if (next === '/kitchen') setActiveWorkspace('kitchen');
    else if (next === '/cashier') setActiveWorkspace('cashier');
    else if (next === '/admin') setActiveWorkspace('admin');
  };

  // Handle redirect auth result if mobile PWA fell back to redirect
  useEffect(() => {
    void getRedirectResult(auth).catch((err) => {
      if (err instanceof Error && err.message) {
        setAuthError(mapFirebaseAuthError(err));
      }
    });
  }, []);

  // Auth listener (persistent local session handled in firebase.ts)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (!u) {
        setUserProfile(null);
      } else {
        setOnbName(u.displayName || '');
      }
    });
    return () => unsub();
  }, []);

  // User profile listener + route-aware workspace default + auto guest provisioning
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const prof = snap.data() as UserProfile;
          setUserProfile(prof);

          if (route === '/kitchen' && (prof.role === 'kitchen' || prof.role === 'admin')) {
            setActiveWorkspace('kitchen');
          } else if (route === '/cashier' && (prof.role === 'cashier' || prof.role === 'admin')) {
            setActiveWorkspace('cashier');
          } else if (route === '/admin' && prof.role === 'admin') {
            setActiveWorkspace('admin');
          } else {
            setActiveWorkspace(prof.role);
          }
          setProfileLoading(false);
        } else {
          setUserProfile(null);
          // If anonymous walk-in guest reloaded without a profile doc yet, create one seamlessly
          if (firebaseUser.isAnonymous && !guestProvisioningRef.current) {
            guestProvisioningRef.current = true;
            void saveUserProfile({
              uid: firebaseUser.uid,
              email: 'guest@jawaka.local',
              displayName: firebaseUser.displayName || 'Walk-in Guest',
              role: 'student',
              studentType: 'commuter',
              isGuest: true,
              isNew: true,
            })
              .catch((err) => {
                setAuthError(
                  err instanceof Error ? err.message : 'Could not create guest session profile.'
                );
              })
              .finally(() => {
                guestProvisioningRef.current = false;
                setProfileLoading(false);
              });
          } else {
            setProfileLoading(false);
          }
        }
      },
      (err) => {
        setProfileLoading(false);
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
      }
    );
    return () => unsub();
  }, [authReady, firebaseUser, route]);

  // Menu & Settings listeners (attach only after auth is ready and user is signed in)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setMenuItems([]);
      return;
    }

    const unsubMenu = onSnapshot(
      query(collection(db, 'menuItems'), orderBy('sortOrder', 'asc')),
      (snap) => {
        setMenuItems(snap.docs.map((d) => d.data() as MenuItem));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'menuItems')
    );

    const unsubCaf = onSnapshot(
      doc(db, 'settings', 'cafeteria'),
      (snap) => {
        if (snap.exists()) setCafeteriaSettings(snap.data() as CafeteriaSettings);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/cafeteria')
    );

    const unsubMpesa = onSnapshot(
      doc(db, 'settings', 'mpesa'),
      (snap) => {
        if (snap.exists()) setMpesaSettings(snap.data() as MpesaSettings);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/mpesa')
    );

    return () => {
      unsubMenu();
      unsubCaf();
      unsubMpesa();
    };
  }, [authReady, firebaseUser]);

  // Auto-seed menu & settings if empty when admin signs in
  useEffect(() => {
    if (userProfile?.role === 'admin' && menuItems.length === 0) {
      void seedMenuAndSettings(userProfile).catch((err) => {
        console.error('Auto-seed warning:', err);
      });
    }
  }, [userProfile, menuItems.length]);

  // Orders listener (role-scoped)
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile) {
      setOrders([]);
      return;
    }

    const today = getNairobiDateString();
    const isStaff =
      userProfile.role === 'cashier' ||
      userProfile.role === 'kitchen' ||
      userProfile.role === 'admin';

    const ordersQuery = isStaff
      ? query(collection(db, 'orders'), where('dailyDate', '==', today))
      : query(collection(db, 'orders'), where('customerUid', '==', firebaseUser.uid));

    const unsub = onSnapshot(
      ordersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => {
          const ta =
            a.createdAt && typeof (a.createdAt as { toMillis?: () => number }).toMillis === 'function'
              ? (a.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          const tb =
            b.createdAt && typeof (b.createdAt as { toMillis?: () => number }).toMillis === 'function'
              ? (b.createdAt as { toMillis: () => number }).toMillis()
              : 0;
          return tb - ta;
        });
        setOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    return () => unsub();
  }, [authReady, firebaseUser, userProfile]);

  // Student daily allowance listener (skip for walk-in guests)
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile || userProfile.isGuest) {
      setAllowanceUsage(null);
      return;
    }
    const today = getNairobiDateString();
    const unsub = onSnapshot(
      doc(db, 'allowanceUsage', `${firebaseUser.uid}_${today}`),
      (snap) => {
        setAllowanceUsage(snap.exists() ? (snap.data() as AllowanceUsage) : null);
      },
      (err) =>
        handleFirestoreError(err, OperationType.GET, `allowanceUsage/${firebaseUser.uid}_${today}`)
    );
    return () => unsub();
  }, [authReady, firebaseUser, userProfile]);

  if (route === '/board') {
    return (
      <>
        <PullToRefresh />
        <PublicBoardView onExitBoard={() => navigateTo('/')} />
      </>
    );
  }

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-iframe') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirErr) {
          const msg = mapFirebaseAuthError(redirErr);
          setAuthError(msg);
          throw new Error(msg);
        }
      }
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const handleEmailSignIn = async (email: string, password: string) => {
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const handleEmailSignUp = async (name: string, email: string, password: string) => {
    setAuthError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      setOnbName(name);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const handlePasswordReset = async (email: string) => {
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const handleGuestSignIn = async (guestName: string, guestPhone: string) => {
    setAuthError('');
    guestProvisioningRef.current = true;
    try {
      const cred = await signInAnonymously(auth);
      await saveUserProfile({
        uid: cred.user.uid,
        email: 'guest@jawaka.local',
        displayName: guestName.trim() || 'Walk-in Guest',
        role: 'student',
        studentType: 'commuter',
        phone: guestPhone.trim() || undefined,
        isGuest: true,
        isNew: true,
      });
    } catch (err) {
      const msg = mapFirebaseAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    } finally {
      guestProvisioningRef.current = false;
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setOnbError('');
    if (!onbName.trim()) {
      setOnbError('Please enter your full name.');
      return;
    }
    if (onbStudentNo.trim() && onbStudentNo.trim().length < 2) {
      setOnbError('Student number must be at least 2 characters.');
      return;
    }
    if (onbPin.trim().length < 4) {
      setOnbError('Choose a 4-digit PIN for counter allowance verification.');
      return;
    }
    setOnbSaving(true);
    try {
      const isBootstrapAdmin =
        firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
        firebaseUser.emailVerified;
      await saveUserProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || 'student@jawaka.local',
        displayName: onbName.trim(),
        role: isBootstrapAdmin ? 'admin' : 'student',
        studentType: onbStudentType,
        studentNumber: onbStudentNo || `STD-${firebaseUser.uid.slice(0, 6).toUpperCase()}`,
        phone: onbPhone || '0712345678',
        pin: onbPin,
        isGuest: false,
        isNew: true,
      });
    } catch (err) {
      setOnbError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setOnbSaving(false);
    }
  };

  const isStandaloneStation =
    (route === '/kitchen' && (userProfile?.role === 'kitchen' || userProfile?.role === 'admin')) ||
    (route === '/cashier' && (userProfile?.role === 'cashier' || userProfile?.role === 'admin'));

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#1C1714] flex flex-col overflow-x-clip">
      <PullToRefresh />
      {/* Subtle Jawaka Film-Strip Border */}
      <div className="filmstrip-border no-print" />
      <OfflineIndicator />

      {/* Three-Zone Top Bar Contract */}
      <header className="no-print bg-[#FAF6EE] border-b border-[#D9CEBC] sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-3 min-w-0">
            {isStandaloneStation && userProfile?.role === 'admin' && (
              <button
                onClick={() => navigateTo('/')}
                title="Back to Main Shell"
                className="min-h-[38px] px-2.5 border border-[#D9CEBC] text-xs font-semibold flex items-center gap-1 hover:border-[#1C1714] shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Main</span>
              </button>
            )}
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('/');
              }}
              className="font-display text-lg sm:text-2xl font-bold tracking-tight text-[#1C1714] truncate"
            >
              Jawaka Catering
            </a>
            {route === '/kitchen' && (
              <span className="hidden sm:inline-block font-ticket text-[11px] uppercase px-2 py-0.5 bg-[#1C1714] text-[#D49B27] shrink-0">
                /kitchen
              </span>
            )}
            {route === '/cashier' && (
              <span className="hidden sm:inline-block font-ticket text-[11px] uppercase px-2 py-0.5 bg-[#B93829] text-white shrink-0">
                /cashier
              </span>
            )}
          </div>

          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-[#61554C]">
            {userProfile && (
              <>
                {(userProfile.role === 'student' || userProfile.role === 'admin') && (
                  <button
                    onClick={() => {
                      navigateTo('/');
                      setActiveWorkspace('student');
                    }}
                    className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                      activeWorkspace === 'student' && !isStandaloneStation
                        ? 'border-[#B93829] text-[#1C1714] font-semibold'
                        : 'border-transparent hover:text-[#1C1714]'
                    }`}
                  >
                    {userProfile.isGuest ? 'Guest Menu' : 'Student Menu'}
                  </button>
                )}
                {(userProfile.role === 'cashier' || userProfile.role === 'admin') && (
                  <button
                    onClick={() => {
                      navigateTo('/cashier');
                      setActiveWorkspace('cashier');
                    }}
                    className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                      activeWorkspace === 'cashier' || route === '/cashier'
                        ? 'border-[#B93829] text-[#1C1714] font-semibold'
                        : 'border-transparent hover:text-[#1C1714]'
                    }`}
                  >
                    Cashier POS
                  </button>
                )}
                {(userProfile.role === 'kitchen' || userProfile.role === 'admin') && (
                  <button
                    onClick={() => {
                      navigateTo('/kitchen');
                      setActiveWorkspace('kitchen');
                    }}
                    className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                      activeWorkspace === 'kitchen' || route === '/kitchen'
                        ? 'border-[#B93829] text-[#1C1714] font-semibold'
                        : 'border-transparent hover:text-[#1C1714]'
                    }`}
                  >
                    Kitchen Dashboard
                  </button>
                )}
                {userProfile.role === 'admin' && (
                  <button
                    onClick={() => {
                      navigateTo('/admin');
                      setActiveWorkspace('admin');
                    }}
                    className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                      activeWorkspace === 'admin'
                        ? 'border-[#B93829] text-[#1C1714] font-semibold'
                        : 'border-transparent hover:text-[#1C1714]'
                    }`}
                  >
                    Admin Console
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => navigateTo('/board')}
              className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:text-[#1C1714]"
            >
              Serving Board
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => {
                setAppRefreshing(true);
                void forceRefreshApp();
              }}
              disabled={appRefreshing}
              aria-label="Refresh app and check for updates"
              title={updateReady ? 'Update ready — tap to refresh' : 'Refresh app & sync'}
              className={`relative min-h-[40px] min-w-[40px] sm:px-3 py-1.5 border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                updateReady
                  ? 'border-[#2E6F40] bg-[#EDF5EE] text-[#2E6F40] hover:bg-[#DCECE0]'
                  : 'border-[#D9CEBC] bg-white text-[#1C1714] hover:border-[#1C1714]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${appRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{updateReady ? 'Update' : 'Refresh'}</span>
              {updateReady && (
                <span
                  aria-hidden="true"
                  className="sm:hidden absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#2E6F40] border border-[#FAF6EE]"
                />
              )}
            </button>
            {firebaseUser ? (
              <button
                onClick={() => void signOut(auth)}
                className="min-h-[40px] px-3 sm:px-4 py-1.5 border border-[#1C1714] text-xs font-semibold text-[#1C1714] hover:bg-[#1C1714] hover:text-[#FAF6EE] transition-colors whitespace-nowrap shrink-0"
              >
                {userProfile?.isGuest ? 'Exit Guest' : 'Sign Out'}
              </button>
            ) : (
              <button
                onClick={() => void handleGoogleSignIn().catch(() => {})}
                className="min-h-[40px] px-3.5 sm:px-4 py-1.5 bg-[#B93829] text-white text-xs font-semibold hover:bg-[#9C2E21] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile Workstation / Role Switcher */}
        {userProfile && (userProfile.role !== 'student' || route !== '/') && (
          <div className="md:hidden border-t border-[#E6DDD0] px-3 py-2 flex items-center gap-2 overflow-x-auto bg-[#F2EBD9]">
            {(userProfile.role === 'student' || userProfile.role === 'admin') && (
              <button
                onClick={() => {
                  navigateTo('/');
                  setActiveWorkspace('student');
                }}
                className={`min-h-[38px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  activeWorkspace === 'student'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-white border border-[#D9CEBC] text-[#1C1714]'
                }`}
              >
                {userProfile.isGuest ? 'Guest' : 'Student'}
              </button>
            )}
            {(userProfile.role === 'cashier' || userProfile.role === 'admin') && (
              <button
                onClick={() => {
                  navigateTo('/cashier');
                  setActiveWorkspace('cashier');
                }}
                className={`min-h-[38px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  activeWorkspace === 'cashier'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-white border border-[#D9CEBC] text-[#1C1714]'
                }`}
              >
                Cashier POS
              </button>
            )}
            {(userProfile.role === 'kitchen' || userProfile.role === 'admin') && (
              <button
                onClick={() => {
                  navigateTo('/kitchen');
                  setActiveWorkspace('kitchen');
                }}
                className={`min-h-[38px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  activeWorkspace === 'kitchen'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-white border border-[#D9CEBC] text-[#1C1714]'
                }`}
              >
                Kitchen
              </button>
            )}
            {userProfile.role === 'admin' && (
              <button
                onClick={() => {
                  navigateTo('/admin');
                  setActiveWorkspace('admin');
                }}
                className={`min-h-[38px] px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                  activeWorkspace === 'admin'
                    ? 'bg-[#1C1714] text-[#FAF6EE]'
                    : 'bg-white border border-[#D9CEBC] text-[#1C1714]'
                }`}
              >
                Admin
              </button>
            )}
            <button
              onClick={() => navigateTo('/board')}
              className="min-h-[38px] px-3 text-xs font-semibold bg-[#14110F] text-[#D49B27] whitespace-nowrap shrink-0"
            >
              /board
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {!authReady || profileLoading ? (
          <div className="max-w-3xl mx-auto px-6 py-20 text-center">
            <Utensils className="w-8 h-8 text-[#B93829] mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-[#61554C]">Connecting to Jawaka Catering...</p>
          </div>
        ) : !firebaseUser ? (
          <SignInPage
            route={route}
            cafeteriaSettings={cafeteriaSettings}
            menuItems={menuItems}
            onGoogleSignIn={handleGoogleSignIn}
            onEmailSignIn={handleEmailSignIn}
            onEmailSignUp={handleEmailSignUp}
            onPasswordReset={handlePasswordReset}
            onGuestSignIn={handleGuestSignIn}
            onOpenBoard={() => navigateTo('/board')}
            externalError={authError}
          />
        ) : !userProfile ? (
          /* First-Time Profile Registration for Google / Email+Password Users */
          <div className="max-w-lg mx-auto px-4 py-10 sm:py-12">
            <form
              onSubmit={(e) => void handleCompleteOnboarding(e)}
              className="bg-white border border-[#D9CEBC] p-5 sm:p-8 space-y-5"
            >
              <div className="border-b border-[#E6DDD0] pb-4">
                {firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
                  firebaseUser.emailVerified && (
                    <p className="text-xs font-semibold text-[#2E6F40] flex items-center gap-1.5 mb-2">
                      <ShieldCheck className="w-4 h-4" />
                      Cafeteria Admin Account Detected
                    </p>
                  )}
                <h1 className="font-display text-2xl font-bold text-[#1C1714]">
                  Complete Your Cafeteria Profile
                </h1>
                <p className="text-sm text-[#61554C] mt-1">
                  Set up your meal plan, student number, and 4-digit counter PIN.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={onbName}
                  onChange={(e) => setOnbName(e.target.value)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  Student Meal Plan
                </label>
                <select
                  value={onbStudentType}
                  onChange={(e) => setOnbStudentType(e.target.value as StudentType)}
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm"
                >
                  <option value="full_board">
                    Full-Board (KSh {cafeteriaSettings.dailyAllowance}/day — Admin Verified)
                  </option>
                  <option value="half_board">Half-Board (Pay via M-Pesa)</option>
                  <option value="commuter">Commuter (Pay via M-Pesa)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#61554C] mb-1">
                    Student Number
                  </label>
                  <input
                    required
                    type="text"
                    value={onbStudentNo}
                    onChange={(e) => setOnbStudentNo(e.target.value)}
                    placeholder="JKU-2026-0412"
                    className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#61554C] mb-1">
                    4-Digit Cashier PIN
                  </label>
                  <input
                    required
                    type="password"
                    inputMode="numeric"
                    minLength={4}
                    maxLength={6}
                    value={onbPin}
                    onChange={(e) => setOnbPin(e.target.value)}
                    placeholder="1234"
                    className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#61554C] mb-1">
                  M-Pesa Phone Number
                </label>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  value={onbPhone}
                  onChange={(e) => setOnbPhone(e.target.value)}
                  placeholder="0712345678"
                  className="w-full min-h-[44px] px-3 border border-[#D9CEBC] bg-[#FAF6EE] text-sm font-ticket"
                />
              </div>

              {onbError && <p className="text-xs text-[#B93829]">{onbError}</p>}

              <button
                type="submit"
                disabled={onbSaving}
                className="w-full min-h-[48px] bg-[#1C1714] text-[#FAF6EE] text-sm font-semibold hover:bg-[#332B26] disabled:opacity-50"
              >
                {onbSaving ? 'Saving Profile...' : 'Enter Jawaka Catering'}
              </button>
            </form>
          </div>
        ) : (
          /* Role & Route-Based Routing */
          <>
            {(activeWorkspace === 'cashier' || route === '/cashier') &&
            (userProfile.role === 'cashier' || userProfile.role === 'admin') ? (
              <CashierView
                cashier={userProfile}
                menuItems={menuItems}
                orders={orders}
                cafeteriaSettings={cafeteriaSettings}
                mpesaSettings={mpesaSettings}
                standaloneMode={route === '/cashier'}
                onOpenStandalone={() => navigateTo('/cashier')}
              />
            ) : (activeWorkspace === 'kitchen' || route === '/kitchen') &&
              (userProfile.role === 'kitchen' || userProfile.role === 'admin') ? (
              <KitchenView
                kitchenUser={userProfile}
                menuItems={menuItems}
                orders={orders}
                onOpenBoard={() => navigateTo('/board')}
                standaloneMode={route === '/kitchen'}
                onOpenStandalone={() => navigateTo('/kitchen')}
              />
            ) : (activeWorkspace === 'admin' || route === '/admin') &&
              userProfile.role === 'admin' ? (
              <AdminView
                admin={userProfile}
                menuItems={menuItems}
                orders={orders}
                cafeteriaSettings={cafeteriaSettings}
                mpesaSettings={mpesaSettings}
              />
            ) : (
              <StudentView
                user={userProfile}
                menuItems={menuItems}
                orders={orders}
                allowanceUsage={allowanceUsage}
                cafeteriaSettings={cafeteriaSettings}
                mpesaSettings={mpesaSettings}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <JawakaShell />
    </ErrorBoundary>
  );
}
