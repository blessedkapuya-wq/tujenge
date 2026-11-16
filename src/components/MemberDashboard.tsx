import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  CreditCard,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useLang } from '../lib/i18n';
import { requestMemberLoan } from '../lib/vicobaService';
import {
  GroupMeeting,
  GroupNotification,
  MemberLedger,
  MemberLoan,
  MobilePayment,
  PaymentCategory,
  VicobaGroup,
  buildWhatsAppUrl,
  formatTimestamp,
  formatTsh,
  getCurrentWeekWindow,
  getNextSundayInfo,
  getTimestampMs,
} from '../types/vicoba';

interface MemberDashboardProps {
  group: VicobaGroup | null;
  currentMember: MemberLedger | null;
  userUid?: string | null;
  userContact?: string | null;
  members: MemberLedger[];
  loans: MemberLoan[];
  payments: MobilePayment[];
  meetings: GroupMeeting[];
  notifications: GroupNotification[];
  isAdmin?: boolean;
  onGoToPay: (category?: PaymentCategory) => void;
  onGoToJoin: () => void;
  onGoToAlerts: () => void;
  onGoToMeetings?: () => void;
}

export default function MemberDashboard({
  group,
  currentMember,
  userUid = null,
  userContact = null,
  members,
  loans,
  payments,
  meetings,
  notifications,
  isAdmin = false,
  onGoToPay,
  onGoToJoin,
  onGoToAlerts,
  onGoToMeetings,
}: MemberDashboardProps) {
  const { t } = useLang();
  const [copiedRecoveryId, setCopiedRecoveryId] = useState(false);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [principalTsh, setPrincipalTsh] = useState<number>(30000);
  const [durationMonths, setDurationMonths] = useState<number>(3);
  const [purpose, setPurpose] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [loanSubmitting, setLoanSubmitting] = useState(false);
  const [loanError, setLoanError] = useState<string | null>(null);
  const [loanSubmitted, setLoanSubmitted] = useState(false);

  const sundayInfo = getNextSundayInfo();
  const weekWindow = useMemo(() => getCurrentWeekWindow(), []);
  const sharePrice = group?.sharePriceTsh ?? 10000;
  const socialFundPrice = group?.socialFundTsh ?? 2000;
  const weeklyMinTsh = sharePrice + socialFundPrice;
  const sundayFineTsh = group?.sundayFineTsh ?? 5000;

  const weeklyProgressPct = useMemo(() => {
    if (members.length === 0) return 0;
    const paidIds = new Set<string>();
    const totals: Record<string, number> = {};
    for (const p of payments) {
      if (p.status === 'reversed') continue;
      if (p.category !== 'weekly_contribution' && p.category !== 'shares') continue;
      const ms = getTimestampMs(p.createdAt);
      if (ms !== null && ms >= weekWindow.startMs && ms <= weekWindow.endMs) {
        totals[p.memberId] = (totals[p.memberId] || 0) + Number(p.amountTsh || 0);
        if (totals[p.memberId] >= weeklyMinTsh) {
          paidIds.add(p.memberId);
        }
      }
    }
    if (paidIds.size === 0) return 0;
    return Math.min(100, Math.round((paidIds.size / members.length) * 100));
  }, [members.length, payments, weekWindow.startMs, weekWindow.endMs, weeklyMinTsh]);

  const nextMeeting = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      [...meetings]
        .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
        .find((m) => m.status === 'scheduled' && m.meetingDate >= today) || null
    );
  }, [meetings]);

  if (!currentMember) {
    const recoveryMsg = t(
      `Habari Sarah Kapuya (Tujenge Hub Admin), I changed my phone/number${userContact ? ` (${userContact})` : ''}. Please re-link my existing Member Number to my new Account ID: ${userUid || ''}`,
      `Habari Sarah Kapuya (Msimamizi wa Tujenge Hub), nimebadilisha simu/namba${userContact ? ` (${userContact})` : ''}. Tafadhali unganisha Namba yangu ya Mwanachama na Account ID hii mpya: ${userUid || ''}`
    );

    const handleCopyRecoveryUid = async () => {
      if (!userUid) return;
      try {
        await navigator.clipboard.writeText(userUid);
        setCopiedRecoveryId(true);
        setTimeout(() => setCopiedRecoveryId(false), 2000);
      } catch {
        // Ignore clipboard failure
      }
    };

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-6 sm:p-8 space-y-4">
          <h2 className="font-display text-xl font-bold text-[#17231C]">
            {t(
              'You do not have a Tujenge Hub Member Number yet',
              'Bado huna Namba ya Mwanachama wa Tujenge Hub'
            )}
          </h2>
          <p className="text-sm text-[#55635A] max-w-xl">
            {t(
              'Fill out the joining form with your name, phone number, Mtaa & house number, and next of kin to receive your sequential member number automatically.',
              'Jaza fomu ya kujiunga ukiwa na jina kamili, namba ya simu, mtaa na namba ya nyumba, na mtu wa karibu ili kupata namba yako ya uanachama papo hapo.'
            )}
          </p>
          <button
            type="button"
            onClick={onGoToJoin}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114226] transition-colors"
          >
            {t('Open Joining Form', 'Fungua Fomu ya Kujiunga')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {userUid && (
          <div className="rounded-2xl border border-[#DDD4BE] bg-[#FAF7F0] p-5 sm:p-6 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="font-display text-base font-semibold text-[#17231C]">
                  {t(
                    'Lost your phone or changed your SIM number?',
                    'Umepoteza simu au kubadilisha namba ya simu?'
                  )}
                </h3>
                <p className="mt-1 text-xs text-[#4B5850] leading-relaxed">
                  {t(
                    'All your Hisa, Jamii, and loan records are safely backed up in the group cloud ledger. If you signed in with a new phone number, send this Account ID to Sarah Kapuya (Admin) so she can re-link your existing TUJ-XXX passbook.',
                    'Taarifa zako zote za Hisa, Jamii na mikopo zimehifadhiwa salama mtandaoni. Ukiingia kwa namba mpya, mtumie Sarah Kapuya (Msimamizi) Account ID hii ili akuunganishe tena na kijitabu chako cha TUJ-XXX.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-[#E5DEC9] bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium uppercase tracking-wide text-[#55635A]">
                  {t('New Account ID (UID)', 'Account ID Mpya (UID)')}
                </div>
                <div className="font-mono text-xs font-semibold text-[#17231C] truncate">
                  {userUid}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyRecoveryUid}
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-1.5 text-xs font-semibold text-[#17231C] hover:bg-[#EFE9DB]"
                >
                  {copiedRecoveryId ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                      {t('Copied', 'Imekopiwa')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                      {t('Copy ID', 'Kopi ID')}
                    </>
                  )}
                </button>
                <a
                  href={buildWhatsAppUrl(recoveryMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-[#165432] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#114226]"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('Send to Admin', 'Tuma kwa Msimamizi')}
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const firstName = currentMember.fullName.split(' ')[0] || currentMember.fullName;
  const loanMultiplier = group?.loanMultiplier ?? 3;
  const interestPct = group?.interestRatePct ?? 10;
  const maxLoanEligible = Math.max(
    10000,
    currentMember.totalSavedTsh * loanMultiplier
  );
  const myActiveLoan = loans.find(
    (l) => l.memberId === currentMember.id && l.status === 'active'
  );
  const myPendingLoan = loans.find(
    (l) => l.memberId === currentMember.id && l.status === 'pending'
  );
  const myPayments = payments
    .filter((p) => p.memberId === currentMember.id)
    .slice(0, 6);

  const myPaidThisWeekTsh = payments.reduce((sum, p) => {
    if (p.memberId !== currentMember.id || p.status === 'reversed') return sum;
    if (p.category !== 'weekly_contribution' && p.category !== 'shares') return sum;
    const ms = getTimestampMs(p.createdAt);
    if (ms !== null && ms >= weekWindow.startMs && ms <= weekWindow.endMs) {
      return sum + Number(p.amountTsh || 0);
    }
    return sum;
  }, 0);

  const paymentNotifications = notifications
    .filter((n) => n.eventType === 'payment_received')
    .slice(0, 4);

  // SVG progress circle math
  const ringRadius = 26;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc - (weeklyProgressPct / 100) * ringCirc;

  const handleLoanRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoanError(null);
    setLoanSubmitted(false);

    if (principalTsh < 10000) {
      setLoanError(t('Minimum loan request is 10,000 TSH.', 'Kiwango cha chini cha mkopo ni 10,000 TSH.'));
      return;
    }
    if (!purpose.trim() || purpose.trim().length < 2) {
      setLoanError(t('Please enter the purpose of this loan.', 'Tafadhali weka sababu ya mkopo.'));
      return;
    }

    setLoanSubmitting(true);
    try {
      await requestMemberLoan({
        member: currentMember,
        principalTsh,
        durationMonths,
        purpose: purpose.trim(),
        guarantorName: guarantorName.trim(),
      });
      setPurpose('');
      setGuarantorName('');
      setLoanSubmitted(true);
      setShowLoanForm(false);
    } catch (err) {
      setLoanError(
        err instanceof Error ? err.message : 'Could not submit loan request.'
      );
    } finally {
      setLoanSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sample Screen 1 Header: Karibu, {FirstName} + Member No. + Role */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#17231C]">
            Karibu, {firstName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-[#E4EDE7] px-2.5 py-1 font-mono font-semibold text-[#165432]">
              {t('Member No.', 'Namba ya Mwanachama')} {currentMember.memberNumber}
            </span>
            {(isAdmin || currentMember.role === 'founder') && (
              <span className="rounded-lg bg-[#F5E6CC] px-2.5 py-1 font-semibold text-[#9A4E0B]">
                {isAdmin ? t('Admin', 'Msimamizi') : t('Founder', 'Mwanzilishi')}
              </span>
            )}
            <span className="text-[#55635A] font-mono">
              · {currentMember.preferredNetwork} · {currentMember.maskedPhone}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {!myActiveLoan && !myPendingLoan && (
            <button
              type="button"
              onClick={() => {
                setPrincipalTsh(Math.min(100000, maxLoanEligible));
                setShowLoanForm(!showLoanForm);
              }}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DDD4BE] bg-white px-4 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] transition-colors whitespace-nowrap"
            >
              {showLoanForm ? t('Close Loan Form', 'Funga Fomu') : t('Apply for Loan', 'Omba Mkopo')}
            </button>
          )}
        </div>
      </div>

      {/* Sample Screen 1 Top 2 Cards: Hisa & Jamii */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
              <Coins className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-mono text-[11px] font-semibold text-[#165432]">
              {currentMember.totalShares} {t('shares', 'hisa')}
            </span>
          </div>
          <div className="mt-3 text-xs text-[#55635A]">Hisa</div>
          <div className="mt-0.5 font-mono text-lg sm:text-2xl font-bold tabular-nums text-[#17231C]">
            TSh {Math.round(currentMember.totalSavedTsh).toLocaleString('en-US')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-mono text-[11px] text-[#55635A]">
              {formatTsh(socialFundPrice)} / {t('wk', 'wiki')}
            </span>
          </div>
          <div className="mt-3 text-xs text-[#55635A]">Jamii</div>
          <div className="mt-0.5 font-mono text-lg sm:text-2xl font-bold tabular-nums text-[#17231C]">
            TSh {Math.round(currentMember.socialFundTsh).toLocaleString('en-US')}
          </div>
        </div>
      </div>

      {/* Unpaid Fine Banner (if applicable) */}
      {(currentMember.unpaidFineTsh || 0) > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-[#FEF3DC] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="font-semibold text-[#8A4407]">
              {t('Unpaid Sunday Fine Balance', 'Faini ya Jumapili Inayodaiwa')}:{' '}
              <span className="font-mono font-bold">
                {formatTsh(currentMember.unpaidFineTsh || 0)}
              </span>
            </div>
            <p className="text-[#7A4A18] mt-0.5">
              {t(
                'Clear your Sunday missed-payment fine via mobile money to stay in good standing.',
                'Lipa faini ya kuchelewa malipo ya Jumapili kwa simu.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onGoToPay('fine')}
            className="min-h-[40px] rounded-xl bg-[#C86D14] px-4 py-2 text-xs font-semibold text-white hover:bg-[#A6580E] whitespace-nowrap self-start sm:self-auto"
          >
            {t('Pay Fine Now', 'Lipa Faini Sasa')}
          </button>
        </div>
      )}

      {/* Sample Screen 1 Hero Card: Due this Sunday + Circular Progress Ring + Pay CTA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-7 rounded-2xl border border-[#E5DEC9] bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-[#55635A]">
                {myPaidThisWeekTsh >= weeklyMinTsh
                  ? t('Paid this week (Sunday settled)', 'Umeshalipa wiki hii')
                  : sundayInfo.isTodaySunday
                    ? t('Due today (Sunday)', 'Malipo ni leo Jumapili')
                    : t('Due this Sunday', 'Inatakiwa Jumapili hii')}
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tabular-nums text-[#17231C]">
                TSh {weeklyMinTsh.toLocaleString('en-US')}
              </div>
              <div className="mt-1 text-xs text-[#55635A]">
                {t(
                  `Late fine TSh ${sundayFineTsh.toLocaleString('en-US')} · Can pay above minimum`,
                  `Faini ya kuchelewa TSh ${sundayFineTsh.toLocaleString('en-US')} · Unaweza kulipa zaidi`
                )}
              </div>
            </div>

            {/* Circular Progress Ring (Group weekly completion %) */}
            <div className="relative h-16 w-16 shrink-0 flex items-center justify-center" title={t('Group Sunday progress', 'Maendeleo ya Jumapili')}>
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                <circle
                  cx="32"
                  cy="32"
                  r={ringRadius}
                  fill="none"
                  stroke="#E8E3D5"
                  strokeWidth="6"
                />
                <circle
                  cx="32"
                  cy="32"
                  r={ringRadius}
                  fill="none"
                  stroke="#165432"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold tabular-nums text-[#17231C]">
                {weeklyProgressPct}%
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onGoToPay('weekly_contribution')}
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#114226] transition-colors"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {myPaidThisWeekTsh >= weeklyMinTsh
              ? t('Add Extra Hisa Share', 'Ongeza Hisa Zaidi')
              : t('Pay', 'Lipa Sasa')}
          </button>
        </div>

        {/* Next Meeting Warm Callout + Max Loan Limit */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <button
            type="button"
            onClick={onGoToMeetings}
            className="w-full text-left rounded-2xl border border-[#ECD6AE] bg-[#FBF0DA] p-4 flex items-center justify-between gap-3 hover:bg-[#F7E7C8] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[#C86D14]">
                <Calendar className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-xs font-bold text-[#17231C]">
                  {nextMeeting
                    ? `${t('Next meeting', 'Mkutano ujao')}: ${nextMeeting.meetingDate}`
                    : t('Quarterly meetings every 3 months', 'Mikutano kila baada ya miezi 3')}
                </div>
                <div className="text-[11px] text-[#7A5423] mt-0.5">
                  {nextMeeting
                    ? `${nextMeeting.quarterLabel} · ${t('Reminder 3 days before', 'Ukumbusho siku 3 kabla')}`
                    : t('View group calendar & reports', 'Tazama kalenda na ripoti')}
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-[#9A4E0B] shrink-0" aria-hidden="true" />
          </button>

          <div className="flex-1 rounded-2xl border border-[#E5DEC9] bg-white p-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[#55635A]">
                {t(`Loan Limit (${loanMultiplier}x Hisa)`, `Kikomo cha Mkopo (${loanMultiplier}x)`)}
              </div>
              <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[#17231C]">
                {formatTsh(currentMember.totalSavedTsh * loanMultiplier)}
              </div>
            </div>
            <div className="text-right font-mono text-xs tabular-nums">
              <div className="text-[#55635A]">{t('Active Loan', 'Deni la Mkopo')}</div>
              <div className={currentMember.activeLoanBalanceTsh > 0 ? 'font-bold text-[#C86D14]' : 'font-semibold text-[#165432]'}>
                {currentMember.activeLoanBalanceTsh > 0
                  ? formatTsh(currentMember.activeLoanBalanceTsh)
                  : t('Clear', 'Safi')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {loanSubmitted && (
        <div className="rounded-2xl border border-[#C6DFCF] bg-[#E8F1EB] p-4 flex items-center gap-2.5 text-xs text-[#114226]">
          <CheckCircle2 className="h-4 w-4 text-[#165432] shrink-0" aria-hidden="true" />
          <span>
            {t(
              'Your loan application has been submitted to Admin for review and the group has been notified.',
              'Maombi yako ya mkopo yametumwa kwa Msimamizi na kikundi kimearifiwa.'
            )}
          </span>
        </div>
      )}

      {/* Member Loan Application Form */}
      {showLoanForm && !myActiveLoan && !myPendingLoan && (
        <form
          onSubmit={handleLoanRequest}
          className="rounded-2xl border border-[#C6DFCF] bg-white p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEAE0] pb-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t('Member Loan Application Form', 'Fomu ya Maombi ya Mkopo')}
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  `Eligible up to ${loanMultiplier}x your Hisa (${formatTsh(currentMember.totalSavedTsh * loanMultiplier)}) at ${interestPct}% interest.`,
                  `Unaruhusiwa hadi ${loanMultiplier}x ya Hisa zako (${formatTsh(currentMember.totalSavedTsh * loanMultiplier)}) kwa riba ya ${interestPct}%.`
                )}
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#165432]">
              {currentMember.memberNumber}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="req-principal" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Requested Amount (TSH)', 'Kiasi Unachoomba (TSH)')}
              </label>
              <input
                id="req-principal"
                type="number"
                min={10000}
                step={5000}
                required
                value={principalTsh}
                onChange={(e) => setPrincipalTsh(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="req-months" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Repayment Period', 'Muda wa Marejesho')}
              </label>
              <select
                id="req-months"
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
              <label htmlFor="req-guarantor" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Guarantor Member (Optional)', 'Mdhamini (Si Lazima)')}
              </label>
              <select
                id="req-guarantor"
                value={guarantorName}
                onChange={(e) => setGuarantorName(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              >
                <option value="">{t('Select fellow member...', 'Chagua mwanachama...')}</option>
                {members
                  .filter((m) => m.id !== currentMember.id)
                  .map((m) => (
                    <option key={m.id} value={`${m.fullName} (${m.memberNumber})`}>
                      {m.memberNumber} — {m.fullName}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="req-purpose" className="block text-xs font-medium text-[#37463D] mb-1.5">
              {t('Loan Purpose *', 'Sababu ya Mkopo *')}
            </label>
            <input
              id="req-purpose"
              type="text"
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Expanding retail stock or school fees"
              className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
            />
          </div>

          <div className="rounded-xl bg-[#FAF7F0] p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
            <span className="text-[#55635A]">
              {t(`Total Due w/ ${interestPct}% Interest:`, `Jumla na Riba ${interestPct}%:`)}
            </span>
            <span className="font-bold text-[#17231C]">
              {formatTsh(principalTsh + Math.round((principalTsh * interestPct) / 100))}
            </span>
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

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowLoanForm(false)}
              className="min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-4 py-2 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
            >
              {t('Cancel', 'Ghairi')}
            </button>
            <button
              type="submit"
              disabled={loanSubmitting}
              className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-5 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
            >
              {loanSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Submit Loan Application', 'Tuma Maombi ya Mkopo')}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sample Screen 1 Bottom List: Recent group payments + My Receipts */}
        <div className="lg:col-span-6 space-y-5">
          <div className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEAE0]">
              <h2 className="font-display text-sm font-bold text-[#17231C]">
                {t('Recent group payments', 'Malipo ya hivi karibuni ya kikundi')}
              </h2>
              <button
                type="button"
                onClick={onGoToAlerts}
                className="text-xs font-semibold text-[#165432] hover:underline"
              >
                {t('See all', 'Ona yote')}
              </button>
            </div>
            <div className="divide-y divide-[#EFEAE0]">
              {paymentNotifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={onGoToAlerts}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#165432] text-white">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#17231C] truncate">
                        {n.message}
                      </div>
                      <div className="text-[11px] font-mono text-[#55635A] mt-0.5">
                        {formatTimestamp(n.createdAt)}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
                </button>
              ))}
              {paymentNotifications.length === 0 && (
                <div className="p-6 text-center text-xs text-[#55635A]">
                  {t(
                    'Group payment alerts appear here whenever any member pays.',
                    'Taarifa za malipo ya wanachama zitaonekana hapa.'
                  )}
                </div>
              )}
            </div>
          </div>

          {myPendingLoan && (
            <div className="rounded-2xl border border-[#E5DEC9] bg-white p-5 space-y-2">
              <div className="text-xs font-semibold text-[#165432]">
                {t('Pending Loan Application · Awaiting Admin Approval', 'Ombi la Mkopo Linasubiri Idhini')}
              </div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-[#17231C]">
                  {myPendingLoan.purpose}
                </h2>
                <span className="font-mono text-sm font-bold tabular-nums text-[#17231C]">
                  {formatTsh(myPendingLoan.principalTsh)}
                </span>
              </div>
              <p className="text-xs text-[#55635A]">
                {t('Total repayable w/ interest', 'Jumla na riba')}: {formatTsh(myPendingLoan.totalDueTsh)} ({myPendingLoan.durationMonths} {t('mo', 'miezi')}).
              </p>
            </div>
          )}

          {myActiveLoan && (
            <div className="rounded-2xl border border-amber-300 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[#C86D14]">
                    {t('Active Loan Progress', 'Maendeleo ya Mkopo')}
                  </div>
                  <h2 className="font-display text-base font-bold text-[#17231C]">
                    {myActiveLoan.purpose}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onGoToPay('loan_repayment')}
                  className="min-h-[40px] rounded-xl bg-[#C86D14] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#A6580E] transition-colors whitespace-nowrap"
                >
                  {t('Repay Loan', 'Rejesha Mkopo')}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
                <div>
                  <span className="text-[#55635A] block">{t('Total Due', 'Jumla')}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                    {formatTsh(myActiveLoan.totalDueTsh)}
                  </span>
                </div>
                <div>
                  <span className="text-[#55635A] block">{t('Repaid', 'Imelipwa')}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#165432]">
                    {formatTsh(myActiveLoan.repaidTsh)}
                  </span>
                </div>
                <div>
                  <span className="text-[#55635A] block">{t('Due Date', 'Tarehe')}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                    {myActiveLoan.dueDate}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: My Personal Receipts + Alerts */}
        <div className="lg:col-span-6 space-y-5">
          <div className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEAE0]">
              <h2 className="font-display text-sm font-bold text-[#17231C]">
                {t('My Past Payments', 'Risiti Zangu za Malipo')}
              </h2>
              <span className="font-mono text-xs tabular-nums text-[#55635A]">
                {myPayments.length} {t('receipts', 'risiti')}
              </span>
            </div>

            {myPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#55635A]">
                {t(
                  'No payments recorded yet. Tap “Pay” above to submit your first weekly contribution.',
                  'Bado hujarekodi malipo. Bonyeza “Lipa Sasa” hapo juu.'
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#EFEAE0]">
                {myPayments.map((pay) => (
                  <div
                    key={pay.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E8F1EB] text-[#165432]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-[#17231C] truncate">
                          {pay.category === 'weekly_contribution'
                            ? `${t('Weekly Share', 'Mchango wa Wiki')} (+${pay.sharesCount} Hisa + Jamii)`
                            : pay.category === 'shares'
                              ? `${pay.sharesCount} Hisa`
                              : pay.category === 'social_fund'
                                ? 'Jamii'
                                : pay.category === 'fine'
                                  ? t('Sunday Fine', 'Faini ya Jumapili')
                                  : t('Loan Repayment', 'Marejesho ya Mkopo')}
                        </div>
                        <div className="text-[#55635A] mt-0.5 font-mono text-[11px]">
                          {pay.provider} · {pay.reference} · {formatTimestamp(pay.createdAt)}
                          {pay.status !== 'confirmed' ? ` · ${pay.status.toUpperCase()}` : ''}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`font-mono text-sm font-bold tabular-nums whitespace-nowrap ${
                        pay.status === 'reversed' ? 'text-slate-400 line-through' : 'text-[#165432]'
                      }`}
                    >
                      TSh {Math.round(pay.amountTsh).toLocaleString('en-US')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EFEAE0]">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-[#165432]" aria-hidden="true" />
                <h2 className="font-display text-sm font-bold text-[#17231C]">
                  {t('Group Alerts', 'Taarifa za Kikundi')}
                </h2>
              </div>
              <button
                type="button"
                onClick={onGoToAlerts}
                className="text-xs font-semibold text-[#165432] hover:underline"
              >
                {t('See all', 'Ona zote')}
              </button>
            </div>
            <div className="divide-y divide-[#EFEAE0]">
              {notifications.slice(0, 3).map((n) => (
                <div key={n.id} className="px-5 py-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[#55635A]">
                    <span className="font-semibold text-[#17231C]">{n.title}</span>
                    <span className="font-mono tabular-nums">{formatTimestamp(n.createdAt)}</span>
                  </div>
                  <p className="text-[#4B5850] leading-relaxed">{n.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Group Members List — Visible to Everyone (Read-Only) */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-bold text-[#17231C]">
              {t('All Group Members', 'Orodha ya Wanachama Wote')}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t('Shared member directory visible to every member.', 'Orodha ya wanachama wote wa kikundi.')}
            </p>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-[#165432]">
            {members.length} {t('members', 'wanachama')}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:gap-px bg-[#EFEAE0]">
          {members.map((m) => (
            <div key={m.id} className="bg-white p-4 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="font-semibold text-[#17231C]">
                    <span className="font-mono text-[#165432] mr-1.5">{m.memberNumber}</span>
                    {m.fullName}
                  </div>
                  <div className="text-[11px] text-[#55635A]">
                    {m.preferredNetwork} · {m.maskedPhone}
                  </div>
                </div>
              </div>
              <div className="text-right font-mono tabular-nums shrink-0">
                <div className="font-bold text-[#17231C]">
                  TSh {Math.round(m.totalSavedTsh).toLocaleString('en-US')}
                </div>
                <div className="text-[11px] text-[#55635A]">{m.totalShares} sh</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
