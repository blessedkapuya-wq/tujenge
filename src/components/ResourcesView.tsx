import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  ChevronRight,
  Coins,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLang } from '../lib/i18n';
import { addGroupDocument, deleteGroupDocument } from '../lib/vicobaService';
import {
  DocumentCategory,
  GroupDocument,
  GroupMeeting,
  VicobaGroup,
  formatTimestamp,
  formatTsh,
} from '../types/vicoba';

interface ResourcesViewProps {
  group: VicobaGroup | null;
  documents: GroupDocument[];
  meetings: GroupMeeting[];
  isAdmin: boolean;
  adminUid: string | null;
  adminName: string;
  onGoToJoin: () => void;
  onGoToLoanForm: () => void;
  onGoToMeetings: () => void;
}

const DOC_CATEGORIES: DocumentCategory[] = [
  'Policy',
  'Constitution',
  'Meeting Minutes',
  'Financial Form',
  'Notice',
];

type PolicyLangMode = 'both' | 'en' | 'sw';

export default function ResourcesView({
  group,
  documents,
  meetings,
  isAdmin,
  adminUid,
  adminName,
  onGoToJoin,
  onGoToLoanForm,
  onGoToMeetings,
}: ResourcesViewProps) {
  const { t } = useLang();
  const [policyLangMode, setPolicyLangMode] = useState<PolicyLangMode>('both');
  const [filterCat, setFilterCat] = useState<'All' | DocumentCategory>('All');
  const [showAddForm, setShowAddForm] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('Policy');
  const [content, setContent] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'members'>('public');

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sharePrice = group?.sharePriceTsh ?? 10000;
  const socialFund = group?.socialFundTsh ?? 2000;
  const weeklyMin = sharePrice + socialFund;
  const sundayFine = group?.sundayFineTsh ?? 5000;
  const loanMultiplier = group?.loanMultiplier ?? 3;
  const interestRate = group?.interestRatePct ?? 10;
  const meetingMonths = group?.meetingIntervalMonths ?? 3;

  const nextMeeting =
    [...meetings]
      .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
      .find((m) => m.status === 'scheduled') || null;

  const filteredDocs =
    filterCat === 'All'
      ? documents
      : documents.filter((d) => d.category === filterCat);

  const handleTextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentName(file.name.slice(0, 120));
    if (
      file.type.startsWith('text/') ||
      /\.(txt|md|csv)$/i.test(file.name)
    ) {
      const text = await file.text();
      if (text.trim()) {
        setContent(text.trim().slice(0, 4000));
      }
    }
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 120));
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUid) return;
    setError(null);

    if (title.trim().length < 2) {
      setError(t('Enter a document title.', 'Weka kichwa cha waraka.'));
      return;
    }
    if (content.trim().length < 5) {
      setError(
        t(
          'Enter the document text or summary so all members can read it.',
          'Weka maelezo ya waraka ili wanachama wote wasome.'
        )
      );
      return;
    }
    if (externalUrl.trim() && !/^https?:\/\//i.test(externalUrl.trim())) {
      setError(
        t(
          'External link must start with https:// or http://.',
          'Kiungo lazima kianze na https:// au http://.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      await addGroupDocument({
        adminUid,
        adminName,
        title: title.trim(),
        category,
        content: content.trim(),
        externalUrl: externalUrl.trim(),
        attachmentName: attachmentName.trim(),
        visibility,
        memberCount: group?.memberCount ?? 4,
      });
      setTitle('');
      setContent('');
      setExternalUrl('');
      setAttachmentName('');
      setShowAddForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save document right now.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await deleteGroupDocument(docId);
    } finally {
      setDeletingId(null);
    }
  };

  const scrollToLibrary = () => {
    const el = document.getElementById('docs-library');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const bilingualRegulations = [
    {
      num: '01',
      enTitle: 'Sunday Weekly Contribution Rule',
      swTitle: 'Kanuni ya Mchango wa Kila Jumapili',
      enBody:
        'Payment of the week must be made every Sunday. After sending via Mobile Money (M-Pesa, Mixx by Yas, Airtel Money, or Halopesa), paste the confirmation SMS message and tap “I Have Paid” immediately.',
      swBody:
        'Malipo ya wiki lazima yafanyike kila Jumapili. Baada ya kutuma kwa simu (M-Pesa, Mixx by Yas, Airtel Money, au Halopesa), bandika ujumbe wa malipo kisha bonyeza “Nimekwisha Lipa” papo hapo.',
    },
    {
      num: '02',
      enTitle: `Minimum ${formatTsh(weeklyMin)} Weekly Share (Above Allowed)`,
      swTitle: `Kiwango cha Chini ${formatTsh(weeklyMin)} kwa Wiki (Ziada Inakubalika)`,
      enBody: `12,000 TSH is the minimal weekly contribution (10,000 TSH Hisa + 2,000 TSH Jamii). Any member may pay above 12,000 TSH to build their Hisa shares faster or prepay upcoming weeks.`,
      swBody: `12,000 TSH ni kiwango cha chini kwa wiki (10,000 TSH Hisa + 2,000 TSH Jamii). Mwanachama anaweza kutoa zaidi ya 12,000 TSH kuongeza Hisa zake haraka au kulipia wiki zijazo.`,
    },
    {
      num: '03',
      enTitle: `Late Payment Fine (${formatTsh(sundayFine)})`,
      swTitle: `Faini ya Kuchelewa Malipo (${formatTsh(sundayFine)})`,
      enBody: `No payment on Sunday results in a 5,000 TSH fine recorded on the member’s accountability ledger. All collected fines enter the group profit pool shared as dividends.`,
      swBody: `Kutolipa malipo ya wiki kila Jumapili kunaleta faini ya 5,000 TSH katika leja ya mwanachama. Faini zote zinazokusanywa huingia kwenye faida ya gawio la kikundi.`,
    },
    {
      num: '04',
      enTitle: `Loan Policy (${loanMultiplier}x Hisa · ${interestRate}% Interest)`,
      swTitle: `Kanuni za Mikopo (${loanMultiplier}x Hisa · Riba ${interestRate}%)`,
      enBody: `Active members may request a loan up to ${loanMultiplier}x their total saved Hisa at ${interestRate}% interest over 1–6 months, approved by the Chairperson and Treasurer.`,
      swBody: `Mwanachama hai anaweza kuomba mkopo hadi mara ${loanMultiplier} (3x) ya akiba yake ya Hisa kwa riba ya ${interestRate}% kwa muda wa miezi 1–6 baada ya kuidhinishwa na viongozi.`,
    },
    {
      num: '05',
      enTitle: 'Jamii Emergency Fund Solidarity',
      swTitle: 'Mfuko wa Dharura wa Jamii',
      enBody: `The 2,000 TSH weekly Jamii contribution supports members during illness, bereavement, maternity, or family emergencies, with all payouts logged transparently.`,
      swBody: `Mchango wa Jamii wa 2,000 TSH kila wiki husaidia wanachama wakati wa ugonjwa, msiba, uzazi, au dharura za kifamilia, huku kila malipo yakirekodiwa kwa uwazi.`,
    },
    {
      num: '06',
      enTitle: `Quarterly Meetings & Share Reports (Every ${meetingMonths} Months)`,
      swTitle: `Mikutano ya Robo Mwaka na Ripoti za Hisa (Kila Miezi ${meetingMonths})`,
      enBody: `Group meetings are held every 3 months with automated reminders to review every member’s Hisa shares, total group collections, Jamii balance, and end-of-cycle dividends.`,
      swBody: `Mikutano ya kikundi hufanyika kila baada ya miezi 3 ikiwa na vikumbusho otomatiki kupitia ripoti za Hisa za kila mwanachama, makusanyo yote, salio la Jamii, na makadirio ya gawio.`,
    },
  ];

  const showEn = policyLangMode === 'both' || policyLangMode === 'en';
  const showSw = policyLangMode === 'both' || policyLangMode === 'sw';

  return (
    <div className="space-y-6">
      {/* Header matching Screen 4 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5DEC9] pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#17231C]">
            {t('Resources', 'Kanuni na Nyaraka')}
          </h1>
          <p className="mt-1 text-sm text-[#55635A] max-w-2xl">
            {t(
              'Official group policies, regulations (English & Kiswahili), quick forms, meeting links, and group documents.',
              'Kanuni rasmi za kikundi (Kiswahili na Kiingereza), fomu za haraka, ratiba ya mikutano, na nyaraka zote.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div
            className="inline-flex items-center rounded-xl bg-[#EAE2D0] p-1"
            role="group"
            aria-label="Policy and regulation language filter"
          >
            {(
              [
                { id: 'both', label: 'EN + SW' },
                { id: 'en', label: 'English' },
                { id: 'sw', label: 'Kiswahili' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPolicyLangMode(opt.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                  policyLangMode === opt.id
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {showAddForm
                ? t('Close Form', 'Funga Fomu')
                : t('Add Document', 'Ongeza Waraka')}
            </button>
          )}
        </div>
      </div>

      {/* Screen 4 Layout: Group Rules (Left) + Documents & Meetings Quick Links (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sample Screen 4: Group rules card */}
        <section
          aria-labelledby="group-rules-heading"
          className="lg:col-span-6 rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2
                id="group-rules-heading"
                className="font-display text-lg font-bold text-[#17231C]"
              >
                {showEn && showSw
                  ? 'Group rules · Kanuni za kikundi'
                  : showSw
                    ? 'Kanuni za kikundi'
                    : 'Group rules'}
              </h2>
            </div>
            <span className="font-mono text-[11px] font-semibold text-[#165432]">
              TSH
            </span>
          </div>

          <div className="divide-y divide-[#EFEAE0]">
            {/* Rule 1: Pay every Sunday */}
            <div className="py-3.5 first:pt-1 flex items-start gap-3.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                <Calendar className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                {showEn && (
                  <div className="text-sm font-semibold text-[#17231C]">
                    Pay every Sunday
                  </div>
                )}
                {showSw && (
                  <div className="text-sm font-semibold text-[#165432]">
                    Lipa kila Jumapili
                  </div>
                )}
                <div className="text-xs text-[#55635A]">
                  {showEn && 'Payment of the week must be made every Sunday.'}
                  {showEn && showSw && ' · '}
                  {showSw && 'Malipo ya wiki lazima yafanyike kila Jumapili.'}
                </div>
              </div>
            </div>

            {/* Rule 2: Minimum TSh 12,000 */}
            <div className="py-3.5 flex items-start gap-3.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                <Coins className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                {showEn && (
                  <div className="text-sm font-semibold text-[#17231C] font-mono tabular-nums">
                    Minimum TSh {weeklyMin.toLocaleString('en-US')}
                  </div>
                )}
                {showSw && (
                  <div className="text-sm font-semibold text-[#165432] font-mono tabular-nums">
                    Kiwango cha chini TSh {weeklyMin.toLocaleString('en-US')}
                  </div>
                )}
                <div className="text-xs text-[#55635A]">
                  {showEn &&
                    `10,000 Hisa + 2,000 Jamii (paying above ${weeklyMin.toLocaleString('en-US')} boosts Hisa).`}
                  {showEn && showSw && ' · '}
                  {showSw &&
                    'Hisa 10,000 + Jamii 2,000 (unaweza kulipa zaidi kuongeza Hisa).'}
                </div>
              </div>
            </div>

            {/* Rule 3: No payment: fine TSh 5,000 */}
            <div className="py-3.5 last:pb-1 flex items-start gap-3.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FBF0DA] text-[#C86D14]">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                {showEn && (
                  <div className="text-sm font-semibold text-[#17231C] font-mono tabular-nums">
                    No payment: fine TSh {sundayFine.toLocaleString('en-US')}
                  </div>
                )}
                {showSw && (
                  <div className="text-sm font-semibold text-[#C86D14] font-mono tabular-nums">
                    Kutolipa Jumapili: faini TSh {sundayFine.toLocaleString('en-US')}
                  </div>
                )}
                <div className="text-xs text-[#55635A]">
                  {showEn && 'Missing weekly Sunday payment results in a 5,000 TSH fine.'}
                  {showEn && showSw && ' · '}
                  {showSw && 'Kutolipa Jumapili kunaleta faini ya 5,000 TSH.'}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sample Screen 4: Documents & Meetings Quick Navigation */}
        <div className="lg:col-span-6 space-y-5">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#55635A] px-1">
              {t('Documents', 'Nyaraka na Fomu')}
            </h2>
            <div className="rounded-2xl border border-[#E5DEC9] bg-white divide-y divide-[#EFEAE0] overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={scrollToLibrary}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#17231C]">
                    {t('Group constitution & policy', 'Katiba na kanuni za kikundi')}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onGoToLoanForm}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#17231C]">
                    {t('Loan form', 'Fomu ya mkopo')}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onGoToJoin}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#17231C]">
                    {t('Joining form', 'Fomu ya kujiunga')}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[#55635A] px-1">
              {t('Meetings', 'Mikutano na Ripoti')}
            </h2>
            <div className="rounded-2xl border border-[#E5DEC9] bg-white divide-y divide-[#EFEAE0] overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={onGoToMeetings}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FBF0DA] text-[#C86D14]">
                    <Calendar className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#17231C]">
                    {nextMeeting
                      ? t(
                          `Quarterly meeting ${nextMeeting.meetingDate}`,
                          `Mkutano wa robo mwaka ${nextMeeting.meetingDate}`
                        )
                      : t('Quarterly meeting schedule', 'Ratiba ya mikutano ya miezi 3')}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onGoToMeetings}
                className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-[#FAF7F0] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E8F1EB] text-[#165432]">
                    <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-[#17231C]">
                    {t('Contribution report shared', 'Ripoti ya michango na gawio')}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-[#8A948D] shrink-0" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Full Bilingual Policies & Regulations Book (English & Kiswahili) */}
      <section
        aria-labelledby="bilingual-regulations-heading"
        className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFEAE0] pb-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-[#165432] shrink-0" aria-hidden="true" />
            <div>
              <h2
                id="bilingual-regulations-heading"
                className="font-display text-lg font-bold text-[#17231C]"
              >
                {showEn && showSw
                  ? 'Official Policies & Regulations (English & Kiswahili)'
                  : showSw
                    ? 'Kanuni na Sheria Rasmi za Kikundi (Kiswahili)'
                    : 'Official Policies & Regulations (English)'}
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  'Complete Tujenge Hub constitution rules available in both English and Kiswahili for every member.',
                  'Sheria na taratibu kamili za Tujenge Hub zinazosomeka kwa Kiswahili na Kiingereza.'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {bilingualRegulations.map((item) => (
            <article
              key={item.num}
              className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0]/60 p-4 space-y-2.5"
            >
              <div className="text-[11px] font-mono font-bold text-[#165432]">
                {t(`Article ${item.num}`, `Kifungu ${item.num}`)}
              </div>

              {showEn && (
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold text-[#17231C]">
                    {item.enTitle}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#4B5850]">
                    {item.enBody}
                  </p>
                </div>
              )}

              {showEn && showSw && (
                <div className="border-t border-[#E5DEC9]" />
              )}

              {showSw && (
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold text-[#165432]">
                    {item.swTitle}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#37463D]">
                    {item.swBody}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Admin Add Document Form */}
      {isAdmin && showAddForm && (
        <form
          onSubmit={handleAddDocument}
          className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-[#EFEAE0] pb-3">
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t('Add Official Group Document', 'Ongeza Waraka Rasmi wa Kikundi')}
            </h2>
            <span className="text-xs text-[#55635A]">
              {t('Admin Upload / Entry', 'Msimamizi')}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="doc-title" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Document Title (English or Kiswahili)', 'Kichwa cha Waraka (Kiswahili au Kiingereza)')}
              </label>
              <input
                id="doc-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kanuni za Mikopo / Loan Guidelines 2026"
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="doc-cat" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Category', 'Aina')}
              </label>
              <select
                id="doc-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              >
                {DOC_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="doc-url" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('External PDF / Google Drive Link (Optional)', 'Kiungo cha PDF / Google Drive (Si Lazima)')}
              </label>
              <input
                id="doc-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://..."
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-white px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="doc-file" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Import Text File or Attach Filename (Optional)', 'Pakia Faili au Jina la Kiambatisho (Si Lazima)')}
              </label>
              <label
                htmlFor="doc-file"
                className="min-h-[44px] flex items-center justify-between gap-2 rounded-xl border border-dashed border-[#C9BFA6] bg-[#FAF7F0] px-3 py-2 text-xs text-[#37463D] cursor-pointer hover:border-[#165432]"
              >
                <span className="truncate">
                  {attachmentName || t('Choose .txt, .md, .csv or PDF name...', 'Chagua .txt, .md, .csv au jina la PDF...')}
                </span>
                <Upload className="h-4 w-4 text-[#55635A] shrink-0" aria-hidden="true" />
              </label>
              <input
                id="doc-file"
                type="file"
                onChange={handleTextFileUpload}
                className="sr-only"
              />
            </div>
          </div>

          <div>
            <label htmlFor="doc-content" className="block text-xs font-medium text-[#37463D] mb-1.5">
              {t('Document Content / Policy Details (Swahili & English Supported)', 'Maelezo ya Waraka / Kanuni (Kiswahili na Kiingereza)')}
            </label>
            <textarea
              id="doc-content"
              rows={5}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write or paste the policy, minutes, or notice text in Kiswahili and/or English..."
              className="w-full rounded-xl border border-[#DDD4BE] bg-white px-3.5 py-2.5 text-sm text-[#17231C] focus:border-[#165432] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-[#37463D]">{t('Visibility', 'Uonekanaji')}:</span>
              <div className="flex items-center gap-1 p-1 bg-[#EAE2D0] rounded-lg">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    visibility === 'public'
                      ? 'bg-white text-[#17231C] shadow-xs'
                      : 'text-[#55635A]'
                  }`}
                >
                  {t('Everyone (Share Link + Members)', 'Wote (Kiungo + Wanachama)')}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('members')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    visibility === 'members'
                      ? 'bg-white text-[#17231C] shadow-xs'
                      : 'text-[#55635A]'
                  }`}
                >
                  {t('Signed-In Members Only', 'Wanachama Pekee')}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#165432] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('Publishing Document...', 'Inahifadhi Waraka...')}
                </>
              ) : (
                t('Save & Notify Members', 'Hifadhi na Arifu Kikundi')
              )}
            </button>
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
        </form>
      )}

      {/* Group Documents Library */}
      <section id="docs-library" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-[#17231C]">
            {t('Group Documents Library', 'Maktaba ya Nyaraka za Kikundi')} ({filteredDocs.length})
          </h2>

          <div className="flex items-center gap-1 p-1 bg-[#EAE2D0] rounded-xl overflow-x-auto max-w-full">
            {(['All', ...DOC_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilterCat(cat)}
                className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filterCat === cat
                    ? 'bg-white text-[#17231C] shadow-xs'
                    : 'text-[#55635A] hover:text-[#17231C]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="rounded-2xl border border-[#E5DEC9] bg-white p-8 text-center text-xs text-[#55635A]">
            {t('No documents in this category yet.', 'Hakuna nyaraka katika kundi hili bado.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredDocs.map((docItem) => (
              <article
                key={docItem.id}
                className="rounded-2xl border border-[#E5DEC9] bg-white p-5 space-y-3 flex flex-col justify-between shadow-xs"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-[#165432]">
                        {docItem.category} · {docItem.visibility === 'public' ? t('Public', 'Wazi') : t('Members', 'Wanachama')} · {formatTimestamp(docItem.createdAt)}
                      </div>
                      <h3 className="mt-1 font-display text-base font-bold text-[#17231C]">
                        {docItem.title}
                      </h3>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        disabled={deletingId === docItem.id}
                        onClick={() => handleDelete(docItem.id)}
                        aria-label={`Delete ${docItem.title}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#8A948D] hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
                      >
                        {deletingId === docItem.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm leading-relaxed text-[#4B5850] whitespace-pre-line">
                    {docItem.content}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#EFEAE0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#55635A]">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#8A948D]" aria-hidden="true" />
                    {t('Added by', 'Imeongezwa na')} {docItem.addedByName}
                    {docItem.attachmentName ? ` · ${docItem.attachmentName}` : ''}
                  </span>

                  {docItem.externalUrl && (
                    <a
                      href={docItem.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[#165432] hover:underline"
                    >
                      {t('Open Attachment', 'Fungua Kiambatisho')}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
