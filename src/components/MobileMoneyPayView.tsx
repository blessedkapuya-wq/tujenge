import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Coins,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Users,
} from 'lucide-react';
import { useLang } from '../lib/i18n';
import { SAMPLE_PAYMENT_SMS, parseMobileMoneySms } from '../lib/smsParser';
import { WeeklySplitMode, payWithMobileMoney } from '../lib/vicobaService';
import {
  MOBILE_NETWORKS,
  MemberLedger,
  MobileNetwork,
  MobilePayment,
  PaymentCategory,
  VicobaGroup,
  buildWhatsAppUrl,
  formatTimestamp,
  formatTsh,
} from '../types/vicoba';

interface MobileMoneyPayViewProps {
  actorUid: string;
  isAdmin: boolean;
  group: VicobaGroup | null;
  members: MemberLedger[];
  currentMember: MemberLedger | null;
  payments: MobilePayment[];
  preselectedMemberId?: string | null;
  preselectedCategory?: PaymentCategory | null;
  onDoneNavigateToAlerts: () => void;
  onDoneNavigateToPassbook: () => void;
}

function generateFallbackRef(provider: MobileNetwork): string {
  const prefix =
    provider === 'M-Pesa'
      ? 'MP'
      : provider === 'Mixx by Yas'
        ? 'TY'
        : provider === 'Airtel Money'
          ? 'AM'
          : 'HP';
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}26${code}`;
}

export default function MobileMoneyPayView({
  actorUid,
  isAdmin,
  group,
  members,
  currentMember,
  payments,
  preselectedMemberId,
  preselectedCategory,
  onDoneNavigateToAlerts,
  onDoneNavigateToPassbook,
}: MobileMoneyPayViewProps) {
  const { t } = useLang();
  const sharePrice = group?.sharePriceTsh ?? 10000;
  const socialFundPrice = group?.socialFundTsh ?? 2000;
  const sundayFineTsh = group?.sundayFineTsh ?? 5000;
  const weeklyBundlePrice = sharePrice + socialFundPrice;

  const selectableMembers = isAdmin
    ? members
    : currentMember
      ? [currentMember]
      : [];

  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    preselectedMemberId || currentMember?.id || members[0]?.id || ''
  );

  useEffect(() => {
    if (preselectedMemberId) {
      setSelectedMemberId(preselectedMemberId);
    } else if (!selectedMemberId && (currentMember?.id || members[0]?.id)) {
      setSelectedMemberId(currentMember?.id || members[0]?.id || '');
    }
  }, [preselectedMemberId, currentMember?.id, members, selectedMemberId]);

  const targetMember =
    selectableMembers.find((m) => m.id === selectedMemberId) ||
    currentMember ||
    null;

  const [smsText, setSmsText] = useState('');
  const [category, setCategory] = useState<PaymentCategory>(
    preselectedCategory || 'weekly_contribution'
  );
  const [amountTsh, setAmountTsh] = useState<number>(weeklyBundlePrice);
  const [weeklySplitMode, setWeeklySplitMode] = useState<WeeklySplitMode>('extra_to_hisa');
  const [provider, setProvider] = useState<MobileNetwork>(
    targetMember?.preferredNetwork || 'M-Pesa'
  );
  const [reference, setReference] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    reference: string;
    broadcastMessage: string;
    recipientCount: number;
    amountTsh: number;
    provider: MobileNetwork;
    previousShares: number;
    newShares: number;
    newSavedTsh: number;
    previousSocialFundTsh: number;
    newSocialFundTsh: number;
    hisaAddedTsh: number;
    jamiiAddedTsh: number;
    category: PaymentCategory;
  } | null>(null);

  useEffect(() => {
    if (preselectedCategory) {
      setCategory(preselectedCategory);
      if (preselectedCategory === 'weekly_contribution') {
        setAmountTsh(weeklyBundlePrice);
      } else if (preselectedCategory === 'social_fund') {
        setAmountTsh(socialFundPrice);
      } else if (preselectedCategory === 'shares') {
        setAmountTsh(sharePrice);
      } else if (preselectedCategory === 'fine') {
        setAmountTsh(sundayFineTsh);
      }
    }
  }, [preselectedCategory, socialFundPrice, sharePrice, weeklyBundlePrice, sundayFineTsh]);

  useEffect(() => {
    if (targetMember && !smsText) {
      setProvider(targetMember.preferredNetwork);
      if (category === 'loan_repayment' && targetMember.activeLoanBalanceTsh > 0) {
        setAmountTsh(Math.min(50000, targetMember.activeLoanBalanceTsh));
      }
    }
  }, [targetMember, category, smsText]);

  const handleSmsChange = (nextText: string) => {
    setSmsText(nextText);
    const parsed = parseMobileMoneySms(nextText, sharePrice, socialFundPrice);
    if (parsed.amountTsh) {
      setAmountTsh(parsed.amountTsh);
      if (
        parsed.amountTsh >= weeklyBundlePrice * 2 &&
        parsed.amountTsh % weeklyBundlePrice === 0
      ) {
        setWeeklySplitMode('multi_week');
      } else {
        setWeeklySplitMode('extra_to_hisa');
      }
    }
    if (parsed.provider) {
      setProvider(parsed.provider);
    }
    if (parsed.reference) {
      setReference(parsed.reference);
    }
  };

  const activeNetworkInfo =
    MOBILE_NETWORKS.find((n) => n.id === provider) || MOBILE_NETWORKS[0];

  const isAboveWeeklyMin =
    category === 'weekly_contribution' && amountTsh > weeklyBundlePrice;

  const weeklyWeeksToCredit =
    category === 'weekly_contribution' && weeklyBundlePrice > 0
      ? weeklySplitMode === 'multi_week'
        ? Math.max(1, Math.floor(amountTsh / weeklyBundlePrice))
        : 1
      : 0;
  const weeklyJamiiPreviewTsh =
    category === 'weekly_contribution'
      ? weeklySplitMode === 'multi_week'
        ? weeklyWeeksToCredit * socialFundPrice
        : Math.min(socialFundPrice, amountTsh)
      : 0;
  const weeklyHisaPreviewTsh =
    category === 'weekly_contribution'
      ? Math.max(0, amountTsh - weeklyJamiiPreviewTsh)
      : 0;

  const sharesToCredit =
    category === 'weekly_contribution'
      ? sharePrice > 0
        ? Math.floor(weeklyHisaPreviewTsh / sharePrice)
        : 0
      : category === 'shares'
        ? Math.max(1, Math.floor(amountTsh / sharePrice))
        : 0;

  const handlePaidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMember) {
      setError('Select or register a member first.');
      return;
    }
    if (!smsText.trim()) {
      setError('Please paste your mobile money confirmation SMS message in the box above.');
      return;
    }
    if (amountTsh < 1000) {
      setError(`Minimum payment amount is ${formatTsh(1000)}.`);
      return;
    }
    if (category === 'weekly_contribution' && amountTsh < weeklyBundlePrice) {
      setError(
        `Weekly contribution minimum is ${formatTsh(weeklyBundlePrice)} (${formatTsh(sharePrice)} Hisa + ${formatTsh(socialFundPrice)} Jamii).`
      );
      return;
    }
    if (category === 'shares' && amountTsh < sharePrice) {
      setError(`Minimum payment for 1 Hisa share is ${formatTsh(sharePrice)}.`);
      return;
    }
    if (category === 'loan_repayment' && targetMember.activeLoanBalanceTsh <= 0) {
      setError(`${targetMember.fullName} does not have an active loan to repay.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const finalRef = reference.trim() || generateFallbackRef(provider);

    try {
      const res = await payWithMobileMoney({
        actorUid,
        member: targetMember,
        category,
        sharesCount: sharesToCredit,
        amountTsh,
        provider,
        phone: targetMember.maskedPhone,
        reference: finalRef,
        weeklySplitMode,
      });

      setReceipt({
        ...res,
        amountTsh,
        provider,
        category,
      });
      setSmsText('');
      setReference('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not process payment message. Please check the reference and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!targetMember) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Join Tujenge Hub first to record a payment
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Complete the joining form to receive your automatic member number, then paste your mobile money payment message here.
        </p>
      </div>
    );
  }

  const pastMemberPayments = payments
    .filter((p) => p.memberId === targetMember.id)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5DEC9] pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#17231C]">
          {t('Record Payment', 'Rekodi Malipo')}
        </h1>
        <p className="mt-1 text-sm text-[#55635A] max-w-2xl">
          {t(
            'Weekly payment is due every Sunday (minimum 12,000 TSH: 10,000 Hisa + 2,000 Jamii; above 12k boosts your Hisa; missed Sunday fine 5,000 TSH). Your Hisa and Jamii update immediately and every member gets notified.',
            'Malipo ya wiki hufanyika kila Jumapili (angalau 12,000 TSH: Hisa 10,000 + Jamii 2,000; kiasi zaidi kinaongeza Hisa zako; faini ya kuchelewa 5,000 TSH). Hisa na Jamii zako huongezeka papo hapo na kikundi chote hupata taarifa.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handlePaidSubmit}
          className="lg:col-span-7 space-y-5"
        >
          {/* Sample Screen 2 Weekly Share Breakdown Card */}
          <div className="rounded-2xl border border-[#E5DEC9] bg-white p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="font-display text-base font-bold text-[#17231C]">
                {t('Weekly share', 'Mchango wa wiki')} TSh {weeklyBundlePrice.toLocaleString('en-US')}
              </div>
              <span className="text-[11px] font-mono text-[#165432] font-semibold">
                {t('Minimum', 'Kima cha Chini')}
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-[#EFEAE0] pt-1">
              <div className="flex items-center gap-3 pr-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                  <Coins className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[11px] text-[#55635A]">Hisa</div>
                  <div className="font-mono text-base font-bold tabular-nums text-[#17231C]">
                    {sharePrice.toLocaleString('en-US')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-4">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <div className="text-[11px] text-[#55635A]">Jamii</div>
                  <div className="font-mono text-base font-bold tabular-nums text-[#17231C]">
                    {socialFundPrice.toLocaleString('en-US')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-5 shadow-xs">
          {isAdmin && selectableMembers.length > 1 && (
            <div>
              <label htmlFor="pay-member" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Member Paying', 'Mwanachama Anayelipa')}
              </label>
              <select
                id="pay-member"
                value={targetMember.id}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
              >
                {selectableMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.memberNumber} — {m.fullName} ({m.totalShares} shares · {formatTsh(m.totalSavedTsh)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Group Till Reference Strip */}
          <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-[#55635A]">{t('Send to', 'Tuma kwa')} {activeNetworkInfo.label}: </span>
              <span className="font-mono font-bold text-[#17231C]">{activeNetworkInfo.tillNumber}</span>
              <span className="text-[#8A948D] mx-1.5" aria-hidden="true">·</span>
              <span className="font-mono text-[#55635A]">{activeNetworkInfo.ussd}</span>
            </div>
            <span className="text-[#165432] font-mono font-semibold">
              {t('Sunday Min', 'Jumapili Min')} = {formatTsh(weeklyBundlePrice)}
            </span>
          </div>

          {/* Step 1: Paste Payment Message Box */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="sms-paste-box" className="text-xs font-semibold text-[#17231C]">
                {t('Paste your mobile money message', 'Bandika ujumbe wako wa malipo ya simu')}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {SAMPLE_PAYMENT_SMS.map((sample) => (
                  <button
                    key={sample.label}
                    type="button"
                    onClick={() => handleSmsChange(sample.text)}
                    className="min-h-[36px] rounded-lg border border-[#E5DEC9] bg-[#FAF7F0] px-2.5 py-1 text-[11px] font-medium text-[#37463D] hover:border-[#165432] hover:bg-[#E8F1EB] hover:text-[#165432] transition-colors"
                  >
                    {t('Try', 'Jaribu')} {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="sms-paste-box"
              rows={4}
              required
              value={smsText}
              onChange={(e) => handleSmsChange(e.target.value)}
              placeholder="Confirmed. TSh 12,000 sent to Tujenge Hub..."
              className="w-full rounded-xl border border-[#DDD4BE] bg-white px-3.5 py-2.5 text-sm text-[#17231C] placeholder:text-[#8A948D] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
            />
          </div>

          {/* Payment Purpose */}
          <div>
            <span className="block text-xs font-medium text-[#37463D] mb-1.5">
              {t('What is this payment for?', 'Malipo haya ni ya nini?')}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1 bg-[#EAE2D0] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setCategory('weekly_contribution');
                  if (!smsText) setAmountTsh(weeklyBundlePrice);
                }}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === 'weekly_contribution'
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                {t('Weekly (12k+)', 'Wiki (12k+)')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory('shares');
                  if (!smsText) setAmountTsh(sharePrice);
                }}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === 'shares'
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                Hisa (10k)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory('social_fund');
                  if (!smsText) setAmountTsh(socialFundPrice);
                }}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === 'social_fund'
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                Jamii (2k)
              </button>
              <button
                type="button"
                onClick={() => setCategory('loan_repayment')}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === 'loan_repayment'
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                {t('Loan Repay', 'Mkopo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategory('fine');
                  if (!smsText) setAmountTsh(sundayFineTsh);
                }}
                className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap col-span-2 sm:col-span-1 ${
                  category === 'fine'
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                {t('Fine (5k)', 'Faini (5k)')}
              </button>
            </div>
          </div>

          {/* Auto-detected & editable summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div>
              <label htmlFor="parsed-amount" className="block text-xs font-medium text-[#37463D] mb-1">
                {t('Detected Amount (TSH)', 'Kiasi (TSH)')}
              </label>
              <input
                id="parsed-amount"
                type="number"
                min={1000}
                step={1000}
                required
                value={amountTsh}
                onChange={(e) => setAmountTsh(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="parsed-provider" className="block text-xs font-medium text-[#37463D] mb-1">
                {t('Network', 'Mtandao')}
              </label>
              <select
                id="parsed-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as MobileNetwork)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              >
                {MOBILE_NETWORKS.map((net) => (
                  <option key={net.id} value={net.id}>
                    {net.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="parsed-ref" className="block text-xs font-medium text-[#37463D] mb-1">
                {t('SMS Reference', 'Kumbukumbu SMS')}
              </label>
              <input
                id="parsed-ref"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                placeholder="Auto-detected"
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm uppercase text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>
          </div>

          {category === 'weekly_contribution' && (
            <div className="rounded-xl bg-[#E8F1EB] border border-[#C6DFCF] px-4 py-3 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#114226] font-medium">
                  {t('Weekly Split for', 'Mgawanyo wa')} {targetMember.memberNumber} (
                  {weeklySplitMode === 'multi_week'
                    ? `${weeklyWeeksToCredit} ${weeklyWeeksToCredit === 1 ? 'week' : 'weeks'}`
                    : t('This week + extra Hisa', 'Wiki hii + ziada Hisa')}
                  )
                </span>
                <span className="font-mono font-bold tabular-nums text-[#165432]">
                  +{sharesToCredit} {sharesToCredit === 1 ? 'Share' : 'Shares'} ({targetMember.totalShares} → {targetMember.totalShares + sharesToCredit})
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#114226]">
                <span>Hisa: +{formatTsh(weeklyHisaPreviewTsh)}</span>
                <span>Jamii: +{formatTsh(weeklyJamiiPreviewTsh)}</span>
              </div>
              {isAboveWeeklyMin && (
                <div className="pt-2 border-t border-[#C6DFCF] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[#114226]">
                    {t('Above minimum:', 'Ziada ya kiwango cha chini:')}
                  </span>
                  <div className="inline-flex rounded-lg bg-white p-0.5 border border-[#C6DFCF]">
                    <button
                      type="button"
                      onClick={() => setWeeklySplitMode('extra_to_hisa')}
                      className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        weeklySplitMode === 'extra_to_hisa'
                          ? 'bg-[#165432] text-white'
                          : 'text-[#114226] hover:bg-[#E8F1EB]'
                      }`}
                    >
                      {t('Extra to Hisa', 'Ziada kwa Hisa')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeeklySplitMode('multi_week')}
                      className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        weeklySplitMode === 'multi_week'
                          ? 'bg-[#165432] text-white'
                          : 'text-[#114226] hover:bg-[#E8F1EB]'
                      }`}
                    >
                      {t('Multi-Week (12k × N)', 'Wiki Nyingi (12k × N)')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {category === 'shares' && (
            <div className="rounded-xl bg-[#E8F1EB] border border-[#C6DFCF] px-4 py-3 flex items-center justify-between text-xs">
              <span className="text-[#114226] font-medium">
                {t('Immediate Hisa share increase for', 'Ongezeko la Hisa kwa')} {targetMember.memberNumber}
              </span>
              <span className="font-mono font-bold tabular-nums text-[#165432]">
                +{sharesToCredit} {sharesToCredit === 1 ? 'Share' : 'Shares'} ({targetMember.totalShares} → {targetMember.totalShares + sharesToCredit})
              </span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-4 py-3 text-sm font-semibold text-white hover:bg-[#114226] disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('Updating Hisa & Jamii & Notifying Members...', 'Inaongeza Hisa & Jamii na Kutuma Taarifa...')}
              </>
            ) : (
              t('I have paid', 'Nimekwisha Lipa')
            )}
          </button>
          </div>
        </form>

        {/* Right Side: Immediate Result / Preview + Past Payments List (Sample Screen 2) */}
        <div className="lg:col-span-5 space-y-5">
          {receipt ? (
            <div className="rounded-2xl border border-[#C6DFCF] bg-white p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2.5 text-[#165432]">
                <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="font-display text-base font-bold">
                  {t('Balances Updated Immediately', 'Salio Limesasishwa Papo Hapo')}
                </span>
              </div>

              {(receipt.category === 'weekly_contribution' || receipt.category === 'shares') && (
                <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-[#55635A]">{t('Updated Hisa Shares', 'Hisa Zilizosasishwa')}</div>
                      <div className="mt-0.5 font-mono text-xl font-bold tabular-nums text-[#17231C]">
                        {receipt.previousShares} → {receipt.newShares} {t('Shares', 'Hisa')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[#55635A]">{t('Total Hisa Saved', 'Jumla ya Hisa')}</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#165432]">
                        {formatTsh(receipt.newSavedTsh)}
                      </div>
                    </div>
                  </div>
                  {receipt.category === 'weekly_contribution' && (
                    <div className="pt-2.5 border-t border-[#E5DEC9] flex items-center justify-between text-xs">
                      <span className="text-[#4B5850]">
                        {t('Jamii Added', 'Jamii Iliyoongezwa')} (+{formatTsh(receipt.jamiiAddedTsh)})
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                        {formatTsh(receipt.previousSocialFundTsh)} → {formatTsh(receipt.newSocialFundTsh)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl bg-[#FAF7F0] p-4 space-y-1.5">
                <div className="text-xs font-semibold text-[#17231C]">
                  {t('Notification Sent to Other Members', 'Taarifa Imetumwa kwa Wanachama')} ({receipt.recipientCount}):
                </div>
                <p className="text-sm font-medium text-[#17231C]">
                  “{receipt.broadcastMessage}”
                </p>
                <div className="text-[11px] text-[#55635A] font-mono">
                  Ref: {receipt.reference} · {receipt.provider}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={onDoneNavigateToPassbook}
                  className="min-h-[44px] rounded-xl bg-[#165432] px-3 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors"
                >
                  {t('View My Passbook', 'Kijitabu Changu')}
                </button>
                <button
                  type="button"
                  onClick={onDoneNavigateToAlerts}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-3 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] transition-colors"
                >
                  {t('Group Alerts', 'Taarifa')}
                </button>
                <a
                  href={buildWhatsAppUrl(
                    `${receipt.broadcastMessage} (Ref: ${receipt.reference} · ${receipt.provider} · Total Hisa: ${receipt.newShares} shares / ${formatTsh(receipt.newSavedTsh)})`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3 py-2 text-xs font-semibold text-[#165432] hover:bg-[#DCEBDF] transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('WhatsApp Receipt', 'Tuma Risiti WhatsApp')}
                </a>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E5DEC9] bg-white p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#17231C]">
                <MessageSquareText className="h-4 w-4 text-[#165432]" aria-hidden="true" />
                <span>{t('What Other Members Will Receive', 'Taarifa Watakayopokea Wanachama')}</span>
              </div>
              <p className="text-xs text-[#55635A]">
                {t(
                  'When you tap “I have paid”, your Hisa and Jamii jump right away, and other members only see your member number and amount paid:',
                  'Ukibonyeza “Nimekwisha Lipa”, Hisa na Jamii zako huongezeka papo hapo, na wengine huona namba yako na kiasi pekee:'
                )}
              </p>
              <div className="rounded-xl bg-[#FAF7F0] p-4 text-sm font-medium text-[#17231C]">
                “Member No. {targetMember.memberNumber} made a payment of {formatTsh(amountTsh)}.”
              </div>
              <div className="pt-2 border-t border-[#EFEAE0] flex items-center justify-between text-xs text-[#55635A]">
                <span>{t('Notified members', 'Wanaopokea taarifa')}</span>
                <span className="font-mono tabular-nums text-[#17231C]">
                  {t(`All ${group?.memberCount ?? members.length} group members`, `Wanachama wote ${group?.memberCount ?? members.length}`)}
                </span>
              </div>
            </div>
          )}

          {/* Sample Screen 2: Past payments card */}
          <div className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 border-b border-[#EFEAE0] flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#17231C]">
                {t('Past payments', 'Malipo yaliyopita')}
              </h2>
              <span className="font-mono text-xs text-[#55635A]">
                {targetMember.memberNumber}
              </span>
            </div>
            {pastMemberPayments.length === 0 ? (
              <div className="p-5 text-xs text-[#55635A] text-center">
                {t('No past payments recorded for this member yet.', 'Hakuna malipo yaliyopita bado.')}
              </div>
            ) : (
              <div className="divide-y divide-[#EFEAE0]">
                {pastMemberPayments.map((p) => (
                  <div
                    key={p.id}
                    className="px-5 py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#165432] text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-[#17231C] truncate">
                          {formatTimestamp(p.createdAt)}
                        </div>
                        <div className="font-mono text-[11px] text-[#55635A]">
                          TSh {Math.round(p.amountTsh).toLocaleString('en-US')} · {p.provider}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#55635A] shrink-0">
                      {p.reference}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
