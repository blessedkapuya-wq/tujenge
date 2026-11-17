import { useEffect, useState } from 'react';
import { User } from '../lib/session';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Share2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { useLang } from '../lib/i18n';
import { joinVicobaGroup } from '../lib/vicobaService';
import {
  MOBILE_NETWORKS,
  MemberLedger,
  MobileNetwork,
  VicobaGroup,
  buildWhatsAppUrl,
  formatTsh,
} from '../types/vicoba';

const FOUNDERS_HERO_IMG = '/src/assets/images/tujenge_founders_hero_1794758772143.jpg';

interface PublicJoinViewProps {
  group: VicobaGroup | null;
  user: User | null;
  members: MemberLedger[];
  currentMember: MemberLedger | null;
  shareUrl: string;
  onRequestSignIn: () => void;
  onGoToMember: () => void;
  onGoToPay: () => void;
  onGoToResources: () => void;
}

export default function PublicJoinView({
  group,
  user,
  members,
  currentMember,
  shareUrl,
  onRequestSignIn,
  onGoToMember,
  onGoToPay,
  onGoToResources,
}: PublicJoinViewProps) {
  const { t } = useLang();
  const [heroFailed, setHeroFailed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [fullName, setFullName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phoneNumber || '+255 7');
  const [preferredNetwork, setPreferredNetwork] = useState<MobileNetwork>('M-Pesa');
  const [mtaaHouseNumber, setMtaaHouseNumber] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('+255 7');
  const [nationalId, setNationalId] = useState('');
  const [startingShares, setStartingShares] = useState(1);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedNumber, setAssignedNumber] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName && !fullName) {
      setFullName(user.displayName);
    }
    if (user?.phoneNumber && (phone === '+255 7' || !phone)) {
      setPhone(user.phoneNumber);
    }
  }, [user, fullName, phone]);

  const sharePrice = group?.sharePriceTsh ?? 10000;
  const socialFund = group?.socialFundTsh ?? 2000;
  const weeklyTotal = sharePrice + socialFund;
  const sundayFine = group?.sundayFineTsh ?? 5000;
  const loanMultiplier = group?.loanMultiplier ?? 3;
  const interestRate = group?.interestRatePct ?? 10;
  const nextSeq = group?.nextMemberSeq ?? 5;
  const previewNextCode = `TUJ-${String(nextSeq).padStart(3, '0')}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name.');
      return;
    }
    if (phone.trim().length < 7) {
      setError('Please enter a valid mobile money phone number (e.g. +255 754 123 456).');
      return;
    }
    if (!mtaaHouseNumber.trim() || mtaaHouseNumber.trim().length < 2) {
      setError('Please enter your Mtaa and House Number (e.g. Sinza Mori, House 14).');
      return;
    }
    if (!nextOfKinName.trim() || nextOfKinPhone.trim().length < 7) {
      setError('Please enter your next of kin full name and phone number.');
      return;
    }

    if (!user) {
      onRequestSignIn();
      return;
    }

    setSubmitting(true);
    try {
      const result = await joinVicobaGroup({
        uid: user.uid,
        email: user.email || '',
        fullName: fullName.trim(),
        phone: phone.trim(),
        preferredNetwork,
        nextOfKinName: nextOfKinName.trim(),
        nextOfKinPhone: nextOfKinPhone.trim(),
        mtaaHouseNumber: mtaaHouseNumber.trim(),
        nationalId: nationalId.trim(),
        startingCommitmentShares: startingShares,
      });

      setAssignedNumber(result.memberNumber);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not complete registration right now. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center space-y-5">
          <div className="text-xs font-semibold text-[#165432]">
            {t('Tujenge Hub VICOBA · Founded by 4 Women · Currency: TSH', 'Tujenge Hub VICOBA · Kikundi cha Wanawake · Fedha: TSH')}
          </div>
          <h1
            className="font-display font-bold tracking-tight text-[#17231C] leading-[1.12]"
            style={{ fontSize: 'clamp(1.85rem, 3.6vw, 3rem)', textWrap: 'balance' }}
          >
            {t(
              'Save together, borrow fairly, and track every shilling digitally.',
              'Weka hisa pamoja, kopa kwa haki, na fuatilia kila shilingi kidijitali.'
            )}
          </h1>
          <p className="text-sm sm:text-base leading-relaxed text-[#55635A] max-w-xl">
            {t(
              'Share this page link with interested women. New members apply inside, receive an automatic Member Number immediately, pay weekly every Sunday via Mobile Money, and trigger instant group notifications.',
              'Shiriki kiungo hiki kwa wanawake wanaotaka kujiunga. Wanachama wapya hujaza fomu, kupata Namba ya Mwanachama papo hapo, kulipa kila Jumapili kwa simu, na kutuma taarifa kwa kikundi kizima.'
            )}
          </p>

          {/* Shareable Link Strip */}
          <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 space-y-2.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#17231C] inline-flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                {t('Shareable Invite Link for Interested Women', 'Kiungo cha Mwaliko kwa Wanachama Wapya')}
              </span>
              <span className="text-[#8A948D]">{t('Open to new members', 'Wazi kwa wanachama wapya')}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                aria-label="Shareable VICOBA join link"
                value={shareUrl}
                className="flex-1 min-w-0 min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 font-mono text-xs text-[#37463D] focus:outline-none"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('Link Copied', 'Imekopiwa')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('Copy Link', 'Kopi Kiungo')}
                    </>
                  )}
                </button>
                <a
                  href={buildWhatsAppUrl(
                    t(
                      `Karibu Tujenge Hub VICOBA! Jiunge na kikundi chetu hapa upate Namba yako ya Mwanachama moja kwa moja: ${shareUrl}`,
                      `Karibu Tujenge Hub VICOBA! Jiunge na kikundi chetu hapa upate Namba yako ya Mwanachama moja kwa moja: ${shareUrl}`
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-initial min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3.5 py-2 text-xs font-semibold text-[#165432] hover:bg-[#DCEBDF] transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="h-full min-h-[220px] sm:min-h-[260px] overflow-hidden rounded-2xl border border-[#E5DEC9] bg-white shadow-xs">
            {!heroFailed ? (
              <img
                src={FOUNDERS_HERO_IMG}
                alt="Four women VICOBA founders reviewing their savings ledger and mobile phone together"
                referrerPolicy="no-referrer"
                onError={() => setHeroFailed(true)}
                className="h-full w-full object-cover aspect-video lg:aspect-auto"
              />
            ) : (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center bg-[#FAF7F0] p-8 text-center">
                <div className="font-display text-base font-semibold text-[#17231C]">
                  Tujenge Hub VICOBA
                </div>
                <p className="mt-1 text-xs text-[#55635A]">
                  Women-led digital community savings &amp; loans in TSH.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Group Rules Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-2xl border border-[#E5DEC9] bg-white p-5 shadow-xs">
        <div>
          <div className="text-xs text-[#55635A]">{t('Weekly Minimum (Sunday)', 'Kiwango cha Chini (Jumapili)')}</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#165432]">
            {formatTsh(weeklyTotal)}
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[#55635A]">
            {formatTsh(sharePrice)} Hisa + {formatTsh(socialFund)} Jamii
          </div>
        </div>
        <div>
          <div className="text-xs text-[#55635A]">{t('Sunday Deadline & Fine', 'Muda wa Jumapili & Faini')}</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#C86D14]">
            {formatTsh(sundayFine)} {t('Fine', 'Faini')}
          </div>
          <div className="mt-0.5 text-[11px] text-[#55635A]">
            {t('If weekly payment is missed', 'Kama malipo yakikosekana')}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#55635A]">{t('Loans & Meetings', 'Mikopo & Mikutano')}</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#17231C]">
            {loanMultiplier}x {t('Shares', 'Hisa')} · {interestRate}%
          </div>
          <div className="mt-0.5 text-[11px] text-[#55635A]">
            {t(`Meetings every ${group?.meetingIntervalMonths ?? 3} months`, `Mikutano kila miezi ${group?.meetingIntervalMonths ?? 3}`)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#55635A]">{t('Active Members', 'Wanachama Hai')}</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-[#17231C]">
            {group?.memberCount ?? 4} {t('Members', 'Wanachama')}
          </div>
          <button
            type="button"
            onClick={onGoToResources}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#165432] hover:underline"
          >
            <BookOpen className="h-3 w-3" aria-hidden="true" />
            {t('Read Full Policy', 'Soma Kanuni Kamili')}
          </button>
        </div>
      </section>

      {/* Inside Joining Form + Automatic Member Numbering */}
      <section id="join-form" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="text-xs font-semibold text-[#165432]">
            {t('Inside New Member Application Form', 'Fomu ya Maombi ya Mwanachama Mpya')}
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-[#17231C]">
            {t(
              'Join Tujenge Hub and receive your Member Number automatically',
              'Jiunge na Tujenge Hub na upate Namba ya Mwanachama papo hapo'
            )}
          </h2>
          <p className="text-sm leading-relaxed text-[#55635A]">
            {t(
              'When a new woman opens your shared link, she fills out this application form with her phone number, Mtaa & house number, next of kin, and optional ID. Her permanent ID (next available:',
              'Mwanachama mpya akifungua kiungo hiki, anajaza namba ya simu, mtaa na namba ya nyumba, ndugu wa karibu, na kitambulisho (si lazima). Namba yake (inayofuata:'
            )}{' '}
            <span className="font-mono font-semibold text-[#17231C]">{previewNextCode}</span>
            {t(') is generated on the spot.', ') hutolewa papo hapo.')}
          </p>

          <div className="rounded-2xl border border-[#E5DEC9] bg-white p-5 space-y-3 shadow-xs">
            <div className="text-xs font-semibold text-[#17231C]">
              {t('Official Sunday Rules Summary', 'Muhtasari wa Kanuni za Jumapili')}
            </div>
            <ul className="space-y-2 text-xs text-[#4B5850]">
              <li className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t('Minimum weekly contribution is 12,000 TSH (10,000 Hisa + 2,000 Jamii).', 'Kiwango cha chini cha wiki ni 12,000 TSH (10,000 Hisa + 2,000 Jamii).')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t('Weekly payments must be made every Sunday; no payment results in a 5,000 TSH fine.', 'Malipo ya wiki lazima yafanyike kila Jumapili; kutolipa kunaleta faini ya 5,000 TSH.')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t('Sign in using your mobile phone number to pay shares, request loans, and view quarterly reports.', 'Ingia kwa namba yako ya simu kulipa hisa, kuomba mkopo, na kuona ripoti.')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7">
          {assignedNumber ? (
            <div className="rounded-2xl border border-[#C6DFCF] bg-white p-6 space-y-5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#165432] text-white">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-xs font-medium text-[#165432]">
                    {t('Membership Confirmed · Group Notified', 'Uanachama Umethibitishwa · Kikundi Kimearifiwa')}
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#17231C]">
                    {t('Welcome to Tujenge Hub!', 'Karibu Tujenge Hub!')}
                  </h3>
                </div>
              </div>

              <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[#55635A]">{t('Your Automatic Member Number', 'Namba Yako ya Mwanachama')}</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-[#165432]">
                    {assignedNumber}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[#55635A]">{t('Weekly Share Plan', 'Mpango wa Wiki')}</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[#17231C]">
                    {startingShares} {startingShares === 1 ? 'wk' : 'wks'} ({formatTsh(startingShares * weeklyTotal)})
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onGoToPay}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#114226] transition-colors"
                >
                  {t('Pay First Weekly Share (12,000 TSH)', 'Lipa Mchango wa Kwanza (12,000 TSH)')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onGoToMember}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-4 py-2.5 text-sm font-medium text-[#37463D] hover:bg-[#FAF7F0] transition-colors"
                >
                  {t('View My Passbook', 'Fungua Kijitabu')}
                </button>
              </div>
            </div>
          ) : currentMember ? (
            <div className="rounded-2xl border border-[#E5DEC9] bg-white p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-4">
                <div>
                  <div className="text-xs text-[#55635A]">{t('Already Registered', 'Umeshasajiliwa')}</div>
                  <h3 className="font-display text-lg font-bold text-[#17231C]">
                    {currentMember.fullName} ·{' '}
                    <span className="font-mono text-[#165432]">{currentMember.memberNumber}</span>
                  </h3>
                </div>
                <span className="text-xs font-semibold text-[#165432]">{t('Active Member', 'Mwanachama Hai')}</span>
              </div>
              <p className="text-sm text-[#55635A]">
                {t(
                  'Your member account is active. You can pay your weekly 12,000 TSH contribution via mobile money, submit a loan application, or share the invite link above so another woman receives',
                  'Akaunti yako iko hai. Unaweza kulipa mchango wako wa 12,000 TSH, kuomba mkopo, au kushiriki kiungo ili mwanachama mwingine apate'
                )}{' '}
                <span className="font-mono font-semibold text-[#17231C]">{previewNextCode}</span>.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onGoToPay}
                  className="min-h-[44px] rounded-xl bg-[#165432] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#114226] transition-colors"
                >
                  {t('Pay via Mobile Money', 'Lipa kwa Simu')}
                </button>
                <button
                  type="button"
                  onClick={onGoToMember}
                  className="min-h-[44px] rounded-xl border border-[#E5DEC9] bg-white px-4 py-2.5 text-xs font-semibold text-[#37463D] hover:bg-[#FAF7F0] transition-colors"
                >
                  {t('Open My Passbook', 'Fungua Kijitabu Changu')}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleJoinSubmit}
              className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3">
                <h3 className="font-display text-base font-bold text-[#17231C]">
                  {t('New Member Application Form', 'Fomu ya Maombi ya Mwanachama Mpya')}
                </h3>
                <span className="font-mono text-xs tabular-nums font-semibold text-[#165432]">
                  {t('Next ID:', 'Ijayo:')} {previewNextCode}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="join-name" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Full Name *', 'Jina Kamili *')}
                  </label>
                  <input
                    id="join-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Fatuma Ally"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>

                <div>
                  <label htmlFor="join-phone" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Phone Number (Mobile Money) *', 'Namba ya Simu *')}
                  </label>
                  <input
                    id="join-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+255 754 123 456"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="join-mtaa" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Mtaa & House Number *', 'Mtaa na Namba ya Nyumba *')}
                  </label>
                  <input
                    id="join-mtaa"
                    type="text"
                    required
                    value={mtaaHouseNumber}
                    onChange={(e) => setMtaaHouseNumber(e.target.value)}
                    placeholder="e.g. Sinza Mori, House No. 14"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>

                <div>
                  <label htmlFor="join-id" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('National ID / NIDA (Optional)', 'Kitambulisho / NIDA (Si Lazima)')}
                  </label>
                  <input
                    id="join-id"
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="Optional ID number"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="join-kin-name" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Next of Kin Full Name *', 'Jina la Mtu wa Karibu *')}
                  </label>
                  <input
                    id="join-kin-name"
                    type="text"
                    required
                    value={nextOfKinName}
                    onChange={(e) => setNextOfKinName(e.target.value)}
                    placeholder="e.g. Mariam Ally"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>
                <div>
                  <label htmlFor="join-kin-phone" className="block text-xs font-medium text-[#37463D] mb-1.5">
                    {t('Next of Kin Phone *', 'Simu ya Mtu wa Karibu *')}
                  </label>
                  <input
                    id="join-kin-phone"
                    type="tel"
                    required
                    value={nextOfKinPhone}
                    onChange={(e) => setNextOfKinPhone(e.target.value)}
                    placeholder="+255 712 987 654"
                    className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:outline-none focus:ring-2 focus:ring-[#165432]/20"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-[#37463D] mb-1.5">
                  {t('Preferred Mobile Money Network', 'Mtandao Unaoupendelea')}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#EAE2D0] rounded-xl">
                  {MOBILE_NETWORKS.map((net) => (
                    <button
                      key={net.id}
                      type="button"
                      onClick={() => setPreferredNetwork(net.id)}
                      className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        preferredNetwork === net.id
                          ? 'bg-white text-[#17231C] shadow-xs'
                          : 'text-[#55635A] hover:text-[#17231C]'
                      }`}
                    >
                      {net.id}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="join-shares" className="text-xs font-medium text-[#37463D]">
                    {t('Weekly Contribution Plan (12,000 Min = 10,000 Hisa + 2,000 Jamii)', 'Mpango wa Wiki (12,000 Min = 10,000 Hisa + 2,000 Jamii)')}
                  </label>
                  <span className="font-mono text-xs font-semibold tabular-nums text-[#165432]">
                    {startingShares} {startingShares === 1 ? 'week' : 'weeks'} = {formatTsh(startingShares * weeklyTotal)}
                  </span>
                </div>
                <input
                  id="join-shares"
                  type="range"
                  min={1}
                  max={12}
                  value={startingShares}
                  onChange={(e) => setStartingShares(Number(e.target.value))}
                  className="w-full accent-[#165432]"
                />
              </div>

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
                    {t('Assigning Member Number...', 'Inatoa Namba ya Mwanachama...')}
                  </>
                ) : user ? (
                  <>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {t('Join Tujenge Hub & Get Member No.', 'Jiunge na Upate Namba ya Mwanachama')}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {t('Sign In by Phone & Get Member No.', 'Ingia kwa Simu & Pata Namba')}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Group Members List — Visible to Everyone (Read-Only, No Admin Controls or Private PII) */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t('Tujenge Hub Member Directory', 'Orodha ya Wanachama wa Tujenge Hub')}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                'Transparent list of registered members and their Member Numbers. Admin controls remain restricted to the Treasurer & Chairperson.',
                'Orodha ya wanachama wote na namba zao za uanachama. Udhibiti wa Msimamizi unabaki kwa viongozi pekee.'
              )}
            </p>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-[#165432]">
            {members.length} {t('Members', 'Wanachama')}
          </span>
        </div>

        {members.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#55635A]">
            {t('Member list will appear once the group ledger initializes.', 'Orodha ya wanachama itaonekana punde.')}
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-[#EFEAE0]">
              {members.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-[#17231C]">
                      <span className="font-mono text-[#165432] mr-1.5">{m.memberNumber}</span>
                      {m.fullName}
                    </div>
                    <div className="text-[11px] text-[#55635A]">
                      {m.role === 'founder' ? t('Founding Member', 'Mwanzilishi') : t('Member', 'Mwanachama')} · {m.preferredNetwork}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-semibold text-[#17231C]">{m.totalShares} {t('sh', 'hisa')}</div>
                    <div className="text-[11px] text-[#165432]">{formatTsh(m.totalSavedTsh)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#EFEAE0] bg-[#FAF7F0] text-[11px] font-semibold text-[#55635A]">
                    <th className="py-3 px-4">{t('Member No.', 'Namba')}</th>
                    <th className="py-3 px-4">{t('Full Name', 'Jina Kamili')}</th>
                    <th className="py-3 px-4">{t('Role', 'Wadhifa')}</th>
                    <th className="py-3 px-4">{t('Network', 'Mtandao')}</th>
                    <th className="py-3 px-4 text-right">{t('Hisa Shares', 'Idadi ya Hisa')}</th>
                    <th className="py-3 px-4 text-right">{t('Total Hisa (TSH)', 'Jumla ya Hisa (TSH)')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0] text-xs">
                  {members.map((m) => (
                    <tr key={m.id} className="hover:bg-[#FAF7F0]/70">
                      <td className="py-3 px-4 font-mono font-semibold text-[#165432] whitespace-nowrap">
                        {m.memberNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#17231C] whitespace-nowrap">
                        {m.fullName}
                      </td>
                      <td className="py-3 px-4 text-[#55635A] whitespace-nowrap">
                        {m.role === 'founder' ? t('Founding Member', 'Mwanzilishi') : t('Member', 'Mwanachama')}
                      </td>
                      <td className="py-3 px-4 text-[#55635A] whitespace-nowrap">
                        {m.preferredNetwork}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#17231C]">
                        {m.totalShares}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#165432] whitespace-nowrap">
                        {formatTsh(m.totalSavedTsh)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
