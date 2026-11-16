import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CalendarCheck,
  Check,
  CheckCircle2,
  Coins,
  Edit3,
  Eye,
  Handshake,
  HeartHandshake,
  History,
  Loader2,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Users,
  X,
} from 'lucide-react';
import AdminOperationsPanel from './AdminOperationsPanel';
import { useLang } from '../lib/i18n';
import {
  adjustOrReversePayment,
  applySundayFineToMember,
  approvePendingLoan,
  declinePendingLoan,
  fetchMemberPrivatePii,
  issueMemberLoan,
  recordJamiiPayout,
  relinkMemberPhoneAndUid,
  sendSundayRollCallReminder,
} from '../lib/vicobaService';
import {
  GroupMeeting,
  JamiiPayout,
  JamiiPayoutReason,
  MemberLedger,
  MemberLoan,
  MemberPrivatePii,
  MobilePayment,
  PaymentAdjustment,
  PaymentCategory,
  VicobaGroup,
  buildWhatsAppUrl,
  formatTimestamp,
  formatTsh,
  getCurrentWeekWindow,
  getTimestampMs,
} from '../types/vicoba';

interface AdminWindowProps {
  adminUid: string;
  isAdmin: boolean;
  group: VicobaGroup | null;
  members: MemberLedger[];
  loans: MemberLoan[];
  payments: MobilePayment[];
  meetings?: GroupMeeting[];
  jamiiPayouts: JamiiPayout[];
  adjustments: PaymentAdjustment[];
  shareUrl: string;
  onRecordPaymentForMember: (memberId: string, category: PaymentCategory) => void;
}

const JAMII_REASONS: JamiiPayoutReason[] = [
  'Illness',
  'Bereavement',
  'Family Emergency',
  'Maternity',
  'Other',
];

function formatCompactAxis(val: number): string {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${Math.round(val / 1000)}K`;
  return String(val);
}

export default function AdminWindow({
  adminUid,
  isAdmin,
  group,
  members,
  loans,
  payments,
  meetings = [],
  jamiiPayouts,
  adjustments,
  shareUrl,
  onRecordPaymentForMember,
}: AdminWindowProps) {
  const { t } = useLang();

  const nextMeeting = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = [...meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
    return sorted.find((m) => m.status === 'scheduled' && m.meetingDate >= today) || sorted[0] || null;
  }, [meetings]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'with_loan' | 'no_loan'>('all');
  const [copiedLink, setCopiedLink] = useState(false);

  // Issue loan modal state
  const [loanModalMember, setLoanModalMember] = useState<MemberLedger | null>(null);
  const [principalTsh, setPrincipalTsh] = useState<number>(50000);
  const [durationMonths, setDurationMonths] = useState<number>(3);
  const [purpose, setPurpose] = useState('');
  const [loanSubmitting, setLoanSubmitting] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);

  // Pending loan approvals
  const [processingLoanId, setProcessingLoanId] = useState<string | null>(null);

  // Member Private PII modal + Phone/UID Recovery
  const [piiMember, setPiiMember] = useState<MemberLedger | null>(null);
  const [piiData, setPiiData] = useState<MemberPrivatePii | null>(null);
  const [piiLoading, setPiiLoading] = useState(false);
  const [relinkPhone, setRelinkPhone] = useState('');
  const [relinkUid, setRelinkUid] = useState('');
  const [relinkSubmitting, setRelinkSubmitting] = useState(false);
  const [relinkFeedback, setRelinkFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Sunday Roll-Call state
  const [finingMemberId, setFiningMemberId] = useState<string | null>(null);
  const [finedMemberIds, setFinedMemberIds] = useState<Record<string, boolean>>({});
  const [sendingSundayAlert, setSendingSundayAlert] = useState(false);
  const [sundayAlertSent, setSundayAlertSent] = useState(false);

  // Jamii Emergency Payout form state
  const [showJamiiForm, setShowJamiiForm] = useState(false);
  const [jamiiMemberId, setJamiiMemberId] = useState<string>('');
  const [jamiiReason, setJamiiReason] = useState<JamiiPayoutReason>('Illness');
  const [jamiiAmountTsh, setJamiiAmountTsh] = useState<number>(20000);
  const [jamiiDate, setJamiiDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jamiiNotes, setJamiiNotes] = useState('');
  const [jamiiSubmitting, setJamiiSubmitting] = useState(false);
  const [jamiiError, setJamiiError] = useState<string | null>(null);

  // Payment Adjustment / Reversal modal state
  const [adjustModal, setAdjustModal] = useState<{
    payment: MobilePayment;
    action: 'adjusted' | 'reversed';
  } | null>(null);
  const [adjustAmountTsh, setAdjustAmountTsh] = useState<number>(12000);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const weekWindow = useMemo(() => getCurrentWeekWindow(), []);
  const sundayMinTsh = (group?.sharePriceTsh ?? 10000) + (group?.socialFundTsh ?? 2000);
  const sundayFineTsh = group?.sundayFineTsh ?? 5000;

  const sundayRollCall = useMemo(() => {
    const weeklyByMember: Record<string, number> = {};
    for (const p of payments) {
      if (p.status === 'reversed') continue;
      if (p.category !== 'weekly_contribution' && p.category !== 'shares') continue;
      const ms = getTimestampMs(p.createdAt);
      if (ms !== null && ms >= weekWindow.startMs && ms <= weekWindow.endMs) {
        weeklyByMember[p.memberId] = (weeklyByMember[p.memberId] || 0) + Number(p.amountTsh || 0);
      }
    }
    const rows = members.map((m) => {
      const paidThisWeekTsh = weeklyByMember[m.id] || 0;
      const isPaid = paidThisWeekTsh >= sundayMinTsh;
      return { member: m, paidThisWeekTsh, isPaid };
    });
    const paidCount = rows.filter((r) => r.isPaid).length;
    const pendingNumbers = rows.filter((r) => !r.isPaid).map((r) => r.member.memberNumber);
    return { rows, paidCount, pendingNumbers };
  }, [members, payments, weekWindow.startMs, weekWindow.endMs, sundayMinTsh]);

  const jamiiStats = useMemo(() => {
    const totalCollected = members.reduce((s, m) => s + Number(m.socialFundTsh || 0), 0);
    const payoutsSum = jamiiPayouts.reduce((s, p) => s + Number(p.amountTsh || 0), 0);
    const totalPaidOut = Math.max(Number(group?.totalJamiiOutTsh || 0), payoutsSum);
    const remaining = Math.max(0, totalCollected - totalPaidOut);
    return { totalCollected, totalPaidOut, remaining };
  }, [members, jamiiPayouts, group?.totalJamiiOutTsh]);

  // 4-Week Quarterly Collection Chart Data matching Screen 3
  const quarterlyChart = useMemo(() => {
    const validPayments = payments.filter((p) => p.status !== 'reversed');
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const buckets = [0, 0, 0, 0];

    for (const p of validPayments) {
      const ms = getTimestampMs(p.createdAt) ?? now;
      const ageMs = Math.max(0, now - ms);
      const weeksAgo = Math.floor(ageMs / weekMs);
      if (weeksAgo >= 0 && weeksAgo < 4) {
        const idx = 3 - weeksAgo; // 0 = Week 1 (oldest), 3 = Week 4 (latest)
        buckets[idx] += Number(p.amountTsh || 0);
      }
    }

    const totalQuarterCollected =
      Number(group?.totalGroupPoolTsh || 0) ||
      validPayments.reduce((sum, p) => sum + Number(p.amountTsh || 0), 0);

    const maxBucket = Math.max(...buckets, 48000);
    const scaleTop = Math.ceil(maxBucket / 50000) * 50000 || 100000;

    return {
      totalQuarterCollected,
      scaleTop,
      bars: [
        { label: t('Week 1', 'Wiki 1'), amountTsh: buckets[0] },
        { label: t('Week 2', 'Wiki 2'), amountTsh: buckets[1] },
        { label: t('Week 3', 'Wiki 3'), amountTsh: buckets[2] },
        { label: t('Week 4', 'Wiki 4'), amountTsh: buckets[3] },
      ],
    };
  }, [payments, group?.totalGroupPoolTsh, t]);

  const sortedJamiiPayouts = useMemo(
    () => [...jamiiPayouts].sort((a, b) => b.payoutDate.localeCompare(a.payoutDate)),
    [jamiiPayouts]
  );

  const sortedAdjustments = useMemo(
    () =>
      [...adjustments].sort(
        (a, b) => (getTimestampMs(b.createdAt) || 0) - (getTimestampMs(a.createdAt) || 0)
      ),
    [adjustments]
  );

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-[#E5DEC9] bg-white p-8 shadow-xs">
        <h2 className="font-display text-lg font-semibold text-[#17231C]">
          {t(
            'Admin Window (Chairperson & Treasurer Only)',
            'Dirisha la Msimamizi (Mwenyekiti & Mweka Hazina Pekee)'
          )}
        </h2>
        <p className="mt-1.5 text-sm text-[#55635A] max-w-xl">
          {t(
            'The Admin Window tracks every member’s total Hisa, active loans, loan repayments, and member application details. Sign in with the group admin account to manage the full ledger.',
            'Dirisha la Msimamizi hufuatilia jumla ya Hisa za kila mwanachama, mikopo hai, marejesho ya mikopo, na taarifa za usajili. Ingia na akaunti ya msimamizi ili kusimamia leja.'
          )}
        </p>
      </div>
    );
  }

  const pendingLoans = loans.filter((l) => l.status === 'pending');
  const activeLoans = loans.filter((l) => l.status === 'active');
  const membersWithLoansCount = members.filter(
    (m) => m.activeLoanBalanceTsh > 0
  ).length;
  const loanMultiplier = group?.loanMultiplier ?? 3;
  const interestPct = group?.interestRatePct ?? 10;

  const totalMemberHisaTsh = members.reduce(
    (sum, m) => sum + Number(m.totalSavedTsh || 0),
    0
  );
  const totalLoanPaymentsTsh = members.reduce(
    (sum, m) => sum + Number(m.totalLoanRepaidTsh || 0),
    0
  );

  const filteredMembers = members.filter((m) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'with_loan' && m.activeLoanBalanceTsh > 0) ||
      (filter === 'no_loan' && m.activeLoanBalanceTsh === 0);
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      m.fullName.toLowerCase().includes(q) ||
      m.memberNumber.toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleInspectPii = async (member: MemberLedger) => {
    setPiiMember(member);
    setPiiData(null);
    setRelinkPhone('');
    setRelinkUid('');
    setRelinkFeedback(null);
    setPiiLoading(true);
    try {
      const data = await fetchMemberPrivatePii(member.id);
      setPiiData(data);
      if (data?.phone) {
        setRelinkPhone(data.phone);
      }
    } finally {
      setPiiLoading(false);
    }
  };

  const handleRelinkMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!piiMember) return;
    setRelinkSubmitting(true);
    setRelinkFeedback(null);
    try {
      const res = await relinkMemberPhoneAndUid({
        memberId: piiMember.id,
        newPhone: relinkPhone,
        newUid: relinkUid,
      });
      setPiiMember((prev) =>
        prev ? { ...prev, maskedPhone: res.maskedPhone, uid: res.uid } : prev
      );
      if (relinkPhone.trim()) {
        setPiiData((prev) =>
          prev ? { ...prev, phone: relinkPhone.trim(), uid: res.uid } : prev
        );
      }
      setRelinkUid('');
      setRelinkFeedback({
        ok: true,
        text: t(
          'Phone number & passbook link updated safely.',
          'Namba ya simu na kiungo cha kijitabu kimesasishwa salama.'
        ),
      });
    } catch (err) {
      setRelinkFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to update member link.',
      });
    } finally {
      setRelinkSubmitting(false);
    }
  };

  const handleOpenLoanModal = (member: MemberLedger) => {
    const maxAllowed = Math.max(10000, member.totalSavedTsh * loanMultiplier);
    setLoanModalMember(member);
    setPrincipalTsh(Math.min(100000, maxAllowed));
    setDurationMonths(3);
    setPurpose('');
    setLoanError(null);
  };

  const handleIssueLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanModalMember) return;
    if (!purpose.trim()) {
      setLoanError(t('Enter a brief loan purpose.', 'Weka sababu fupi ya mkopo.'));
      return;
    }

    setLoanSubmitting(true);
    setLoanError(null);

    try {
      await issueMemberLoan({
        adminUid,
        member: loanModalMember,
        principalTsh,
        durationMonths,
        purpose: purpose.trim(),
      });
      setLoanModalMember(null);
    } catch (err) {
      setLoanError(
        err instanceof Error ? err.message : 'Unable to issue loan right now.'
      );
    } finally {
      setLoanSubmitting(false);
    }
  };

  const handleApproveLoan = async (loan: MemberLoan) => {
    setProcessingLoanId(loan.id);
    try {
      await approvePendingLoan({ adminUid, loan });
    } finally {
      setProcessingLoanId(null);
    }
  };

  const handleDeclineLoan = async (loanId: string) => {
    setProcessingLoanId(loanId);
    try {
      await declinePendingLoan(loanId);
    } finally {
      setProcessingLoanId(null);
    }
  };

  const handleApplyFine = async (member: MemberLedger) => {
    setFiningMemberId(member.id);
    try {
      await applySundayFineToMember({
        adminUid,
        member,
        fineTsh: sundayFineTsh,
        weekLabel: weekWindow.weekLabel,
        memberCount: group?.memberCount ?? members.length,
      });
      setFinedMemberIds((prev) => ({ ...prev, [member.id]: true }));
    } finally {
      setFiningMemberId(null);
    }
  };

  const handleSendSundayReminder = async () => {
    setSendingSundayAlert(true);
    try {
      await sendSundayRollCallReminder({
        adminUid,
        pendingNumbers: sundayRollCall.pendingNumbers,
        sundayDateStr: weekWindow.sundayDateStr,
        memberCount: group?.memberCount ?? members.length,
      });
      setSundayAlertSent(true);
      setTimeout(() => setSundayAlertSent(false), 2500);
    } finally {
      setSendingSundayAlert(false);
    }
  };

  const handleRecordJamiiPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetMember =
      members.find((m) => m.id === (jamiiMemberId || members[0]?.id)) || null;
    if (!targetMember) {
      setJamiiError(t('Select a member recipient.', 'Chagua mwanachama anayepokea.'));
      return;
    }
    if (jamiiAmountTsh < 1000) {
      setJamiiError(t('Minimum payout is 1,000 TSH.', 'Kiwango cha chini ni 1,000 TSH.'));
      return;
    }
    if (!jamiiNotes.trim()) {
      setJamiiError(t('Add brief notes for the emergency payout.', 'Weka maelezo mafupi ya dharura.'));
      return;
    }
    setJamiiSubmitting(true);
    setJamiiError(null);
    try {
      await recordJamiiPayout({
        adminUid,
        member: targetMember,
        reason: jamiiReason,
        notes: jamiiNotes.trim(),
        amountTsh: jamiiAmountTsh,
        payoutDate: jamiiDate,
      });
      setJamiiNotes('');
      setShowJamiiForm(false);
    } catch (err) {
      setJamiiError(err instanceof Error ? err.message : 'Could not save Jamii payout.');
    } finally {
      setJamiiSubmitting(false);
    }
  };

  const openAdjustModal = (payment: MobilePayment, action: 'adjusted' | 'reversed') => {
    setAdjustModal({ payment, action });
    setAdjustAmountTsh(payment.amountTsh);
    setAdjustReason('');
    setAdjustError(null);
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal) return;
    if (!adjustReason.trim()) {
      setAdjustError(
        t('Please enter a reason for the audit trail.', 'Tafadhali weka sababu ya marekebisho.')
      );
      return;
    }
    if (adjustModal.action === 'adjusted' && adjustAmountTsh < 1000) {
      setAdjustError(
        t('Adjusted amount must be at least 1,000 TSH (or choose Reverse).', 'Kiasi kiwe angalau 1,000 TSH (au chagua Batilisha).')
      );
      return;
    }
    setAdjustSubmitting(true);
    setAdjustError(null);
    try {
      await adjustOrReversePayment({
        adminUid,
        payment: adjustModal.payment,
        action: adjustModal.action,
        newAmountTsh: adjustAmountTsh,
        reason: adjustReason.trim(),
      });
      setAdjustModal(null);
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : 'Unable to adjust payment.'
      );
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const sundayWhatsAppMsg =
    sundayRollCall.pendingNumbers.length > 0
      ? t(
          `Tujenge Hub VICOBA Sunday Roll-Call (${weekWindow.sundayDateStr}): Minimum 12,000 TSH due (extra goes to Hisa). Missing Sunday incurs 5,000 TSH fine. Pending: ${sundayRollCall.pendingNumbers.join(', ')}.`,
          `Ukumbusho wa Jumapili Tujenge Hub (${weekWindow.sundayDateStr}): Kiwango cha chini 12,000 TSH (ziada huongeza Hisa). Kukosa Jumapili kuna faini ya 5,000 TSH. Wanaosubiriwa: ${sundayRollCall.pendingNumbers.join(', ')}.`
        )
      : t(
          `Tujenge Hub VICOBA Sunday Roll-Call (${weekWindow.sundayDateStr}): All ${members.length} members have paid >= 12,000 TSH this week!`,
          `Orodha ya Jumapili Tujenge Hub (${weekWindow.sundayDateStr}): Wanachama wote ${members.length} wameshalipa >= 12,000 TSH wiki hii!`
        );

  const inviteWhatsAppMsg = t(
    `Join our Tujenge Hub VICOBA group! Open this link to apply and receive your Member Number instantly: ${shareUrl}`,
    `Jiunge na kikundi chetu cha Tujenge Hub VICOBA! Fungua kiungo hiki kujisajili na kupata Namba yako ya Mwanachama papo hapo: ${shareUrl}`
  );

  return (
    <div className="space-y-6">
      {/* Sample Screen 3 Header: Admin + "Group overview" tag */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5DEC9] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#17231C]">
            {t('Admin', 'Msimamizi')}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#E4EDE7] px-2.5 py-1 text-xs font-semibold text-[#165432]">
              {t('Group overview', 'Muhtasari wa kikundi')}
            </span>
            <span className="text-xs text-[#55635A]">
              Sarah Kapuya ·{' '}
              {t(
                'Admin & Chairperson control ledger',
                'Leja ya Msimamizi na Mwenyekiti'
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleCopyInvite}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#E5DEC9] bg-white px-4 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] transition-colors whitespace-nowrap"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                {t('Invite Link Copied', 'Kiungo Kimekopiwa')}
              </>
            ) : (
              <>
                <Share2 className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                {t('Copy Join Link', 'Nakili Kiungo')}
              </>
            )}
          </button>

          <a
            href={buildWhatsAppUrl(inviteWhatsAppMsg)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('WhatsApp Invite', 'Tuma WhatsApp')}
          </a>
        </div>
      </div>

      {/* Screen 3 KPI Strip: Total hisa, Loans out, Repaid + Total Group Pool */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
            <Coins className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="mt-2.5 text-xs text-[#55635A]">{t('Total hisa', 'Jumla ya Hisa')}</div>
          <div className="mt-0.5 font-mono text-lg sm:text-xl font-bold tabular-nums text-[#17231C]">
            TSh {Math.round(totalMemberHisaTsh).toLocaleString('en-US')}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#55635A]">
            {group?.totalShares ?? 0} {t('shares · 12k min', 'hisa · 12k min')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#FBF0DA] text-[#C86D14]">
            <Handshake className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="mt-2.5 text-xs text-[#55635A]">{t('Loans out', 'Mikopo nje')}</div>
          <div className="mt-0.5 font-mono text-lg sm:text-xl font-bold tabular-nums text-[#C86D14]">
            TSh {Math.round(group?.totalLoanOutTsh ?? 0).toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-[#55635A]">
            {membersWithLoansCount}{' '}
            {membersWithLoansCount === 1
              ? t('member with loan', 'mwanachama ana mkopo')
              : t('members with loan', 'wanachama wana mikopo')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="mt-2.5 text-xs text-[#55635A]">{t('Repaid', 'Marejesho')}</div>
          <div className="mt-0.5 font-mono text-lg sm:text-xl font-bold tabular-nums text-[#165432]">
            TSh {Math.round(group?.totalLoanRepaidTsh ?? totalLoanPaymentsTsh).toLocaleString('en-US')}
          </div>
          <div className="mt-1 text-[11px] text-[#55635A]">
            {t('Loan repayments', 'Marejesho ya mikopo')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
            <Users className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="mt-2.5 text-xs text-[#55635A]">{t('Total group pool', 'Mfuko mkuu')}</div>
          <div className="mt-0.5 font-mono text-lg sm:text-xl font-bold tabular-nums text-[#17231C]">
            TSh {Math.round(group?.totalGroupPoolTsh ?? 0).toLocaleString('en-US')}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#55635A]">
            {members.length} {t('members', 'wanachama')} · TUJ-
            {String(group?.nextMemberSeq ?? members.length + 1).padStart(3, '0')}
          </div>
        </div>
      </div>

      {/* Screen 3: "Collected this quarter" Card with 4-Week Bar Chart */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium text-[#55635A]">
              {t('Collected this quarter', 'Makusanyo ya robo mwaka huu')}
            </div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#17231C]">
              TSh {Math.round(quarterlyChart.totalQuarterCollected).toLocaleString('en-US')}
            </div>
          </div>
          <span className="font-mono text-xs text-[#165432] font-semibold">
            {t('4-Week Rolling Activity', 'Mwenendo wa Wiki 4')}
          </span>
        </div>

        <div className="pt-2">
          <div className="flex items-end gap-3 h-40">
            {/* Y-axis scale labels */}
            <div className="flex flex-col justify-between h-full pb-6 pr-1 font-mono text-[10px] tabular-nums text-[#8A948D] text-right shrink-0">
              <span>{formatCompactAxis(quarterlyChart.scaleTop)}</span>
              <span>{formatCompactAxis(Math.round(quarterlyChart.scaleTop * 0.66))}</span>
              <span>{formatCompactAxis(Math.round(quarterlyChart.scaleTop * 0.33))}</span>
              <span>0</span>
            </div>

            {/* 4 Vertical Green Columns */}
            <div className="flex-1 grid grid-cols-4 gap-3 sm:gap-5 h-full items-end border-b border-[#EFEAE0] pb-6 relative">
              {quarterlyChart.bars.map((bar) => {
                const ratio =
                  quarterlyChart.scaleTop > 0
                    ? Math.min(1, bar.amountTsh / quarterlyChart.scaleTop)
                    : 0;
                const heightPct = bar.amountTsh > 0 ? Math.max(12, Math.round(ratio * 100)) : 4;
                return (
                  <div key={bar.label} className="h-full flex flex-col items-center justify-end group">
                    <div className="w-full max-w-[54px] flex-1 flex items-end justify-center">
                      <div
                        title={`${bar.label}: ${formatTsh(bar.amountTsh)}`}
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-lg transition-colors ${
                          bar.amountTsh > 0
                            ? 'bg-[#165432] group-hover:bg-[#114226]'
                            : 'bg-[#E4EDE7]'
                        }`}
                      />
                    </div>
                    <span className="mt-2 -mb-6 text-[11px] font-medium text-[#55635A] whitespace-nowrap">
                      {bar.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#55635A]">
            {quarterlyChart.bars.map((bar) => (
              <span key={bar.label}>
                {bar.label}: <strong className="text-[#17231C]">{formatTsh(bar.amountTsh)}</strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Sunday Roll-Call & Auto-Fine Tracker */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CalendarCheck className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t(
                  'Sunday Roll-Call & Auto-Fine Tracker',
                  'Orodha ya Malipo ya Jumapili na Faini'
                )}
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  `Week ${weekWindow.weekLabel} (Sunday ${weekWindow.sundayDateStr}) · ${sundayRollCall.paidCount}/${members.length} paid >= ${formatTsh(sundayMinTsh)}`,
                  `Wiki ${weekWindow.weekLabel} (Jumapili ${weekWindow.sundayDateStr}) · ${sundayRollCall.paidCount}/${members.length} wamelipa >= ${formatTsh(sundayMinTsh)}`
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={sendingSundayAlert}
              onClick={handleSendSundayReminder}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60 whitespace-nowrap"
            >
              {sendingSundayAlert ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : sundayAlertSent ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <BellRing className="h-3.5 w-3.5" />
              )}
              {sundayAlertSent
                ? t('Sunday Reminder Sent', 'Ukumbusho Umetumwa')
                : t('Send Sunday Reminder', 'Tuma Ukumbusho wa Jumapili')}
            </button>

            <a
              href={buildWhatsAppUrl(sundayWhatsAppMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3.5 py-2 text-xs font-semibold text-[#165432] hover:bg-[#DCEBDF] whitespace-nowrap"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {t('WhatsApp Reminder', 'Tuma WhatsApp')}
            </a>
          </div>
        </div>

        <div className="divide-y divide-[#EFEAE0]">
          {sundayRollCall.rows.map(({ member, paidThisWeekTsh, isPaid }) => {
            const unpaidFine = Number(member.unpaidFineTsh || 0);
            const finedNow = finedMemberIds[member.id];
            return (
              <div
                key={member.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#165432]">
                      {member.memberNumber}
                    </span>
                    <span className="font-semibold text-[#17231C]">{member.fullName}</span>
                    <span className="text-[#C9BFA6]" aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        isPaid ? 'text-[#165432]' : 'text-[#C86D14]'
                      }`}
                    >
                      {isPaid
                        ? t('Paid This Week', 'Amelipa Wiki Hii')
                        : t('Pending Sunday Pay', 'Anasubiriwa Jumapili')}
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-[#55635A]">
                    {t('Paid this week', 'Wiki hii')}: {formatTsh(paidThisWeekTsh)}
                    {unpaidFine > 0 && (
                      <span className="text-red-700 font-semibold ml-2">
                        · {t('Unpaid Fine', 'Deni la Faini')}: {formatTsh(unpaidFine)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!isPaid && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          onRecordPaymentForMember(member.id, 'weekly_contribution')
                        }
                        className="min-h-[38px] rounded-lg border border-[#E5DEC9] bg-white px-3 py-1.5 font-medium text-[#37463D] hover:bg-[#FAF7F0] whitespace-nowrap"
                      >
                        {t('Record Weekly', 'Rekodi Wiki')}
                      </button>
                      <button
                        type="button"
                        disabled={finingMemberId === member.id || finedNow}
                        onClick={() => handleApplyFine(member)}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-lg bg-[#C86D14] px-3 py-1.5 font-semibold text-white hover:bg-[#A6580E] disabled:opacity-60 whitespace-nowrap"
                      >
                        {finingMemberId === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : finedNow ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : null}
                        {finedNow
                          ? t('Fine Applied', 'Faini Imewekwa')
                          : t(`Apply ${formatTsh(sundayFineTsh)} Fine`, `Weka Faini ${formatTsh(sundayFineTsh)}`)}
                      </button>
                    </>
                  )}
                  {isPaid && (
                    <span className="inline-flex items-center gap-1 font-medium text-[#165432]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('Cleared', 'Imekamilika')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending Member Loan Applications */}
      {pendingLoans.length > 0 && (
        <section className="rounded-2xl border border-[#C6DFCF] bg-white overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t('Pending Loan Applications', 'Maombi ya Mikopo Yanayosubiri')} ({pendingLoans.length})
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  'Submitted by members via the Loan Application Form.',
                  'Yaliyowasilishwa na wanachama kupitia fomu ya mkopo.'
                )}
              </p>
            </div>
          </div>
          <div className="divide-y divide-[#EFEAE0]">
            {pendingLoans.map((loan) => (
              <div
                key={loan.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-[#165432]">
                      {loan.memberNumber}
                    </span>
                    <span className="font-semibold text-[#17231C]">
                      {loan.memberName}
                    </span>
                    <span className="text-[#8A948D]">·</span>
                    <span className="font-mono font-semibold text-[#17231C]">
                      {formatTsh(loan.principalTsh)}
                    </span>
                    <span className="text-[#55635A]">
                      ({t('Total w/', 'Jumla na')} {interestPct}%: {formatTsh(loan.totalDueTsh)} · {loan.durationMonths} {t('mo', 'miezi')})
                    </span>
                  </div>
                  <p className="text-[#4B5850]">
                    {t('Purpose', 'Sababu')}: {loan.purpose}
                    {loan.guarantorName ? ` · ${t('Guarantor', 'Mdhamini')}: ${loan.guarantorName}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={processingLoanId === loan.id}
                    onClick={() => handleApproveLoan(loan)}
                    className="min-h-[40px] rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
                  >
                    {t('Approve Loan', 'Idhinisha Mkopo')}
                  </button>
                  <button
                    type="button"
                    disabled={processingLoanId === loan.id}
                    onClick={() => handleDeclineLoan(loan.id)}
                    className="min-h-[40px] rounded-xl border border-[#E5DEC9] bg-white px-3.5 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0] disabled:opacity-60"
                  >
                    {t('Decline', 'Kataa')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members Directory & Admin Action Ledger (Matching Screen 3 Members Card) */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t(
                'Members · Hisa, Loan & Loan Payment',
                'Wanachama · Hisa, Mkopo na Marejesho'
              )}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                'Complete live breakdown by Member Number.',
                'Mchanganuo kamili kwa Namba ya Mwanachama.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8A948D]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search name or TUJ-...', 'Tafuta jina au TUJ-...')}
                className="w-full sm:w-48 min-h-[40px] rounded-xl border border-[#DDD4BE] bg-white pl-8 pr-3 py-1.5 text-xs text-[#17231C] placeholder:text-[#8A948D] focus:border-[#165432] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#EAE2D0] rounded-xl">
              {[
                { id: 'all', label: t('All', 'Wote') },
                { id: 'with_loan', label: t('Has Loan', 'Ana Mkopo') },
                { id: 'no_loan', label: t('No Loan', 'Hana Mkopo') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id as 'all' | 'with_loan' | 'no_loan')}
                  className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    filter === tab.id
                      ? 'bg-white text-[#17231C] shadow-xs'
                      : 'text-[#55635A] hover:text-[#17231C]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Card Stack (< md) matching Screen 3 Members list */}
        <div className="md:hidden divide-y divide-[#EFEAE0]">
          {filteredMembers.map((member) => {
            const hasLoan = member.activeLoanBalanceTsh > 0;
            return (
              <div key={member.id} className="p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                      <Users className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="font-mono text-[11px] font-semibold text-[#55635A]">
                        {member.memberNumber}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-[#17231C]">
                        <span>{member.fullName}</span>
                        {member.uid === adminUid && (
                          <span className="rounded bg-[#F5E6CC] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A4E0B]">
                            Admin
                          </span>
                        )}
                        {hasLoan && (
                          <span className="rounded bg-[#F5E6CC] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A4E0B]">
                            {t('Loan', 'Mkopo')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInspectPii(member)}
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] px-2.5 py-1 text-[11px] font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('Details', 'Taarifa')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#FAF7F0] p-3">
                  <div>
                    <span className="text-[#55635A] block">
                      Hisa ({member.totalShares} {t('sh', 'hisa')})
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                      {formatTsh(member.totalSavedTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">Jamii</span>
                    <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                      {formatTsh(member.socialFundTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">{t('Loan Remaining', 'Deni la Mkopo')}</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        hasLoan ? 'text-[#C86D14]' : 'text-[#165432]'
                      }`}
                    >
                      {hasLoan ? formatTsh(member.activeLoanBalanceTsh) : t('Clear', 'Hana Deni')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">{t('Loan Repaid', 'Mkopo Uliorejeshwa')}</span>
                    <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                      {formatTsh(member.totalLoanRepaidTsh || 0)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onRecordPaymentForMember(
                        member.id,
                        hasLoan ? 'loan_repayment' : 'weekly_contribution'
                      )
                    }
                    className="flex-1 min-h-[40px] rounded-xl border border-[#E5DEC9] bg-white px-3 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                  >
                    {hasLoan ? t('Record Loan Pay', 'Rekodi Mkopo') : t('Pay Weekly', 'Lipa Wiki')}
                  </button>
                  {!hasLoan && (
                    <button
                      type="button"
                      onClick={() => handleOpenLoanModal(member)}
                      className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 rounded-xl bg-[#165432] px-3 py-2 text-xs font-semibold text-white hover:bg-[#114226]"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('Issue Loan', 'Toa Mkopo')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Tablet & Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EFEAE0] bg-[#FAF7F0] text-[11px] font-semibold text-[#55635A]">
                <th className="py-3 px-4">{t('Member No.', 'Namba')}</th>
                <th className="py-3 px-4">{t('Full Name', 'Jina Kamili')}</th>
                <th className="py-3 px-4 text-right">{t('Hisa (Shares)', 'Hisa')}</th>
                <th className="py-3 px-4 text-right">{t('Total Hisa', 'Jumla Hisa')}</th>
                <th className="py-3 px-4 text-right">Jamii</th>
                <th className="py-3 px-4 text-right">{t('Loan Balance', 'Salio Mkopo')}</th>
                <th className="py-3 px-4 text-right">{t('Loan Paid', 'Mkopo Uliolipwa')}</th>
                <th className="py-3 px-4 text-right">{t('Actions', 'Hatua')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0] text-xs">
              {filteredMembers.map((member) => {
                const hasLoan = member.activeLoanBalanceTsh > 0;
                return (
                  <tr key={member.id} className="hover:bg-[#FAF7F0]/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-[#165432] whitespace-nowrap">
                      {member.memberNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-medium text-[#17231C]">
                        <span>{member.fullName}</span>
                        {member.uid === adminUid && (
                          <span className="rounded bg-[#F5E6CC] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A4E0B]">
                            Admin
                          </span>
                        )}
                        {hasLoan && (
                          <span className="rounded bg-[#F5E6CC] px-1.5 py-0.5 text-[10px] font-semibold text-[#9A4E0B]">
                            {t('Loan', 'Mkopo')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#55635A]">
                        {member.preferredNetwork} · {member.maskedPhone}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#17231C]">
                      {member.totalShares}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#17231C] whitespace-nowrap">
                      {formatTsh(member.totalSavedTsh)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#55635A] whitespace-nowrap">
                      {formatTsh(member.socialFundTsh)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {hasLoan ? (
                        <span className="font-mono font-semibold tabular-nums text-[#C86D14]">
                          {formatTsh(member.activeLoanBalanceTsh)}
                        </span>
                      ) : (
                        <span className="font-medium text-[#165432]">{t('Clear', 'Safi')}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#165432] whitespace-nowrap">
                      {formatTsh(member.totalLoanRepaidTsh || 0)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleInspectPii(member)}
                          title="Inspect member application details"
                          className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#37463D] hover:bg-[#FAF7F0] transition-colors"
                        >
                          {t('Info', 'Taarifa')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onRecordPaymentForMember(
                              member.id,
                              hasLoan ? 'loan_repayment' : 'weekly_contribution'
                            )
                          }
                          className="rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#37463D] hover:bg-[#FAF7F0] transition-colors"
                        >
                          {hasLoan ? t('Record Pay', 'Rekodi') : t('Pay Weekly', 'Lipa Wiki')}
                        </button>
                        {!hasLoan && (
                          <button
                            type="button"
                            onClick={() => handleOpenLoanModal(member)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#165432] px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-[#114226] transition-colors"
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                            {t('Loan', 'Mkopo')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#55635A]">
                    {t('No members match your filter.', 'Hakuna mwanachama anayelingana na utafutaji.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Jamii Emergency Fund Payout Log & Record Disbursement */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <HeartHandshake className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t('Jamii Emergency Fund Payout Log', 'Kumbukumbu za Misaada ya Mfuko wa Jamii')}
              </h2>
              <p className="text-xs text-[#55635A] font-mono tabular-nums">
                {t('Collected', 'Ndani')}: {formatTsh(jamiiStats.totalCollected)} ·{' '}
                {t('Paid Out', 'Imetolewa')}: {formatTsh(jamiiStats.totalPaidOut)} ·{' '}
                <strong className="text-[#165432]">
                  {t('Balance', 'Salio')}: {formatTsh(jamiiStats.remaining)}
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!jamiiMemberId && members[0]) setJamiiMemberId(members[0].id);
              setShowJamiiForm(!showJamiiForm);
            }}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {showJamiiForm
              ? t('Close Form', 'Funga Fomu')
              : t('Record Jamii Payout', 'Rekodi Malipo ya Jamii')}
          </button>
        </div>

        {showJamiiForm && (
          <form onSubmit={handleRecordJamiiPayout} className="p-5 bg-[#FAF7F0] border-b border-[#EFEAE0] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="jamii-member" className="block text-xs font-medium text-[#37463D] mb-1">
                  {t('Recipient Member', 'Mwanachama')}
                </label>
                <select
                  id="jamii-member"
                  value={jamiiMemberId || members[0]?.id || ''}
                  onChange={(e) => setJamiiMemberId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.memberNumber} — {m.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="jamii-reason" className="block text-xs font-medium text-[#37463D] mb-1">
                  {t('Emergency Reason', 'Sababu ya Dharura')}
                </label>
                <select
                  id="jamii-reason"
                  value={jamiiReason}
                  onChange={(e) => setJamiiReason(e.target.value as JamiiPayoutReason)}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                >
                  {JAMII_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="jamii-amt" className="block text-xs font-medium text-[#37463D] mb-1">
                  {t('Amount (TSH)', 'Kiasi (TSH)')}
                </label>
                <input
                  id="jamii-amt"
                  type="number"
                  min={1000}
                  step={1000}
                  required
                  value={jamiiAmountTsh}
                  onChange={(e) => setJamiiAmountTsh(Number(e.target.value) || 0)}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="jamii-date" className="block text-xs font-medium text-[#37463D] mb-1">
                  {t('Payout Date', 'Tarehe ya Malipo')}
                </label>
                <input
                  id="jamii-date"
                  type="date"
                  required
                  value={jamiiDate}
                  onChange={(e) => setJamiiDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="jamii-notes" className="block text-xs font-medium text-[#37463D] mb-1">
                {t('Notes / Hospital or Family Details', 'Maelezo ya Msaada')}
              </label>
              <input
                id="jamii-notes"
                type="text"
                required
                value={jamiiNotes}
                onChange={(e) => setJamiiNotes(e.target.value)}
                placeholder="e.g. Solidarity support for hospital bill"
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>

            {jamiiError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {jamiiError}
              </div>
            )}

            <button
              type="submit"
              disabled={jamiiSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
            >
              {jamiiSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('Approve & Record Jamii Payout', 'Idhinisha na Hifadhi Malipo ya Jamii')}
            </button>
          </form>
        )}

        {sortedJamiiPayouts.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#55635A]">
            {t('No Jamii emergency payouts recorded yet.', 'Hakuna malipo ya dharura ya Jamii yaliyorekodiwa bado.')}
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE0]">
            {sortedJamiiPayouts.map((p) => (
              <div
                key={p.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-[#17231C]">
                    <span className="font-mono text-[#165432] mr-1.5">{p.memberNumber}</span>
                    {p.memberName} · <span className="text-[#4B5850]">{p.reason}</span>
                  </div>
                  <div className="text-[#55635A]">
                    {p.payoutDate} · {p.notes}
                  </div>
                </div>
                <div className="font-mono font-bold tabular-nums text-[#C86D14] whitespace-nowrap">
                  -{formatTsh(p.amountTsh)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Payments, Mistake Reversals & Immutable Audit Trail */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-start gap-2.5">
          <History className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t(
                'Payment Adjustments, Mistake Reversals & Audit Trail',
                'Marekebisho ya Malipo, Kubatilisha Makosa & Kumbukumbu'
              )}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                'Correct a mistyped TSH amount or reverse an erroneous submission. Every change is logged permanently in Firestore.',
                'Rekebisha kiasi kilichokosewa au batilisha muamala kimakosa. Kila badiliko linahifadhiwa kama kumbukumbu ya kudumu.'
              )}
            </p>
          </div>
        </div>

        <div className="divide-y divide-[#EFEAE0]">
          {payments.slice(0, 12).map((p) => (
            <div
              key={p.id}
              className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-[#165432]">{p.memberNumber}</span>
                  <span className="font-semibold text-[#17231C]">{p.memberName}</span>
                  <span className="text-[#C9BFA6]" aria-hidden="true">·</span>
                  <span className="font-mono text-[#37463D]">{p.reference}</span>
                  {p.status !== 'confirmed' && (
                    <span
                      className={`font-semibold uppercase ${
                        p.status === 'reversed' ? 'text-red-700' : 'text-[#C86D14]'
                      }`}
                    >
                      {p.status}
                    </span>
                  )}
                </div>
                <div className="text-[#55635A]">
                  {p.provider} · {p.category.replace(/_/g, ' ')} · {formatTimestamp(p.createdAt)}
                  {p.adjustmentReason && (
                    <span className="text-[#4B5850]"> · {t('Reason', 'Sababu')}: {p.adjustmentReason}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-mono font-bold tabular-nums mr-2 ${
                    p.status === 'reversed' ? 'line-through text-[#8A948D]' : 'text-[#17231C]'
                  }`}
                >
                  {formatTsh(p.amountTsh)}
                </span>

                {p.status !== 'reversed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => openAdjustModal(p, 'adjusted')}
                      className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#37463D] hover:bg-[#FAF7F0] whitespace-nowrap"
                    >
                      <Edit3 className="h-3 w-3" aria-hidden="true" />
                      {t('Adjust Amount', 'Rekebisha')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdjustModal(p, 'reversed')}
                      className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-100 whitespace-nowrap"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      {t('Reverse', 'Batilisha')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {sortedAdjustments.length > 0 && (
          <div className="border-t border-[#EFEAE0] bg-[#FAF7F0] p-4 sm:p-5 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#55635A]">
              {t('Adjustment Audit Trail', 'Kumbukumbu ya Marekebisho')} ({sortedAdjustments.length})
            </div>
            <div className="space-y-1.5">
              {sortedAdjustments.slice(0, 8).map((adj) => (
                <div
                  key={adj.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-[#37463D] border-b border-[#E5DEC9] pb-1.5 last:border-b-0 last:pb-0"
                >
                  <div>
                    <span className="font-mono font-semibold text-[#17231C]">{adj.reference}</span>{' '}
                    ({adj.memberNumber}) ·{' '}
                    <span className={adj.action === 'reversed' ? 'text-red-700 font-semibold' : 'text-[#C86D14] font-semibold'}>
                      {adj.action.toUpperCase()}
                    </span>{' '}
                    · {adj.reason}
                  </div>
                  <div className="font-mono tabular-nums text-[#55635A] whitespace-nowrap">
                    {formatTsh(adj.previousAmountTsh)} {'->'} {formatTsh(adj.newAmountTsh)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Who Has a Loan Section */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t('Who Currently Has a Loan', 'Wanaomiliki Mikopo kwa Sasa')}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                `Active borrowers, interest (${interestPct}%), loan payments received, and remaining balances in TSH.`,
                `Wakopaji hai, riba (${interestPct}%), marejesho yaliyopokelewa, na salio lililobaki kwa TSH.`
              )}
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-[#C86D14] font-semibold">
            {activeLoans.length} {activeLoans.length === 1 ? t('active loan', 'mkopo hai') : t('active loans', 'mikopo hai')}
          </span>
        </div>

        {activeLoans.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#55635A]">
            {t('No member currently holds an active loan.', 'Hakuna mwanachama mwenye mkopo hai kwa sasa.')}
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE0]">
            {activeLoans.map((loan) => (
              <div
                key={loan.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-[#165432]">
                      {loan.memberNumber}
                    </span>
                    <span className="font-semibold text-[#17231C]">{loan.memberName}</span>
                    <span className="text-[#C9BFA6]" aria-hidden="true">·</span>
                    <span className="text-[#55635A]">{t('Due', 'Mwisho')} {loan.dueDate}</span>
                  </div>
                  <p className="text-xs text-[#4B5850]">
                    {t('Purpose', 'Sababu')}: {loan.purpose}
                    {loan.guarantorName ? ` · ${t('Guarantor', 'Mdhamini')}: ${loan.guarantorName}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-5 sm:gap-6 text-xs">
                  <div>
                    <span className="block text-[#8A948D]">{t('Principal', 'Mkopo Halisi')}</span>
                    <span className="font-mono tabular-nums text-[#17231C]">
                      {formatTsh(loan.principalTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#8A948D]">{t('Total w/ Interest', 'Jumla na Riba')}</span>
                    <span className="font-mono tabular-nums text-[#17231C]">
                      {formatTsh(loan.totalDueTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#8A948D]">{t('Repaid', 'Imerejeshwa')}</span>
                    <span className="font-mono tabular-nums text-[#165432]">
                      {formatTsh(loan.repaidTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#8A948D]">{t('Remaining', 'Bado')}</span>
                    <span className="font-mono font-bold tabular-nums text-[#C86D14]">
                      {formatTsh(loan.remainingTsh)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRecordPaymentForMember(loan.memberId, 'loan_repayment')}
                    className="min-h-[40px] rounded-xl bg-[#C86D14] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#A6580E] transition-colors whitespace-nowrap"
                  >
                    {t('Record Repayment', 'Rekodi Marejesho')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Phone OTP Readiness, Scheduled Cron & Real SMS Network Tester */}
      <AdminOperationsPanel
        pendingMemberNumbers={sundayRollCall.pendingNumbers}
        nextMeetingTitle={nextMeeting?.title || 'Quarterly VICOBA Share-Out & Review'}
        nextMeetingDate={nextMeeting?.meetingDate || '2026-11-29'}
        sharePriceTsh={group?.sharePriceTsh ?? 10000}
        socialFundTsh={group?.socialFundTsh ?? 2000}
      />

      {/* Payment Adjustment / Reversal Modal */}
      {adjustModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#17231C]/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-modal-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E5DEC9] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EFEAE0] px-5 py-4">
              <div>
                <h3 id="adjust-modal-title" className="font-display text-base font-semibold text-[#17231C]">
                  {adjustModal.action === 'reversed'
                    ? t('Reverse Payment', 'Batilisha Muamala')
                    : t('Adjust Payment Amount', 'Rekebisha Kiasi cha Malipo')}
                </h3>
                <p className="text-xs text-[#55635A] font-mono">
                  {adjustModal.payment.reference} · {adjustModal.payment.memberNumber} ({formatTsh(adjustModal.payment.amountTsh)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModal(null)}
                aria-label="Close adjustment modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#8A948D] hover:bg-[#FAF7F0]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjustment} className="p-5 space-y-4">
              {adjustModal.action === 'adjusted' ? (
                <div>
                  <label htmlFor="adj-amount" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Correct Amount (TSH)', 'Kiasi Sahihi (TSH)')}
                  </label>
                  <input
                    id="adj-amount"
                    type="number"
                    min={1000}
                    step={500}
                    required
                    value={adjustAmountTsh}
                    onChange={(e) => setAdjustAmountTsh(Number(e.target.value) || 0)}
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {t(
                    `This will subtract ${formatTsh(adjustModal.payment.amountTsh)} from ${adjustModal.payment.memberName}'s ledger and mark reference ${adjustModal.payment.reference} as reversed.`,
                    `Hii itapunguza ${formatTsh(adjustModal.payment.amountTsh)} kutoka kwa ${adjustModal.payment.memberName} na kubatilisha kumbukumbu ${adjustModal.payment.reference}.`
                  )}
                </div>
              )}

              <div>
                <label htmlFor="adj-reason" className="block text-xs font-medium text-[#37463D] mb-1.5">
                  {t('Reason (Audit Trail)', 'Sababu ya Marekebisho')}
                </label>
                <input
                  id="adj-reason"
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Member mistyped 120,000 instead of 12,000"
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
                />
              </div>

              {adjustError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {adjustError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustModal(null)}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-4 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                >
                  {t('Cancel', 'Ghairi')}
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className={`min-h-[44px] inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                    adjustModal.action === 'reversed'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-[#165432] hover:bg-[#114226]'
                  }`}
                >
                  {adjustSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {adjustModal.action === 'reversed'
                    ? t('Confirm Reversal', 'Thibitisha Kubatilisha')
                    : t('Save Adjustment', 'Hifadhi Marekebisho')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Private Application Details Modal */}
      {piiMember && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#17231C]/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pii-modal-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E5DEC9] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EFEAE0] px-5 py-4">
              <div>
                <h3 id="pii-modal-title" className="font-display text-base font-semibold text-[#17231C]">
                  {piiMember.fullName} · {piiMember.memberNumber}
                </h3>
                <p className="text-xs text-[#55635A]">
                  {t('Application & Contact Record', 'Taarifa za Usajili na Mawasiliano')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPiiMember(null)}
                aria-label="Close member details"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#8A948D] hover:bg-[#FAF7F0]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 text-xs space-y-3">
              {piiLoading ? (
                <div className="flex items-center gap-2 text-[#55635A] py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Loading application details...', 'Inapakia taarifa...')}
                </div>
              ) : piiData ? (
                <div className="space-y-2.5">
                  <div className="flex justify-between border-b border-[#EFEAE0] pb-2">
                    <span className="text-[#55635A]">{t('Phone Number', 'Namba ya Simu')}</span>
                    <span className="font-mono font-semibold text-[#17231C]">{piiData.phone}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#EFEAE0] pb-2">
                    <span className="text-[#55635A]">{t('Mtaa & House No.', 'Mtaa na Namba ya Nyumba')}</span>
                    <span className="font-semibold text-[#17231C] text-right">{piiData.mtaaHouseNumber}</span>
                  </div>
                  <div className="flex justify-between border-b border-[#EFEAE0] pb-2">
                    <span className="text-[#55635A]">{t('Next of Kin', 'Mtu wa Karibu')}</span>
                    <span className="font-semibold text-[#17231C] text-right">
                      {piiData.nextOfKinName} ({piiData.nextOfKinPhone})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#55635A]">{t('National ID / NIDA', 'Kitambulisho (NIDA)')}</span>
                    <span className="font-mono text-[#17231C]">
                      {piiData.nationalId || t('Not provided (optional)', 'Hakijawekwa (si lazima)')}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[#55635A]">
                  {t('Founding member seed record', 'Rekodi ya mwanzilishi')} ({piiMember.maskedPhone}).
                </p>
              )}

              {/* Lost Phone / Number Change Recovery Form */}
              <form
                onSubmit={handleRelinkMember}
                className="mt-3 pt-3 border-t border-[#EFEAE0] space-y-2.5"
              >
                <div className="font-semibold text-[#17231C]">
                  {t(
                    'Lost Phone / Number Change Recovery',
                    'Urejeshaji wa Simu Iliyopotea / Namba Mpya'
                  )}
                </div>
                <p className="text-[11px] text-[#55635A]">
                  {t(
                    'Update the member’s phone number or paste their new Account ID (UID) if they changed SIM cards so their existing Hisa & loans reconnect automatically.',
                    'Sasisha namba mpya ya simu au weka Account ID (UID) mpya ikiwa amebadilisha laini ili Hisa na mikopo yake irudi papo hapo.'
                  )}
                </p>
                <div>
                  <label htmlFor="relink-phone" className="block text-[11px] font-medium text-[#37463D] mb-1">
                    {t('New Phone Number (optional)', 'Namba Mpya ya Simu (si lazima)')}
                  </label>
                  <input
                    id="relink-phone"
                    type="tel"
                    value={relinkPhone}
                    onChange={(e) => setRelinkPhone(e.target.value)}
                    placeholder="+255 7XX XXX XXX"
                    className="w-full min-h-[38px] rounded-lg border border-[#DDD4BE] px-2.5 py-1.5 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="relink-uid" className="block text-[11px] font-medium text-[#37463D] mb-1">
                    {t('New Account ID / UID (only if changed SIM)', 'Account ID / UID Mpya (kama amebadilisha laini)')}
                  </label>
                  <input
                    id="relink-uid"
                    type="text"
                    value={relinkUid}
                    onChange={(e) => setRelinkUid(e.target.value)}
                    placeholder={`Current: ${piiMember.uid}`}
                    className="w-full min-h-[38px] rounded-lg border border-[#DDD4BE] px-2.5 py-1.5 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
                  />
                </div>
                {relinkFeedback && (
                  <div
                    role="status"
                    className={`rounded-lg px-3 py-2 text-[11px] ${
                      relinkFeedback.ok
                        ? 'bg-[#E8F1EB] text-[#114226] border border-[#C6DFCF]'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {relinkFeedback.text}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={relinkSubmitting}
                  className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-3 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
                >
                  {relinkSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t('Save & Re-link Passbook', 'Hifadhi & Unganisha Kijitabu')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Issue New Loan Modal */}
      {loanModalMember && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#17231C]/45 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-loan-title"
        >
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E5DEC9] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#EFEAE0] px-5 py-4">
              <div>
                <h3 id="issue-loan-title" className="font-display text-base font-semibold text-[#17231C]">
                  {t('Issue Loan to', 'Toa Mkopo kwa')} {loanModalMember.fullName}
                </h3>
                <p className="text-xs text-[#55635A] font-mono">
                  {loanModalMember.memberNumber} · {loanModalMember.totalShares} {t('shares', 'hisa')} ({formatTsh(loanModalMember.totalSavedTsh)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoanModalMember(null)}
                aria-label="Close loan dialog"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#8A948D] hover:bg-[#FAF7F0] hover:text-[#17231C]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIssueLoan} className="p-5 space-y-4">
              <div className="rounded-xl bg-[#FAF7F0] p-3 text-xs flex items-center justify-between">
                <span className="text-[#55635A]">
                  {t(`Max Eligible (${loanMultiplier}x shares)`, `Kikomo (${loanMultiplier}x hisa)`)}
                </span>
                <span className="font-mono font-semibold tabular-nums text-[#165432]">
                  {formatTsh(loanModalMember.totalSavedTsh * loanMultiplier)}
                </span>
              </div>

              <div>
                <label htmlFor="loan-principal" className="block text-xs font-medium text-[#37463D] mb-1.5">
                  {t('Principal Amount (TSH)', 'Kiasi cha Mkopo (TSH)')}
                </label>
                <input
                  id="loan-principal"
                  type="number"
                  min={10000}
                  step={5000}
                  required
                  value={principalTsh}
                  onChange={(e) => setPrincipalTsh(Number(e.target.value) || 0)}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
                />
                <div className="mt-1 text-xs text-[#55635A] font-mono tabular-nums">
                  {t(`Total w/ ${interestPct}% interest`, `Jumla na riba ${interestPct}%`)}:{' '}
                  {formatTsh(principalTsh + Math.round((principalTsh * interestPct) / 100))}
                </div>
              </div>

              <div>
                <label htmlFor="loan-months" className="block text-xs font-medium text-[#37463D] mb-1.5">
                  {t('Repayment Period', 'Muda wa Marejesho')}
                </label>
                <select
                  id="loan-months"
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
                >
                  {[1, 2, 3, 4, 6].map((m) => (
                    <option key={m} value={m}>
                      {m} {m === 1 ? t('Month', 'Mwezi') : t('Months', 'Miezi')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="loan-purpose" className="block text-xs font-medium text-[#37463D] mb-1.5">
                  {t('Loan Purpose', 'Sababu ya Mkopo')}
                </label>
                <input
                  id="loan-purpose"
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Stocking shop inventory"
                  className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
                />
              </div>

              {loanError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{loanError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLoanModalMember(null)}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-4 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                >
                  {t('Cancel', 'Ghairi')}
                </button>
                <button
                  type="submit"
                  disabled={loanSubmitting}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
                >
                  {loanSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t('Approve & Notify Group', 'Idhinisha na Arifu Kikundi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
