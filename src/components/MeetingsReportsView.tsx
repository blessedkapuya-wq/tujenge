import { useMemo, useState } from 'react';
import {
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Download,
  HeartHandshake,
  Loader2,
  MessageCircle,
  Plus,
  TrendingUp,
} from 'lucide-react';
import { useLang } from '../lib/i18n';
import {
  addGroupMeeting,
  sendMeetingReminderBroadcast,
  toggleMeetingStatus,
} from '../lib/vicobaService';
import {
  GroupMeeting,
  JamiiPayout,
  MemberLedger,
  MemberLoan,
  MobilePayment,
  VicobaGroup,
  buildWhatsAppUrl,
  formatTsh,
  getNextSundayInfo,
} from '../types/vicoba';

interface MeetingsReportsViewProps {
  group: VicobaGroup | null;
  members: MemberLedger[];
  payments: MobilePayment[];
  loans: MemberLoan[];
  meetings: GroupMeeting[];
  jamiiPayouts: JamiiPayout[];
  isAdmin: boolean;
  actorUid: string;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMeetingIcs(meeting: GroupMeeting) {
  const compactDate = meeting.meetingDate.replace(/-/g, '');
  const start = `${compactDate}T150000`;
  const end = `${compactDate}T170000`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tujenge Hub VICOBA//EN',
    'BEGIN:VEVENT',
    `UID:${meeting.id}@tujengehub`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${meeting.quarterLabel}: ${meeting.title}`,
    `LOCATION:${meeting.location}`,
    `DESCRIPTION:${meeting.agenda.replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meeting.quarterLabel.toLowerCase().replace(/\s+/g, '-')}-meeting.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MeetingsReportsView({
  group,
  members,
  payments,
  loans,
  meetings,
  jamiiPayouts,
  isAdmin,
  actorUid,
}: MeetingsReportsViewProps) {
  const { t } = useLang();

  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [title, setTitle] = useState('');
  const [quarterLabel, setQuarterLabel] = useState('Q4 2027');
  const [meetingDate, setMeetingDate] = useState('2027-11-28');
  const [meetingTime, setMeetingTime] = useState('15:00 EAT');
  const [location, setLocation] = useState('Sinza Community Hall & WhatsApp Video');
  const [agenda, setAgenda] = useState(
    'Review every member share report, total group pool collected, Jamii fund, and loan repayments.'
  );
  const [savingMeeting, setSavingMeeting] = useState(false);

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);

  // Dividend (Share-Out) calculator controls
  const [dividendBasis, setDividendBasis] = useState<'projected' | 'realized'>('projected');
  const [extraProfitTsh, setExtraProfitTsh] = useState<number>(0);

  const validPayments = useMemo(
    () => payments.filter((p) => p.status !== 'reversed'),
    [payments]
  );

  // Calendar Month Picker (defaults to next scheduled meeting's month or current month)
  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort((a, b) => a.meetingDate.localeCompare(b.meetingDate)),
    [meetings]
  );

  const upcomingMeeting = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (
      sortedMeetings.find((m) => m.status === 'scheduled' && m.meetingDate >= today) ||
      sortedMeetings[0] ||
      null
    );
  }, [sortedMeetings]);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (upcomingMeeting?.meetingDate) return upcomingMeeting.meetingDate.slice(0, 7);
    return new Date().toISOString().slice(0, 7);
  });

  const sundayInfo = useMemo(() => getNextSundayInfo(), []);

  // Contribution aggregates across all members
  const reportTotals = useMemo(() => {
    const totalHisaShares = members.reduce((s, m) => s + Number(m.totalShares || 0), 0);
    const totalHisaTsh = members.reduce((s, m) => s + Number(m.totalSavedTsh || 0), 0);
    const totalJamiiCollectedTsh = members.reduce(
      (s, m) => s + Number(m.socialFundTsh || 0),
      0
    );
    const payoutsSum = jamiiPayouts.reduce((s, p) => s + Number(p.amountTsh || 0), 0);
    const totalJamiiPaidOutTsh = Math.max(
      Number(group?.totalJamiiOutTsh || 0),
      payoutsSum
    );
    const remainingJamiiTsh = Math.max(0, totalJamiiCollectedTsh - totalJamiiPaidOutTsh);

    const totalLoanRepaidTsh = members.reduce(
      (s, m) => s + Number(m.totalLoanRepaidTsh || 0),
      0
    );
    const totalActiveLoansTsh = members.reduce(
      (s, m) => s + Number(m.activeLoanBalanceTsh || 0),
      0
    );
    const totalFinesTsh = members.reduce((s, m) => s + Number(m.totalFinesTsh || 0), 0);
    const totalCollectedAllTsh =
      totalHisaTsh + totalJamiiCollectedTsh + totalLoanRepaidTsh + totalFinesTsh;

    return {
      totalHisaShares,
      totalHisaTsh,
      totalJamiiCollectedTsh,
      totalJamiiPaidOutTsh,
      remainingJamiiTsh,
      totalLoanRepaidTsh,
      totalActiveLoansTsh,
      totalFinesTsh,
      totalCollectedAllTsh,
    };
  }, [members, jamiiPayouts, group?.totalJamiiOutTsh]);

  // Dividend (Share-Out) computation
  const dividendSummary = useMemo(() => {
    const eligibleLoans = loans.filter((l) => l.status === 'active' || l.status === 'paid');
    const realizedLoanInterestTsh = eligibleLoans.reduce((sum, l) => {
      if (l.status === 'paid') {
        return sum + Number(l.interestTsh || 0);
      }
      const totalDue = Math.max(1, Number(l.totalDueTsh || 0));
      const repaidRatio = Math.min(1, Number(l.repaidTsh || 0) / totalDue);
      return sum + Math.round(Number(l.interestTsh || 0) * repaidRatio);
    }, 0);

    const projectedLoanInterestTsh = eligibleLoans.reduce(
      (sum, l) => sum + Number(l.interestTsh || 0),
      0
    );

    const interestPoolTsh =
      dividendBasis === 'realized' ? realizedLoanInterestTsh : projectedLoanInterestTsh;
    const cleanExtra = Math.max(0, Math.round(extraProfitTsh || 0));
    const distributableProfitTsh =
      interestPoolTsh + reportTotals.totalFinesTsh + cleanExtra;

    const totalHisaTsh = reportTotals.totalHisaTsh;
    const totalShares = reportTotals.totalHisaShares;
    const sharePriceTsh = Number(group?.sharePriceTsh || 10000);
    const useHisaTshWeight = totalHisaTsh > 0;
    const weightDenominator = useHisaTshWeight ? totalHisaTsh : totalShares;

    const profitPerShareTsh =
      totalHisaTsh > 0
        ? Math.round((distributableProfitTsh * sharePriceTsh) / totalHisaTsh)
        : totalShares > 0
        ? Math.round(distributableProfitTsh / totalShares)
        : 0;

    const rawAllocations = members.map((m) => {
      const ownHisaTsh = Number(m.totalSavedTsh || 0);
      const weight = useHisaTshWeight ? ownHisaTsh : Number(m.totalShares || 0);
      const ratio = weightDenominator > 0 ? weight / weightDenominator : 0;
      const exactDividend = distributableProfitTsh * ratio;
      const floorDividend = Math.floor(exactDividend);
      return {
        member: m,
        ownHisaTsh,
        ratio,
        floorDividend,
        remainder: exactDividend - floorDividend,
      };
    });

    const totalFloored = rawAllocations.reduce((s, r) => s + r.floorDividend, 0);
    const remainingTsh =
      weightDenominator > 0 ? Math.max(0, distributableProfitTsh - totalFloored) : 0;
    const bonusIndices = new Set(
      rawAllocations
        .map((r, idx) => ({ idx, remainder: r.remainder }))
        .sort((a, b) => b.remainder - a.remainder)
        .slice(0, remainingTsh)
        .map((item) => item.idx)
    );

    const memberPayouts = rawAllocations.map((r, idx) => {
      const dividendTsh = r.floorDividend + (bonusIndices.has(idx) ? 1 : 0);
      const sharePct = (r.ratio * 100).toFixed(1);
      const totalProjectedPayoutTsh = r.ownHisaTsh + dividendTsh;
      return {
        member: r.member,
        sharePct,
        ownHisaTsh: r.ownHisaTsh,
        dividendTsh,
        totalProjectedPayoutTsh,
      };
    });

    return {
      realizedLoanInterestTsh,
      projectedLoanInterestTsh,
      interestPoolTsh,
      distributableProfitTsh,
      profitPerShareTsh,
      memberPayouts,
    };
  }, [
    loans,
    dividendBasis,
    extraProfitTsh,
    reportTotals.totalFinesTsh,
    reportTotals.totalHisaTsh,
    reportTotals.totalHisaShares,
    group?.sharePriceTsh,
    members,
  ]);

  const sortedPayouts = useMemo(() => {
    return [...jamiiPayouts].sort((a, b) => b.payoutDate.localeCompare(a.payoutDate));
  }, [jamiiPayouts]);

  // Calendar grid for selected YYYY-MM
  const calendarDays = useMemo(() => {
    const [yr, mo] = calendarMonth.split('-').map(Number);
    if (!yr || !mo) return [];
    const first = new Date(yr, mo - 1, 1);
    const startOffset = first.getDay(); // 0 = Sun
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const cells: {
      day: number | null;
      dateStr: string;
      isSunday: boolean;
      meeting?: GroupMeeting;
    }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, dateStr: `pad-${i}`, isSunday: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(yr, mo - 1, d).getDay();
      const mtg = sortedMeetings.find((m) => m.meetingDate === dateStr);
      cells.push({ day: d, dateStr, isSunday: dow === 0, meeting: mtg });
    }
    return cells;
  }, [calendarMonth, sortedMeetings]);

  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !meetingDate) return;
    setSavingMeeting(true);
    try {
      await addGroupMeeting({
        adminUid: actorUid,
        title: title.trim(),
        quarterLabel: quarterLabel.trim(),
        meetingDate,
        meetingTime: meetingTime.trim(),
        location: location.trim(),
        agenda: agenda.trim(),
        memberCount: group?.memberCount ?? members.length,
      });
      setTitle('');
      setShowAddMeeting(false);
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleSendReminder = async (meeting: GroupMeeting) => {
    setSendingReminderId(meeting.id);
    try {
      await sendMeetingReminderBroadcast({
        senderUid: actorUid,
        meeting,
        memberCount: group?.memberCount ?? members.length,
      });
      setReminderSentId(meeting.id);
      setTimeout(() => setReminderSentId(null), 2500);
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Member Number',
      'Full Name',
      'Shares (Hisa)',
      'Total Hisa (TSH)',
      'Total Jamii (TSH)',
      'Loan Repaid (TSH)',
      'Active Loan Balance (TSH)',
      'Fines Paid (TSH)',
      'Total Collected (TSH)',
    ];
    const rows = members.map((m) => {
      const memberTotal =
        Number(m.totalSavedTsh || 0) +
        Number(m.socialFundTsh || 0) +
        Number(m.totalLoanRepaidTsh || 0) +
        Number(m.totalFinesTsh || 0);
      return [
        m.memberNumber,
        m.fullName,
        String(m.totalShares),
        String(m.totalSavedTsh),
        String(m.socialFundTsh),
        String(m.totalLoanRepaidTsh || 0),
        String(m.activeLoanBalanceTsh),
        String(m.totalFinesTsh || 0),
        String(memberTotal),
      ];
    });
    rows.push([
      'TOTAL',
      `${members.length} Members`,
      String(reportTotals.totalHisaShares),
      String(reportTotals.totalHisaTsh),
      String(reportTotals.totalJamiiCollectedTsh),
      String(reportTotals.totalLoanRepaidTsh),
      String(reportTotals.totalActiveLoansTsh),
      String(reportTotals.totalFinesTsh),
      String(reportTotals.totalCollectedAllTsh),
    ]);
    downloadCsv(`tujenge-hub-quarterly-report-${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  const handleExportDividendCsv = () => {
    const headers = [
      'Member Number',
      'Full Name',
      'Shares',
      'Share %',
      'Own Hisa (TSH)',
      'Dividend Share (TSH)',
      'Total Projected Payout (TSH)',
    ];
    const rows = dividendSummary.memberPayouts.map((row) => [
      row.member.memberNumber,
      row.member.fullName,
      String(row.member.totalShares),
      `${row.sharePct}%`,
      String(row.ownHisaTsh),
      String(row.dividendTsh),
      String(row.totalProjectedPayoutTsh),
    ]);
    rows.push([
      'TOTAL',
      `${members.length} Members`,
      String(reportTotals.totalHisaShares),
      '100.0%',
      String(reportTotals.totalHisaTsh),
      String(dividendSummary.distributableProfitTsh),
      String(reportTotals.totalHisaTsh + dividendSummary.distributableProfitTsh),
    ]);
    downloadCsv(`tujenge-hub-shareout-${new Date().toISOString().slice(0, 10)}.csv`, [
      headers,
      ...rows,
    ]);
  };

  const daysUntilMeeting = upcomingMeeting
    ? Math.max(
        0,
        Math.ceil(
          (new Date(upcomingMeeting.meetingDate).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : null;

  const sundayWhatsAppText = t(
    `Tujenge Hub VICOBA Sunday Reminder: Weekly contribution is due by Sunday (${sundayInfo.dateStr}). Minimum is 12,000 TSH (10,000 Hisa + 2,000 Jamii; extra goes to Hisa). Missing Sunday incurs a 5,000 TSH fine.`,
    `Ukumbusho wa Jumapili Tujenge Hub VICOBA: Mchango wa wiki unatakiwa kufika Jumapili (${sundayInfo.dateStr}). Kiwango cha chini ni 12,000 TSH (10,000 Hisa + 2,000 Jamii; ziada inaongeza Hisa). Kukosa Jumapili kuna faini ya 5,000 TSH.`
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5DEC9] pb-5">
        <div>
          <div className="text-xs font-medium text-[#165432]">
            {t(
              'Quarterly 3-Month Meetings & Contribution Reports',
              'Mikutano ya Kila Miezi 3 na Ripoti za Michango'
            )}
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#17231C]">
            {t(
              'Group Calendar, Reminders & Share Reports',
              'Kalenda ya Kikundi, Vikumbusho na Ripoti za Hisa'
            )}
          </h1>
          <p className="mt-1 text-sm text-[#4B5850] max-w-2xl">
            {t(
              'Meetings take place every 3 months with full share reports for each member, Jamii emergency payouts, projected share-outs, and total collections.',
              'Mikutano hufanyika kila baada ya miezi 3 ikiwa na ripoti za Hisa kwa kila mwanachama, malipo ya dharura ya Jamii, makadirio ya gawio, na jumla ya makusanyo.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-[#DDD4BE] bg-white px-4 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] transition-colors whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-[#165432]" aria-hidden="true" />
            {t('Export Report CSV', 'Pakua Ripoti CSV')}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddMeeting(!showAddMeeting)}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-4 py-2 text-xs font-semibold text-white hover:bg-[#114226] transition-colors whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {showAddMeeting
                ? t('Close Form', 'Funga Fomu')
                : t('Schedule Meeting', 'Panga Mkutano')}
            </button>
          )}
        </div>
      </div>

      {/* Automated Reminders Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#C6DFCF] bg-white p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#165432]">
              {t(
                'Automated Quarterly Meeting Reminder',
                'Ukumbusho wa Mkutano wa Kila Miezi 3'
              )}
            </span>
            <span className="font-mono tabular-nums text-[#55635A]">
              {t('Every 3 Months', 'Kila Miezi 3')}
            </span>
          </div>
          {upcomingMeeting ? (
            <>
              <div className="font-display text-base font-bold text-[#17231C]">
                {upcomingMeeting.quarterLabel} · {upcomingMeeting.title}
              </div>
              <p className="text-xs text-[#4B5850]">
                {t('Scheduled for', 'Imepangwa tarehe')}{' '}
                <strong className="font-mono">{upcomingMeeting.meetingDate}</strong>{' '}
                {t('at', 'saa')}{' '}
                <strong className="font-mono">{upcomingMeeting.meetingTime}</strong> (
                {upcomingMeeting.location}).
                {daysUntilMeeting !== null && (
                  <>
                    {' '}
                    <span className="font-mono font-semibold text-[#165432]">
                      {daysUntilMeeting === 0
                        ? t('Meeting is today!', 'Mkutano ni leo!')
                        : t(
                            `${daysUntilMeeting} days remaining.`,
                            `Siku ${daysUntilMeeting} zimebaki.`
                          )}
                    </span>
                  </>
                )}
              </p>
              <a
                href={buildWhatsAppUrl(
                  t(
                    `Tujenge Hub VICOBA Quarterly Meeting Reminder (${upcomingMeeting.quarterLabel}): ${upcomingMeeting.title} on ${upcomingMeeting.meetingDate} at ${upcomingMeeting.meetingTime} (${upcomingMeeting.location}). Member share reports and dividends will be reviewed.`,
                    `Ukumbusho wa Mkutano wa Miezi 3 Tujenge Hub (${upcomingMeeting.quarterLabel}): ${upcomingMeeting.title} tarehe ${upcomingMeeting.meetingDate} saa ${upcomingMeeting.meetingTime} (${upcomingMeeting.location}). Ripoti za Hisa na gawio zitapitiwa.`
                  )
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3.5 py-2 text-xs font-semibold text-[#114226] hover:bg-[#DCE9E0] transition-colors whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('Share Meeting on WhatsApp', 'Tuma Mkutano WhatsApp')}
              </a>
            </>
          ) : (
            <p className="text-xs text-[#55635A]">
              {t(
                'No upcoming quarterly meeting scheduled yet.',
                'Hakuna mkutano ujao uliopangwa bado.'
              )}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#ECD6AE] bg-[#FBF0DA]/60 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#17231C]">
              {t(
                'Automated Sunday Payment Reminder',
                'Ukumbusho wa Malipo ya Jumapili'
              )}
            </span>
            <span className="font-mono tabular-nums text-[#9A4E0B] font-semibold">
              {t('5,000 TSH Late Fine', 'Faini 5,000 TSH')}
            </span>
          </div>
          <div className="font-display text-base font-bold text-[#17231C]">
            {sundayInfo.isTodaySunday
              ? t(
                  'Today is Sunday — Weekly Contribution Due',
                  'Leo ni Jumapili — Mchango wa Wiki Unatakiwa'
                )
              : t(
                  `Next Sunday Due: ${sundayInfo.dateStr} (${sundayInfo.daysUntil} days)`,
                  `Jumapili Ijayo: ${sundayInfo.dateStr} (siku ${sundayInfo.daysUntil})`
                )}
          </div>
          <p className="text-xs text-[#4B5850]">
            {t(
              'Minimum weekly share is 12,000 TSH (10,000 Hisa + 2,000 Jamii), and members can pay above that. Missing Sunday results in a 5,000 TSH fine.',
              'Kiwango cha chini cha wiki ni 12,000 TSH (10,000 Hisa + 2,000 Jamii), na mwanachama anaweza kulipa zaidi. Kukosa Jumapili kuna faini ya 5,000 TSH.'
            )}
          </p>
          <a
            href={buildWhatsAppUrl(sundayWhatsAppText)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#DDD4BE] bg-white px-3.5 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] transition-colors whitespace-nowrap"
          >
            <MessageCircle className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
            {t('Share Sunday Reminder on WhatsApp', 'Tuma Ukumbusho WhatsApp')}
          </a>
        </div>
      </section>

      {/* Admin Schedule Meeting Form */}
      {isAdmin && showAddMeeting && (
        <form
          onSubmit={handleAddMeeting}
          className="rounded-2xl border border-[#E5DEC9] bg-white p-5 sm:p-6 space-y-4"
        >
          <h2 className="font-display text-base font-bold text-[#17231C]">
            {t('Schedule Quarterly Group Meeting', 'Panga Mkutano wa Kila Miezi 3')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="mtg-title" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Meeting Title', 'Kichwa cha Mkutano')}
              </label>
              <input
                id="mtg-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 2027 Annual Share-Out"
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="mtg-quarter" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Quarter Label', 'Robo Mwaka')}
              </label>
              <input
                id="mtg-quarter"
                type="text"
                required
                value={quarterLabel}
                onChange={(e) => setQuarterLabel(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="mtg-date" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Date (Sunday)', 'Tarehe (Jumapili)')}
              </label>
              <input
                id="mtg-date"
                type="date"
                required
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="mtg-time" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Time', 'Muda')}
              </label>
              <input
                id="mtg-time"
                type="text"
                required
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 font-mono text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="mtg-loc" className="block text-xs font-medium text-[#37463D] mb-1.5">
                {t('Location / Video Link', 'Mahali / Kiungo cha Video')}
              </label>
              <input
                id="mtg-loc"
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mtg-agenda" className="block text-xs font-medium text-[#37463D] mb-1.5">
              {t('Meeting Agenda', 'Ajenda ya Mkutano')}
            </label>
            <textarea
              id="mtg-agenda"
              rows={2}
              required
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              className="w-full rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2 text-sm text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={savingMeeting}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#165432] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60"
          >
            {savingMeeting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('Save Meeting & Notify Group', 'Hifadhi Mkutano na Arifu Kikundi')}
          </button>
        </form>
      )}

      {/* Total Amount Collected Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5">
          <div className="text-xs text-[#55635A]">
            {t('Total Collected (All Members)', 'Jumla Iliyokusanywa')}
          </div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tabular-nums text-[#165432]">
            {formatTsh(reportTotals.totalCollectedAllTsh)}
          </div>
          <div className="mt-1 text-[11px] text-[#55635A]">
            Hisa + Jamii + {t('Loan Repay', 'Marejesho')} + {t('Fines', 'Faini')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5">
          <div className="text-xs text-[#55635A]">
            {t('Total Member Hisa', 'Jumla ya Hisa')}
          </div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tabular-nums text-[#17231C]">
            {formatTsh(reportTotals.totalHisaTsh)}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#55635A]">
            {reportTotals.totalHisaShares} {t('Shares total', 'Hisa jumla')}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5">
          <div className="text-xs text-[#55635A]">
            {t('Remaining Jamii Balance', 'Salio la Mfuko wa Jamii')}
          </div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tabular-nums text-[#17231C]">
            {formatTsh(reportTotals.remainingJamiiTsh)}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#55635A]">
            {t('In', 'Ndani')}: {formatTsh(reportTotals.totalJamiiCollectedTsh)} · {t('Out', 'Nje')}:{' '}
            {formatTsh(reportTotals.totalJamiiPaidOutTsh)}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5DEC9] bg-white p-4 sm:p-5">
          <div className="text-xs text-[#55635A]">
            {t('Loan Repayments Collected', 'Marejesho ya Mikopo')}
          </div>
          <div className="mt-1 font-mono text-xl sm:text-2xl font-bold tabular-nums text-[#17231C]">
            {formatTsh(reportTotals.totalLoanRepaidTsh)}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-[#9A4E0B]">
            {t('Active Out', 'Mikopo Iliyo Nje')}: {formatTsh(reportTotals.totalActiveLoansTsh)}
          </div>
        </div>
      </section>

      {/* Group Calendar + Quarterly Meeting List */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 rounded-2xl border border-[#E5DEC9] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#165432]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[#17231C]">
                {t('Group Meeting Calendar', 'Kalenda ya Mikutano')}
              </h2>
            </div>
            <input
              type="month"
              aria-label="Select calendar month"
              value={calendarMonth}
              onChange={(e) => setCalendarMonth(e.target.value)}
              className="rounded-lg border border-[#DDD4BE] bg-[#FAF7F0] px-2.5 py-1.5 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[#55635A]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs">
            {calendarDays.map((cell) => {
              if (cell.day === null) {
                return <div key={cell.dateStr} className="h-10" />;
              }
              return (
                <div
                  key={cell.dateStr}
                  title={
                    cell.meeting
                      ? `${cell.meeting.quarterLabel}: ${cell.meeting.title}`
                      : cell.isSunday
                        ? 'Weekly Sunday Contribution Due (12,000 TSH min)'
                        : undefined
                  }
                  className={`h-10 rounded-lg flex flex-col items-center justify-center font-mono tabular-nums border ${
                    cell.meeting
                      ? 'bg-[#165432] text-white border-[#165432] font-bold'
                      : cell.isSunday
                        ? 'bg-[#E8F1EB] text-[#114226] border-[#C6DFCF] font-semibold'
                        : 'bg-white text-[#37463D] border-[#EFEAE0]'
                  }`}
                >
                  <span>{cell.day}</span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#EFEAE0] flex flex-wrap items-center gap-4 text-[11px] text-[#4B5850]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-[#165432]" />
              {t('Quarterly Meeting', 'Mkutano wa Miezi 3')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded bg-[#E8F1EB] border border-[#C6DFCF]" />
              {t('Sunday Weekly Due (12k+)', 'Jumapili Mchango (12k+)')}
            </span>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5DEC9] flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-[#17231C]">
              {t('3-Month Quarterly Meeting Schedule', 'Ratiba ya Mikutano ya Kila Miezi 3')}
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#55635A]">
              {sortedMeetings.length} {t('meetings', 'mikutano')}
            </span>
          </div>

          {sortedMeetings.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#55635A]">
              {t(
                'Quarterly meetings will appear once initialized by Admin.',
                'Mikutano ya robo mwaka itaonekana ikishaanzishwa na Msimamizi.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE0]">
              {sortedMeetings.map((mtg) => (
                <div key={mtg.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-[#165432]">
                        {mtg.quarterLabel} · {mtg.meetingDate} · {mtg.meetingTime} ·{' '}
                        {mtg.status === 'completed'
                          ? t('Completed', 'Umefanyika')
                          : t('Scheduled', 'Umepangwa')}
                      </div>
                      <h3 className="mt-0.5 font-display text-base font-bold text-[#17231C]">
                        {mtg.title}
                      </h3>
                      <div className="text-xs text-[#55635A] mt-0.5">
                        {t('Location', 'Mahali')}: {mtg.location}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-[#4B5850]">
                    {mtg.agenda}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarMonth(mtg.meetingDate.slice(0, 7));
                        downloadMeetingIcs(mtg);
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4BE] bg-white px-3 py-1.5 text-xs font-medium text-[#37463D] hover:bg-[#FAF7F0]"
                    >
                      <Calendar className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
                      {t('Add to Calendar (.ics)', 'Weka kwenye Kalenda (.ics)')}
                    </button>

                    <a
                      href={buildWhatsAppUrl(
                        `Tujenge Hub VICOBA (${mtg.quarterLabel}): ${mtg.title} on ${mtg.meetingDate} at ${mtg.meetingTime} · ${mtg.location}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#C6DFCF] bg-[#E8F1EB] px-3 py-1.5 text-xs font-medium text-[#114226] hover:bg-[#DCE9E0]"
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      WhatsApp
                    </a>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          disabled={sendingReminderId === mtg.id}
                          onClick={() => handleSendReminder(mtg)}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[#165432] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#114226] disabled:opacity-60"
                        >
                          {sendingReminderId === mtg.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : reminderSentId === mtg.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <BellRing className="h-3.5 w-3.5" />
                          )}
                          {reminderSentId === mtg.id
                            ? t('Reminder Sent', 'Ukumbusho Umetumwa')
                            : t('Send Reminder Now', 'Tuma Ukumbusho Sasa')}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleMeetingStatus(mtg)}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-1.5 text-xs font-medium text-[#37463D] hover:bg-[#EFEAE0]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {mtg.status === 'completed'
                            ? t('Mark Scheduled', 'Rudisha Ratiba')
                            : t('Mark Completed', 'Weka Umekamilika')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quarterly / End-of-Cycle Dividend (Share-Out) Calculator */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5DEC9] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <TrendingUp className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t(
                  'Quarterly / End-of-Cycle Dividend (Share-Out) Calculator',
                  'Kikokotoo cha Gawio la Robo Mwaka / Mwisho wa Mzunguko'
                )}
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  'Distributes loan interest earned plus collected fines proportionally by each member’s exact Hisa contribution (TSH).',
                  'Hugawanya riba ya mikopo na faini zilizokusanywa kulingana na mchango halisi wa Hisa (TSH) wa kila mwanachama.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-[#EAE2D0] p-1">
              <button
                type="button"
                onClick={() => setDividendBasis('projected')}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  dividendBasis === 'projected'
                    ? 'bg-white text-[#17231C] shadow-sm'
                    : 'text-[#4B5850] hover:text-[#17231C]'
                }`}
              >
                {t('Projected Full Cycle', 'Makadirio Kamili')}
              </button>
              <button
                type="button"
                onClick={() => setDividendBasis('realized')}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  dividendBasis === 'realized'
                    ? 'bg-white text-[#17231C] shadow-sm'
                    : 'text-[#4B5850] hover:text-[#17231C]'
                }`}
              >
                {t('Realized Cash Now', 'Taslimu Iliyopo Sasa')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportDividendCsv}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#DDD4BE] bg-white px-3 py-1.5 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
              {t('Share-Out CSV', 'Pakua Gawio CSV')}
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#FAF7F0] border-b border-[#E5DEC9]">
          <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5">
            <div className="text-[11px] text-[#55635A]">
              {t('Loan Interest Pool', 'Riba ya Mikopo')}
            </div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#165432]">
              {formatTsh(dividendSummary.interestPoolTsh)}
            </div>
            <div className="text-[11px] text-[#8A948D] mt-0.5">
              {dividendBasis === 'realized'
                ? t('Proportional to repaid loans', 'Kutokana na marejesho halisi')
                : t('Includes active + paid loans', 'Mikopo hai + iliyolipwa')}
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5">
            <div className="text-[11px] text-[#55635A]">
              {t('Sunday Fines Collected', 'Faini Zilizokusanywa')}
            </div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#17231C]">
              {formatTsh(reportTotals.totalFinesTsh)}
            </div>
            <div className="text-[11px] text-[#8A948D] mt-0.5">
              {t('Added to group profit pool', 'Inaongezwa kwenye faida')}
            </div>
          </div>

          <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5">
            <label htmlFor="extra-profit-input" className="block text-[11px] text-[#55635A]">
              {t('Other Group Income (TSH)', 'Mapato Mengine (TSH)')}
            </label>
            <input
              id="extra-profit-input"
              type="number"
              min={0}
              step={1000}
              value={extraProfitTsh}
              onChange={(e) => setExtraProfitTsh(Math.max(0, Number(e.target.value) || 0))}
              className="mt-1 w-full rounded-lg border border-[#DDD4BE] bg-[#FAF7F0] px-2.5 py-1 font-mono text-sm font-semibold text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] p-3.5">
            <div className="text-[11px] font-medium text-[#114226]">
              {t('Total Profit & Per-Share Bonus', 'Jumla ya Faida & Kila Hisa')}
            </div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-[#114226]">
              {formatTsh(dividendSummary.distributableProfitTsh)}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-[#165432] mt-0.5">
              +{formatTsh(dividendSummary.profitPerShareTsh)} / {formatTsh(group?.sharePriceTsh || 10000)} {t('Hisa', 'Hisa')}
            </div>
          </div>
        </div>

        {/* Mobile Dividend Cards (< md) */}
        <div className="md:hidden divide-y divide-[#EFEAE0]">
          {dividendSummary.memberPayouts.map((row) => (
            <div key={row.member.id} className="p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-[#165432] mr-1.5">
                    {row.member.memberNumber}
                  </span>
                  <span className="font-semibold text-[#17231C]">{row.member.fullName}</span>
                </div>
                <span className="font-mono font-semibold text-[#4B5850]">
                  {row.member.totalShares} sh ({row.sharePct}%)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#FAF7F0] p-2.5">
                <div>
                  <span className="block text-[10px] text-[#55635A]">{t('Own Hisa', 'Hisa Zake')}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                    {formatTsh(row.ownHisaTsh)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#55635A]">{t('Dividend', 'Gawio')}</span>
                  <span className="font-mono font-semibold tabular-nums text-[#165432]">
                    +{formatTsh(row.dividendTsh)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-[#55635A]">{t('Payout', 'Jumla')}</span>
                  <span className="font-mono font-bold tabular-nums text-[#17231C]">
                    {formatTsh(row.totalProjectedPayoutTsh)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Dividend Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5DEC9] bg-[#FAF7F0] text-[11px] font-semibold text-[#4B5850]">
                <th className="py-3 px-4">{t('Member No.', 'Namba')}</th>
                <th className="py-3 px-4">{t('Name', 'Jina')}</th>
                <th className="py-3 px-4 text-right">{t('Shares', 'Hisa')}</th>
                <th className="py-3 px-4 text-right">{t('Hisa %', '% ya Hisa')}</th>
                <th className="py-3 px-4 text-right">{t('Own Hisa', 'Akiba ya Hisa')}</th>
                <th className="py-3 px-4 text-right">{t('Dividend Share', 'Gawio la Faida')}</th>
                <th className="py-3 px-4 text-right">{t('Projected Payout', 'Jumla ya Malipo')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0] text-xs">
              {dividendSummary.memberPayouts.map((row) => (
                <tr key={row.member.id} className="hover:bg-[#FAF7F0]">
                  <td className="py-3 px-4 font-mono font-semibold text-[#165432] whitespace-nowrap">
                    {row.member.memberNumber}
                  </td>
                  <td className="py-3 px-4 font-medium text-[#17231C] whitespace-nowrap">
                    {row.member.fullName}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#17231C]">
                    {row.member.totalShares}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#4B5850]">
                    {row.sharePct}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#17231C] whitespace-nowrap">
                    {formatTsh(row.ownHisaTsh)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#165432] whitespace-nowrap">
                    +{formatTsh(row.dividendTsh)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-[#17231C] whitespace-nowrap">
                    {formatTsh(row.totalProjectedPayoutTsh)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Jamii Emergency Fund Payout Log */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5DEC9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <HeartHandshake className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t(
                  'Jamii Emergency Fund Balance & Payout Log',
                  'Salio la Mfuko wa Jamii na Kumbukumbu za Misaada'
                )}
              </h2>
              <p className="text-xs text-[#55635A]">
                {t(
                  'Transparent log of every Jamii solidarity disbursement for illness, bereavement, or family emergencies.',
                  'Orodha ya uwazi ya kila malipo ya Jamii kwa ugonjwa, msiba, au dharura za kifamilia.'
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
            <span className="text-[#4B5850]">
              {t('Collected', 'Imekusanywa')}:{' '}
              <strong className="text-[#17231C]">{formatTsh(reportTotals.totalJamiiCollectedTsh)}</strong>
            </span>
            <span className="text-[#9A4E0B]">
              {t('Paid Out', 'Imetolewa')}:{' '}
              <strong>{formatTsh(reportTotals.totalJamiiPaidOutTsh)}</strong>
            </span>
            <span className="text-[#165432]">
              {t('Balance', 'Salio')}:{' '}
              <strong>{formatTsh(reportTotals.remainingJamiiTsh)}</strong>
            </span>
          </div>
        </div>

        {sortedPayouts.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#55635A]">
            {t(
              'No Jamii emergency disbursements recorded yet. Remaining Jamii balance is 100% intact.',
              'Hakuna malipo ya dharura ya Jamii yaliyorekodiwa bado. Salio lote lipo salama.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#EFEAE0]">
            {sortedPayouts.map((p) => (
              <div
                key={p.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-[#17231C]">
                    <span className="font-mono text-[#165432] mr-1.5">{p.memberNumber}</span>
                    {p.memberName} · <span className="text-[#37463D]">{p.reason}</span>
                  </div>
                  <div className="text-[#55635A]">
                    {p.payoutDate} · {p.notes}
                  </div>
                </div>
                <div className="font-mono font-bold tabular-nums text-[#9A4E0B] whitespace-nowrap">
                  -{formatTsh(p.amountTsh)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quarterly Report: Share of Every Member & Individual Contributions */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5DEC9] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t(
                'Member-by-Member Share & Contribution Report',
                'Ripoti ya Hisa na Michango ya Kila Mwanachama'
              )}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                `Individual Hisa shares, Jamii, loan repayments, and share % for quarterly meeting review (${validPayments.length} confirmed payments).`,
                `Hisa za kila mwanachama, Jamii, marejesho ya mkopo, na % ya Hisa (${validPayments.length} miamala iliyothibitishwa).`
              )}
            </p>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-[#165432]">
            {t('Total Pool', 'Jumla ya Mfuko')}: {formatTsh(reportTotals.totalCollectedAllTsh)}
          </span>
        </div>

        {/* Mobile Card Stack (< md) */}
        <div className="md:hidden divide-y divide-[#EFEAE0]">
          {members.map((m) => {
            const sharePct =
              reportTotals.totalHisaShares > 0
                ? ((m.totalShares / reportTotals.totalHisaShares) * 100).toFixed(1)
                : '0.0';
            const memberCollected =
              Number(m.totalSavedTsh || 0) +
              Number(m.socialFundTsh || 0) +
              Number(m.totalLoanRepaidTsh || 0) +
              Number(m.totalFinesTsh || 0);
            return (
              <div key={m.id} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-[#165432] mr-1.5">
                      {m.memberNumber}
                    </span>
                    <span className="font-semibold text-[#17231C]">{m.fullName}</span>
                  </div>
                  <span className="font-mono font-semibold tabular-nums text-[#37463D]">
                    {sharePct}% {t('of Hisa', 'ya Hisa')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#FAF7F0] p-3">
                  <div>
                    <span className="text-[#55635A] block">
                      Hisa ({m.totalShares} {t('sh', 'hisa')})
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                      {formatTsh(m.totalSavedTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">Jamii</span>
                    <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                      {formatTsh(m.socialFundTsh)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">{t('Loan Repaid', 'Mkopo Uliorejeshwa')}</span>
                    <span className="font-mono font-semibold tabular-nums text-[#165432]">
                      {formatTsh(m.totalLoanRepaidTsh || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#55635A] block">{t('Total Collected', 'Jumla')}</span>
                    <span className="font-mono font-bold tabular-nums text-[#17231C]">
                      {formatTsh(memberCollected)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tablet & Desktop Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E5DEC9] bg-[#FAF7F0] text-[11px] font-semibold text-[#4B5850]">
                <th className="py-3 px-4">{t('Member No.', 'Namba')}</th>
                <th className="py-3 px-4">{t('Name', 'Jina')}</th>
                <th className="py-3 px-4 text-right">{t('Shares', 'Hisa')}</th>
                <th className="py-3 px-4 text-right">Hisa (TSH)</th>
                <th className="py-3 px-4 text-right">Jamii (TSH)</th>
                <th className="py-3 px-4 text-right">{t('Loan Repaid', 'Mkopo Uliolipwa')}</th>
                <th className="py-3 px-4 text-right">{t('Loan Left', 'Salio la Mkopo')}</th>
                <th className="py-3 px-4 text-right">{t('Total Collected', 'Jumla Iliyokusanywa')}</th>
                <th className="py-3 px-4 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0] text-xs">
              {members.map((m) => {
                const sharePct =
                  reportTotals.totalHisaShares > 0
                    ? ((m.totalShares / reportTotals.totalHisaShares) * 100).toFixed(1)
                    : '0.0';
                const memberCollected =
                  Number(m.totalSavedTsh || 0) +
                  Number(m.socialFundTsh || 0) +
                  Number(m.totalLoanRepaidTsh || 0) +
                  Number(m.totalFinesTsh || 0);
                return (
                  <tr key={m.id} className="hover:bg-[#FAF7F0]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#165432] whitespace-nowrap">
                      {m.memberNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#17231C] whitespace-nowrap">
                      {m.fullName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#17231C]">
                      {m.totalShares}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#17231C] whitespace-nowrap">
                      {formatTsh(m.totalSavedTsh)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#4B5850] whitespace-nowrap">
                      {formatTsh(m.socialFundTsh)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#165432] whitespace-nowrap">
                      {formatTsh(m.totalLoanRepaidTsh || 0)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9A4E0B] whitespace-nowrap">
                      {formatTsh(m.activeLoanBalanceTsh)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#17231C] whitespace-nowrap">
                      {formatTsh(memberCollected)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#4B5850]">
                      {sharePct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
