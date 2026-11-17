import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  Play,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';


import { useLang } from '../lib/i18n';
import { SAMPLE_PAYMENT_SMS, parseMobileMoneySms } from '../lib/smsParser';
import { buildWhatsAppUrl, formatTsh, normalizeTzPhone } from '../types/vicoba';

interface SchedulerRunLog {
  id: string;
  type: 'sunday_morning' | 'sunday_rollcall' | 'quarterly_meeting' | 'manual_test';
  triggeredAtIso: string;
  eatTimeLabel: string;
  summary: string;
  webhookStatus: 'not_configured' | 'dispatched' | 'failed';
}

interface SchedulerStatusResponse {
  eatNow: {
    dateStr: string;
    weekday: string;
    hour: number;
    minute: number;
    label: string;
  };
  config: {
    enabled: boolean;
    sundayHourEat: number;
    sundayMinuteEat: number;
    eveningRollCallHourEat: number;
    nextMeetingTitle: string;
    nextMeetingDate: string;
    pendingCount: number;
    pendingMemberNumbers: string[];
  };
  webhookConfigured: boolean;
  history: SchedulerRunLog[];
  previewMessages: {
    en: string;
    sw: string;
  };
}

interface AdminOperationsPanelProps {
  pendingMemberNumbers: string[];
  nextMeetingTitle: string;
  nextMeetingDate: string;
  sharePriceTsh: number;
  socialFundTsh: number;
}

const KNOWN_CLOUD_RUN_DOMAINS = [
  'ais-dev-kq4gee7csap7oi6zjdl3g2-975042813454.europe-west2.run.app',
  'ais-pre-kq4gee7csap7oi6zjdl3g2-975042813454.europe-west2.run.app',
];

export default function AdminOperationsPanel({
  pendingMemberNumbers,
  nextMeetingTitle,
  nextMeetingDate,
  sharePriceTsh,
  socialFundTsh,
}: AdminOperationsPanelProps) {
  const { t } = useLang();

  // 1. Phone OTP Domain Whitelist & Live Test state
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const domainsToWhitelist = useMemo(() => {
    const set = new Set<string>();
    if (currentHost) set.add(currentHost);
    for (const d of KNOWN_CLOUD_RUN_DOMAINS) set.add(d);
    return Array.from(set);
  }, [currentHost]);

  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('+255 7');
  const [otpTesting, setOtpTesting] = useState(false);
  const [otpResult, setOtpResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // 2. Server-Side Cron & Push Automation state
  const [scheduler, setScheduler] = useState<SchedulerStatusResponse | null>(null);
  const [cronBusy, setCronBusy] = useState(false);
  const [cronNotice, setCronNotice] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  // 3. Multi-Network Real SMS Format Tester state
  const [smsSampleText, setSmsSampleText] = useState(SAMPLE_PAYMENT_SMS[0].text);

  const parsedSms = useMemo(
    () => parseMobileMoneySms(smsSampleText, sharePriceTsh, socialFundTsh),
    [smsSampleText, sharePriceTsh, socialFundTsh]
  );

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        await fetch('/api/scheduler/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingMemberNumbers,
            nextMeetingTitle,
            nextMeetingDate,
          }),
        });
        const resp = await fetch('/api/scheduler/status');
        if (resp.ok && active) {
          const data = (await resp.json()) as SchedulerStatusResponse;
          setScheduler(data);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    void loadStatus();
    return () => {
      active = false;
    };
  }, [pendingMemberNumbers, nextMeetingTitle, nextMeetingDate]);

  const handleCopyDomain = async (domain: string) => {
    try {
      await navigator.clipboard.writeText(domain);
      setCopiedDomain(domain);
      setTimeout(() => setCopiedDomain(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleToggleCron = async () => {
    if (!scheduler) return;
    setCronBusy(true);
    setCronNotice(null);
    try {
      const resp = await fetch('/api/scheduler/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !scheduler.config.enabled }),
      });
      if (resp.ok) {
        const statusResp = await fetch('/api/scheduler/status');
        if (statusResp.ok) setScheduler(await statusResp.json());
      }
    } finally {
      setCronBusy(false);
    }
  };

  const handleHourChange = async (hour: number) => {
    setCronBusy(true);
    try {
      await fetch('/api/scheduler/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sundayHourEat: hour }),
      });
      const statusResp = await fetch('/api/scheduler/status');
      if (statusResp.ok) setScheduler(await statusResp.json());
    } finally {
      setCronBusy(false);
    }
  };

  const handleRunCronNow = async (type: 'sunday_morning' | 'sunday_rollcall' | 'quarterly_meeting') => {
    setCronBusy(true);
    setCronNotice(null);
    try {
      const resp = await fetch('/api/scheduler/run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const statusResp = await fetch('/api/scheduler/status');
        if (statusResp.ok) setScheduler(await statusResp.json());

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Tujenge Hub VICOBA Reminder', {
            body: data.messages?.en || 'Sunday VICOBA contribution reminder.',
          });
        }
        setCronNotice(
          t(
            `Scheduled reminder executed (${data.entry?.eatTimeLabel}).`,
            `Ukumbusho wa ratiba umetekelezwa (${data.entry?.eatTimeLabel}).`
          )
        );
      }
    } finally {
      setCronBusy(false);
    }
  };

  const handleEnableBrowserPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushStatus('unsupported');
      return;
    }
    const perm = await Notification.requestPermission();
    setPushStatus(perm);
    if (perm === 'granted') {
      new Notification('Tujenge Hub VICOBA Push Enabled', {
        body: 'Sarah Kapuya (Admin): Browser alerts active for Sunday roll-calls & quarterly meetings.',
      });
    }
  };


  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#E5DEC9] bg-white p-5"><h2 className="font-display text-base font-bold text-[#17231C]">{t("Member Sign In","Kuingia kwa Wanachama")}</h2><p className="text-sm text-[#55635A] mt-2">{t("Members sign in with their mobile number and private 6-digit PIN. Admin uses a separate email and password.","Wanachama huingia kwa namba ya simu na PIN binafsi ya tarakimu 6. Msimamizi hutumia barua pepe na nenosiri.")}</p></section>

      {/* 2. Scheduled Reminder Cron + Push / WhatsApp Blast */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Clock className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-bold text-[#17231C]">
                {t(
                  'Scheduled Server Reminder Cron & Push Automation',
                  'Ratiba ya Otomatiki ya Vikumbusho (EAT) & Push'
                )}
              </h2>
              <p className="text-xs text-[#55635A]">
                {scheduler
                  ? t(
                      `Server clock: ${scheduler.eatNow.label} · Webhook: ${
                        scheduler.webhookConfigured ? 'Connected' : 'Optional (REMINDER_WEBHOOK_URL)'
                      }`,
                      `Saa ya Seva: ${scheduler.eatNow.label} · Webhook: ${
                        scheduler.webhookConfigured ? 'Imeunganishwa' : 'Hiari (REMINDER_WEBHOOK_URL)'
                      }`
                    )
                  : t('Loading server scheduler...', 'Inapakia ratiba ya seva...')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEnableBrowserPush}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-1.5 text-xs font-semibold text-[#17231C] hover:bg-[#EFEAE0] whitespace-nowrap"
            >
              <Bell className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
              {pushStatus === 'granted'
                ? t('Browser Push Active', 'Push Imewashwa')
                : t('Enable Browser Push', 'Washa Push Alerts')}
            </button>

            <button
              type="button"
              disabled={cronBusy || !scheduler}
              onClick={handleToggleCron}
              className={`min-h-[38px] rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                scheduler?.config.enabled
                  ? 'bg-[#E8F1EB] text-[#114226] border border-[#C6DFCF]'
                  : 'bg-[#F5E6CC] text-[#9A4E0B] border border-[#ECD6AE]'
              }`}
            >
              {scheduler?.config.enabled
                ? t('Cron: Active (Sundays)', 'Cron: Inafanya Kazi')
                : t('Cron: Paused', 'Cron: Imesimamishwa')}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3.5 space-y-1.5">
              <div className="font-semibold text-[#17231C]">
                {t('Sunday Morning Hour (EAT)', 'Saa ya Ukumbusho Jumapili (EAT)')}
              </div>
              <select
                aria-label="Sunday reminder hour in East Africa Time"
                value={scheduler?.config.sundayHourEat ?? 8}
                onChange={(e) => void handleHourChange(Number(e.target.value))}
                className="w-full min-h-[38px] rounded-lg border border-[#DDD4BE] bg-white px-2.5 py-1 font-mono text-xs text-[#17231C]"
              >
                {[6, 7, 8, 9, 10, 12, 15].map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00 EAT (Sunday)
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3.5 space-y-1">
              <div className="font-semibold text-[#17231C]">
                {t('Evening Roll-Call Cron', 'Ukaguzi wa Jioni Jumapili')}
              </div>
              <div className="font-mono text-[#165432] font-bold">
                19:00 EAT · {pendingMemberNumbers.length} {t('pending', 'wanasubiriwa')}
              </div>
              <div className="text-[11px] text-[#55635A]">
                {t('Alerts pending members before 5,000 TSH fine.', 'Huarifu waliochelewa kabla ya faini 5,000 TSH.')}
              </div>
            </div>

            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3.5 space-y-1">
              <div className="font-semibold text-[#17231C]">
                {t('Quarterly Meeting Triggers', 'Vikumbusho vya Mkutano (Miezi 3)')}
              </div>
              <div className="font-mono text-[#17231C] font-semibold">
                {nextMeetingDate} (14d, 3d, Day 0)
              </div>
              <div className="text-[11px] text-[#55635A] truncate">{nextMeetingTitle}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={cronBusy}
              onClick={() => void handleRunCronNow('sunday_morning')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#165432] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#114226] disabled:opacity-60 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t('Trigger Sunday Reminder Now', 'Endesha Ukumbusho Sasa')}
            </button>

            <button
              type="button"
              disabled={cronBusy}
              onClick={() => void handleRunCronNow('quarterly_meeting')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#DDD4BE] bg-white px-3.5 py-2 text-xs font-semibold text-[#17231C] hover:bg-[#FAF7F0] disabled:opacity-60 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 text-[#165432]" aria-hidden="true" />
              {t('Trigger Meeting Cron', 'Jaribu Mkutano Cron')}
            </button>

            {scheduler?.previewMessages && (
              <a
                href={buildWhatsAppUrl(scheduler.previewMessages.en)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3.5 py-2 text-xs font-semibold text-[#114226] hover:bg-[#DCE9E0] whitespace-nowrap"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('WhatsApp Blast Now', 'Tuma WhatsApp Sasa')}
              </a>
            )}
          </div>

          {cronNotice && (
            <div className="rounded-xl border border-[#C6DFCF] bg-[#E8F1EB] px-3.5 py-2.5 text-xs text-[#114226] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#165432]" aria-hidden="true" />
              <span>{cronNotice}</span>
            </div>
          )}

          {scheduler && scheduler.history.length > 0 && (
            <div className="border-t border-[#EFEAE0] pt-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#55635A]">
                {t('Recent Cron Execution Log', 'Kumbukumbu za Cron')}
              </div>
              {scheduler.history.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-[#37463D] bg-[#FAF7F0] rounded-lg px-3 py-2"
                >
                  <div>
                    <span className="font-mono font-semibold text-[#165432] mr-2">
                      {item.eatTimeLabel}
                    </span>
                    <span className="font-medium">{item.type}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#55635A]">
                    webhook: {item.webhookStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 3. Real SMS Format Check Across Networks (M-Pesa, Mixx by Yas, Airtel Money, Halopesa) */}
      <section className="rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-start gap-2.5">
          <Smartphone className="h-5 w-5 text-[#165432] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-bold text-[#17231C]">
              {t(
                'Real SMS Format Check Across Networks',
                'Ukaguzi wa Muundo wa SMS za Mitandao Yote'
              )}
            </h2>
            <p className="text-xs text-[#55635A]">
              {t(
                'Verify M-Pesa (EN/SW/Wakala), Mixx by Yas, Airtel Money (including TIDs), and Halopesa messages before members submit.',
                'Jaribu SMS halisi za M-Pesa, Mixx by Yas, Airtel Money, na Halopesa kuhakikisha kiasi na namba ya muamala vinasomeka.'
              )}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_PAYMENT_SMS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                onClick={() => setSmsSampleText(sample.text)}
                className="min-h-[34px] rounded-lg border border-[#DDD4BE] bg-[#FAF7F0] px-2.5 py-1 text-[11px] font-medium text-[#17231C] hover:bg-[#E8F1EB] hover:border-[#C6DFCF]"
              >
                {sample.label}
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            value={smsSampleText}
            onChange={(e) => setSmsSampleText(e.target.value)}
            aria-label="Test mobile money SMS format"
            placeholder={t('Paste any real member mobile money SMS here...', 'Bandika SMS halisi ya mwanachama hapa...')}
            className="w-full rounded-xl border border-[#DDD4BE] bg-[#FAF7F0] px-3 py-2.5 font-mono text-xs text-[#17231C] focus:border-[#165432] focus:bg-white focus:outline-none"
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3">
              <span className="block text-[10px] text-[#55635A]">{t('Detected Network', 'Mtandao')}</span>
              <span className="font-semibold text-[#17231C]">
                {parsedSms.provider || t('Not detected', 'Haijatambulika')}
              </span>
            </div>
            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3">
              <span className="block text-[10px] text-[#55635A]">{t('Parsed Amount', 'Kiasi')}</span>
              <span className="font-mono font-bold tabular-nums text-[#165432]">
                {parsedSms.amountTsh ? formatTsh(parsedSms.amountTsh) : '—'}
              </span>
            </div>
            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3">
              <span className="block text-[10px] text-[#55635A]">{t('Reference / TID', 'Kumbukumbu')}</span>
              <span className="font-mono font-semibold text-[#17231C] truncate block">
                {parsedSms.reference || '—'}
              </span>
            </div>
            <div className="rounded-xl border border-[#E5DEC9] bg-[#FAF7F0] p-3">
              <span className="block text-[10px] text-[#55635A]">Hisa / Jamii</span>
              <span className="font-mono font-semibold tabular-nums text-[#17231C]">
                {parsedSms.amountTsh && parsedSms.amountTsh >= sharePriceTsh + socialFundTsh
                  ? `${formatTsh(parsedSms.amountTsh - socialFundTsh)} + ${formatTsh(socialFundTsh)}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
