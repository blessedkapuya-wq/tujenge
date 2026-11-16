import { useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  BookOpen,
  Calendar,
  Check,
  Copy,
  CreditCard,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import AdminWindow from './components/AdminWindow';
import GroupAlertsView from './components/GroupAlertsView';
import MeetingsReportsView from './components/MeetingsReportsView';
import MemberDashboard from './components/MemberDashboard';
import MobileMoneyPayView from './components/MobileMoneyPayView';
import PhoneSignInModal from './components/PhoneSignInModal';
import PublicJoinView from './components/PublicJoinView';
import ResourcesView from './components/ResourcesView';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  OperationType,
  auth,
  db,
  handleFirestoreError,
  signOutUser,
} from './lib/firebase';
import { useLang } from './lib/i18n';
import {
  GROUP_DOC_ID,
  ensureInitialGroupSeeded,
  sendMeetingReminderBroadcast,
} from './lib/vicobaService';
import {
  AppView,
  GroupDocument,
  GroupMeeting,
  GroupNotification,
  JamiiPayout,
  MemberLedger,
  MemberLoan,
  MobilePayment,
  PaymentAdjustment,
  PaymentCategory,
  VicobaGroup,
} from './types/vicoba';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [view, setView] = useState<AppView>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);

  const { lang, setLang, t } = useLang();

  const [group, setGroup] = useState<VicobaGroup | null>(null);
  const [members, setMembers] = useState<MemberLedger[]>([]);
  const [payments, setPayments] = useState<MobilePayment[]>([]);
  const [loans, setLoans] = useState<MemberLoan[]>([]);
  const [notifications, setNotifications] = useState<GroupNotification[]>([]);
  const [documents, setDocuments] = useState<GroupDocument[]>([]);
  const [meetings, setMeetings] = useState<GroupMeeting[]>([]);
  const [jamiiPayouts, setJamiiPayouts] = useState<JamiiPayout[]>([]);
  const [adjustments, setAdjustments] = useState<PaymentAdjustment[]>([]);
  const [isAdminDoc, setIsAdminDoc] = useState(false);

  const [payMemberPrefill, setPayMemberPrefill] = useState<string | null>(null);
  const [payCategoryPrefill, setPayCategoryPrefill] =
    useState<PaymentCategory | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const syncedRemindersRef = useRef<Set<string>>(new Set());

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?join=1`;
  }, []);

  const isUserVerified = Boolean(
    user && (user.emailVerified || Boolean(user.phoneNumber))
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (nextUser) {
        try {
          await ensureInitialGroupSeeded({
            uid: nextUser.uid,
            email: nextUser.email,
            displayName: nextUser.displayName,
          });
        } catch (err) {
          console.error('Group seed check error:', err);
        }
      }
    });
    return () => unsub();
  }, []);

  // Public group overview listener
  useEffect(() => {
    const groupRef = doc(db, 'groups', GROUP_DOC_ID);
    const unsub = onSnapshot(
      groupRef,
      (snap) => {
        if (snap.exists()) {
          setGroup({ id: snap.id, ...(snap.data() as Omit<VicobaGroup, 'id'>) });
        } else {
          setGroup(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `groups/${GROUP_DOC_ID}`);
      }
    );
    return () => unsub();
  }, []);

  // Documents listener (public docs visible to invite visitors; all group docs visible to verified members)
  useEffect(() => {
    const docsQuery = isUserVerified
      ? query(
          collection(db, 'documents'),
          where('groupId', '==', GROUP_DOC_ID)
        )
      : query(
          collection(db, 'documents'),
          where('groupId', '==', GROUP_DOC_ID),
          where('visibility', '==', 'public')
        );

    const unsub = onSnapshot(
      docsQuery,
      (snap) => {
        setDocuments(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<GroupDocument, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    return () => unsub();
  }, [isUserVerified]);

  // Public member directory listener (no raw PII; visible to everyone)
  useEffect(() => {
    const membersQuery = query(
      collection(db, 'members'),
      where('status', 'in', ['active', 'pending'])
    );
    const unsubMembers = onSnapshot(
      membersQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MemberLedger, 'id'>),
          }))
          .sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));
        setMembers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'members')
    );
    return () => unsubMembers();
  }, []);

  // Authenticated group ledger listeners
  useEffect(() => {
    if (!authReady || !user || !isUserVerified) {
      setPayments([]);
      setLoans([]);
      setNotifications([]);
      setMeetings([]);
      setJamiiPayouts([]);
      setAdjustments([]);
      setIsAdminDoc(false);
      return;
    }

    const adminRef = doc(db, 'admins', user.uid);
    const unsubAdmin = onSnapshot(
      adminRef,
      (snap) => setIsAdminDoc(snap.exists()),
      (err) => handleFirestoreError(err, OperationType.GET, `admins/${user.uid}`)
    );

    const toMillis = (ts: unknown): number => {
      if (
        ts &&
        typeof ts === 'object' &&
        'toMillis' in ts &&
        typeof (ts as { toMillis: unknown }).toMillis === 'function'
      ) {
        return (ts as { toMillis: () => number }).toMillis();
      }
      return 0;
    };

    const paymentsQuery = query(
      collection(db, 'payments'),
      where('status', 'in', ['confirmed', 'adjusted', 'reversed'])
    );
    const unsubPayments = onSnapshot(
      paymentsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MobilePayment, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setPayments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const loansQuery = query(
      collection(db, 'loans'),
      where('status', 'in', ['pending', 'active', 'paid', 'rejected'])
    );
    const unsubLoans = onSnapshot(
      loansQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MemberLoan, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setLoans(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'loans')
    );

    const notifsQuery = query(
      collection(db, 'notifications'),
      where('recipientCount', '>=', 0)
    );
    const unsubNotifs = onSnapshot(
      notifsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<GroupNotification, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const meetingsQuery = query(
      collection(db, 'meetings'),
      where('groupId', '==', GROUP_DOC_ID)
    );
    const unsubMeetings = onSnapshot(
      meetingsQuery,
      (snap) => {
        setMeetings(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<GroupMeeting, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'meetings')
    );

    const jamiiQuery = query(
      collection(db, 'jamii_payouts'),
      where('groupId', '==', GROUP_DOC_ID)
    );
    const unsubJamii = onSnapshot(
      jamiiQuery,
      (snap) => {
        setJamiiPayouts(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<JamiiPayout, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jamii_payouts')
    );

    return () => {
      unsubAdmin();
      unsubPayments();
      unsubLoans();
      unsubNotifs();
      unsubMeetings();
      unsubJamii();
    };
  }, [authReady, user, isUserVerified]);

  const isAdmin = Boolean(
    user &&
      user.emailVerified &&
      (user.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase() ||
        isAdminDoc)
  );

  // Admin-only payment adjustments audit log listener
  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setAdjustments([]);
      return;
    }
    const adjQuery = query(
      collection(db, 'payment_adjustments'),
      where('groupId', '==', GROUP_DOC_ID)
    );
    const unsubAdj = onSnapshot(
      adjQuery,
      (snap) => {
        setAdjustments(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PaymentAdjustment, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payment_adjustments')
    );
    return () => unsubAdj();
  }, [authReady, user, isAdmin]);

  // Automated quarterly meeting reminder dispatcher (14-day, 3-day, and day-of)
  useEffect(() => {
    if (!user || !isUserVerified || meetings.length === 0) return;

    const nowMs = Date.now();
    for (const mtg of meetings) {
      if (mtg.status !== 'scheduled') continue;
      const mtgMs = new Date(`${mtg.meetingDate}T15:00:00`).getTime();
      if (Number.isNaN(mtgMs)) continue;
      const diffDays = Math.ceil((mtgMs - nowMs) / (1000 * 60 * 60 * 24));
      let windowTag: string | null = null;
      if (diffDays === 0) windowTag = 'd0';
      else if (diffDays > 0 && diffDays <= 3) windowTag = 'd3';
      else if (diffDays > 3 && diffDays <= 14) windowTag = 'd14';

      if (windowTag) {
        const key = `auto-mtg-${mtg.id}-${windowTag}`;
        if (!syncedRemindersRef.current.has(key)) {
          syncedRemindersRef.current.add(key);
          void sendMeetingReminderBroadcast({
            senderUid: user.uid,
            meeting: mtg,
            memberCount: group?.memberCount ?? Math.max(4, members.length),
            deterministicKey: key,
          });
        }
      }
    }
  }, [user, isUserVerified, meetings, group?.memberCount, members.length]);

  const currentMember = useMemo(() => {
    if (!user) return null;
    return members.find((m) => m.uid === user.uid) || null;
  }, [members, user]);

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const navLinks: { id: AppView; label: string; visible: boolean }[] = [
    { id: 'overview', label: t('Overview', 'Muhtasari'), visible: true },
    { id: 'member', label: t('Passbook', 'Kijitabu'), visible: Boolean(user) },
    { id: 'pay', label: t('Pay', 'Lipa'), visible: Boolean(user) },
    { id: 'meetings', label: t('Meetings', 'Mikutano'), visible: Boolean(user) },
    { id: 'resources', label: t('Resources', 'Kanuni'), visible: true },
    { id: 'admin', label: t('Admin', 'Msimamizi'), visible: isAdmin },
  ];

  const [dismissedNotifId, setDismissedNotifId] = useState<string | null>(null);
  const latestNotif = notifications[0] || null;
  const showNotifBanner = Boolean(
    user && latestNotif && latestNotif.id !== dismissedNotifId
  );

  const accountLabel = isAdmin
    ? 'Sarah Kapuya'
    : user?.phoneNumber || user?.displayName || user?.email || 'Member';

  return (
    <div className="min-h-screen bg-[#F5F0E6] text-[#17231C] flex flex-col">
      {/* Top Bar Contract: [Brand title] — [4-5 single-line nav links] — [1 primary action] */}
      <header className="sticky top-0 z-40 border-b border-[#E5DEC9] bg-[#F5F0E6]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 lg:gap-8 px-4 sm:px-6 lg:px-8 h-[56px] md:h-auto md:py-3.5">
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle navigation"
              className="md:hidden min-h-[40px] min-w-[40px] -ml-1.5 flex items-center justify-center rounded-xl text-[#17231C] hover:bg-[#EAE2D0]"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setView(user && currentMember ? 'member' : 'overview')}
              className="inline-flex items-center gap-2 font-display text-lg font-bold tracking-tight text-[#165432] whitespace-nowrap shrink-0"
            >
              <svg
                viewBox="0 0 36 24"
                className="h-6 w-8 shrink-0"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="3.4" fill="#D97706" />
                <path d="M2.5 20c0-3.3 2.4-5.6 5.5-5.6s5.5 2.3 5.5 5.6H2.5z" fill="#D97706" />
                <circle cx="28" cy="8" r="3.4" fill="#D97706" />
                <path d="M22.5 20c0-3.3 2.4-5.6 5.5-5.6s5.5 2.3 5.5 5.6h-11z" fill="#D97706" />
                <circle cx="18" cy="6.5" r="4.2" fill="#165432" />
                <path d="M10.5 21.5c0-4.3 3.3-7.3 7.5-7.3s7.5 3 7.5 7.3h-15z" fill="#165432" />
              </svg>
              <span>Tujenge Hub</span>
            </button>
          </div>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium"
          >
            {navLinks
              .filter((item) => item.visible)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:underline underline-offset-4 ${
                    view === item.id
                      ? 'text-[#165432] font-semibold underline underline-offset-4'
                      : 'text-[#4B5850] hover:text-[#17231C]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
          </nav>

          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap shrink-0"
              >
                {copiedShareLink ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('Link Copied', 'Kiungo Kimekopiwa')}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('Share Link', 'Shiriki Kiungo')}
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSignInModalOpen(true)}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                {t('Sign In', 'Ingia')}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
            {navLinks
              .filter((item) => item.visible)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setView(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full min-h-[44px] text-left rounded-xl px-3.5 py-2 text-sm font-medium ${
                    view === item.id
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            {user && (
              <button
                type="button"
                onClick={() => {
                  setView('alerts');
                  setMobileNavOpen(false);
                }}
                className={`w-full min-h-[44px] text-left rounded-xl px-3.5 py-2 text-sm font-medium ${
                  view === 'alerts'
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t('Group Alerts', 'Taarifa za Kikundi')} ({notifications.length})
              </button>
            )}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between px-2">
              <span className="text-xs text-slate-500">{t('Language', 'Lugha')}</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium ${
                    lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLang('sw')}
                  className={`min-h-[34px] rounded-md px-3 py-1 text-xs font-medium ${
                    lang === 'sw' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Kiswahili
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Quiet Account & Language Strip */}
      <div className="border-b border-[#E5DEC9] bg-[#FAF7F0]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#55635A]">
          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {t('Signed in as', 'Umeingia kama')}{' '}
                <strong className="text-[#17231C]">{accountLabel}</strong>
              </span>
              {currentMember && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#165432]">
                    {currentMember.memberNumber}
                  </span>
                </>
              )}
              {isAdmin && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-[#B45309]">{t('Admin', 'Msimamizi')}</span>
                </>
              )}
            </div>
          ) : (
            <span>
              {t('Tujenge Hub VICOBA · Weekly Sunday Min 12,000 TSH', 'Tujenge Hub VICOBA · Kila Jumapili Angalau 12,000 TSH')}
            </span>
          )}

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="inline-flex items-center rounded-lg bg-[#EAE2D0] p-0.5" role="group" aria-label="Language switcher">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  lang === 'en' ? 'bg-white text-[#17231C] shadow-sm' : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('sw')}
                className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  lang === 'sw' ? 'bg-white text-[#17231C] shadow-sm' : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                SW
              </button>
            </div>
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => setView('alerts')}
                  className="text-[#165432] font-medium hover:underline whitespace-nowrap"
                >
                  {t('Alerts', 'Taarifa')} ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-1 text-[#55635A] hover:text-[#17231C] transition-colors whitespace-nowrap"
                >
                  <LogOut className="h-3 w-3" aria-hidden="true" />
                  {t('Sign out', 'Toka')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Latest Group Payment / Meeting Notification Banner */}
      {showNotifBanner && latestNotif && (
        <div className="border-b border-[#E5DEC9] bg-[#E8F1EB]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[#165432] shrink-0">
                {t('Group Alert:', 'Taarifa:')}
              </span>
              <span className="text-[#17231C] truncate">{latestNotif.message}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setView('alerts')}
                className="font-medium text-[#165432] hover:underline whitespace-nowrap"
              >
                {t('View all', 'Ona zote')}
              </button>
              <button
                type="button"
                onClick={() => setDismissedNotifId(latestNotif.id)}
                aria-label="Dismiss notification"
                className="text-[#55635A] hover:text-[#17231C]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-28 md:pb-8">
        {view === 'overview' && (
          <PublicJoinView
            group={group}
            user={user}
            members={members}
            currentMember={currentMember}
            shareUrl={shareUrl}
            onRequestSignIn={() => setSignInModalOpen(true)}
            onGoToMember={() => setView('member')}
            onGoToPay={() => setView('pay')}
            onGoToResources={() => setView('resources')}
          />
        )}

        {view === 'member' && (
          <MemberDashboard
            group={group}
            currentMember={currentMember}
            userUid={user?.uid || null}
            userContact={user?.phoneNumber || user?.email || null}
            members={members}
            loans={loans}
            payments={payments}
            meetings={meetings}
            notifications={notifications}
            isAdmin={isAdmin}
            onGoToPay={(category) => {
              setPayMemberPrefill(currentMember?.id || null);
              setPayCategoryPrefill(category || 'weekly_contribution');
              setView('pay');
            }}
            onGoToJoin={() => setView('overview')}
            onGoToAlerts={() => setView('alerts')}
            onGoToMeetings={() => setView('meetings')}
          />
        )}

        {view === 'pay' && user && (
          <MobileMoneyPayView
            actorUid={user.uid}
            isAdmin={isAdmin}
            group={group}
            members={members}
            currentMember={currentMember}
            payments={payments}
            preselectedMemberId={payMemberPrefill}
            preselectedCategory={payCategoryPrefill}
            onDoneNavigateToAlerts={() => setView('alerts')}
            onDoneNavigateToPassbook={() => setView('member')}
          />
        )}

        {view === 'meetings' && user && (
          <MeetingsReportsView
            group={group}
            members={members}
            payments={payments}
            loans={loans}
            meetings={meetings}
            jamiiPayouts={jamiiPayouts}
            isAdmin={isAdmin}
            actorUid={user.uid}
          />
        )}

        {view === 'resources' && (
          <ResourcesView
            group={group}
            documents={documents}
            meetings={meetings}
            isAdmin={isAdmin}
            adminUid={user?.uid || null}
            adminName={isAdmin ? 'Sarah Kapuya' : user?.displayName || 'Sarah Kapuya'}
            onGoToJoin={() => setView('overview')}
            onGoToLoanForm={() => setView(user ? 'member' : 'overview')}
            onGoToMeetings={() => setView(user ? 'meetings' : 'overview')}
          />
        )}

        {view === 'alerts' && (
          <GroupAlertsView
            isAdmin={isAdmin}
            currentMember={currentMember}
            notifications={notifications}
            payments={payments}
          />
        )}

        {view === 'admin' && user && (
          <AdminWindow
            adminUid={user.uid}
            isAdmin={isAdmin}
            group={group}
            members={members}
            loans={loans}
            payments={payments}
            meetings={meetings}
            jamiiPayouts={jamiiPayouts}
            adjustments={adjustments}
            shareUrl={shareUrl}
            onRecordPaymentForMember={(memberId, category) => {
              setPayMemberPrefill(memberId);
              setPayCategoryPrefill(category);
              setView('pay');
            }}
          />
        )}
      </main>

      <footer className="hidden md:block border-t border-[#E5DEC9] bg-[#FAF7F0] py-6">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#55635A]">
          <div className="font-display font-semibold text-[#165432]">Tujenge Hub VICOBA</div>
          <div>Currency: Tanzanian Shillings (TSH) · Sunday Weekly 12,000 TSH · Quarterly 3-Month Meetings</div>
        </div>
      </footer>

      {/* Mobile Bottom Floating Dock (md:hidden) matching sample UI */}
      <nav
        aria-label="Mobile quick navigation"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-[#E5DEC9] bg-white/95 shadow-lg backdrop-blur-md px-1"
      >
        {user ? (
          <div className="grid grid-cols-5 h-[58px] items-center">
            <button
              type="button"
              onClick={() => setView('member')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'member' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              <span>{t('Home', 'Nyumbani')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('pay')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'pay' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              <span>{t('Pay', 'Lipa')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('meetings')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'meetings' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              <span>{t('Meetings', 'Mikutano')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('resources')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'resources' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>{t('Resources', 'Kanuni')}</span>
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setView('admin')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  view === 'admin' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
                }`}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{t('Admin', 'Msimamizi')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView('overview')}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                  view === 'overview' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
                }`}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>{t('Members', 'Wanachama')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 h-[58px] items-center">
            <button
              type="button"
              onClick={() => setView('overview')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'overview' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              <span>{t('Join', 'Jiunge')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView('resources')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                view === 'resources' ? 'text-[#C86D14] font-semibold' : 'text-[#55635A]'
              }`}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>{t('Resources', 'Kanuni')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSignInModalOpen(true)}
              className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-[#165432]"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{t('Sign In', 'Ingia')}</span>
            </button>
          </div>
        )}
      </nav>

      <PhoneSignInModal
        open={signInModalOpen}
        onClose={() => setSignInModalOpen(false)}
      />
    </div>
  );
}
