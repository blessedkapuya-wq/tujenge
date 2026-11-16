import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface CronConfig {
  enabled: boolean;
  sundayHourEat: number;
  sundayMinuteEat: number;
  eveningRollCallHourEat: number;
  quarterlyLeadDays: number[];
  nextMeetingTitle: string;
  nextMeetingDate: string;
  pendingCount: number;
  pendingMemberNumbers: string[];
}

interface CronRunLog {
  id: string;
  type: 'sunday_morning' | 'sunday_rollcall' | 'quarterly_meeting' | 'manual_test';
  triggeredAtIso: string;
  eatTimeLabel: string;
  summary: string;
  webhookStatus: 'not_configured' | 'dispatched' | 'failed';
}

const cronConfig: CronConfig = {
  enabled: true,
  sundayHourEat: 8,
  sundayMinuteEat: 0,
  eveningRollCallHourEat: 19,
  quarterlyLeadDays: [14, 3, 0],
  nextMeetingTitle: 'Quarterly VICOBA Share-Out & Review',
  nextMeetingDate: '2026-11-29',
  pendingCount: 0,
  pendingMemberNumbers: [],
};

const runHistory: CronRunLog[] = [];
const firedKeys = new Set<string>();

function getEatNowParts(): {
  dateStr: string;
  weekday: string;
  hour: number;
  minute: number;
  label: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const hour = Number(map.hour || 0);
  const minute = Number(map.minute || 0);
  return {
    dateStr,
    weekday: map.weekday || 'Sun',
    hour,
    minute,
    label: `${map.weekday} ${dateStr} ${map.hour}:${map.minute} EAT`,
  };
}

function buildReminderMessages(kind: CronRunLog['type']) {
  const pendingList =
    cronConfig.pendingMemberNumbers.length > 0
      ? cronConfig.pendingMemberNumbers.join(', ')
      : 'all unpaid members';

  if (kind === 'quarterly_meeting') {
    return {
      en: `Tujenge Hub VICOBA Quarterly Meeting Reminder: ${cronConfig.nextMeetingTitle} on ${cronConfig.nextMeetingDate} at 15:00 EAT. Every member share report, Jamii fund, and loan total will be reviewed.`,
      sw: `Ukumbusho wa Mkutano wa Miezi 3 Tujenge Hub: ${cronConfig.nextMeetingTitle} tarehe ${cronConfig.nextMeetingDate} saa 15:00 EAT. Ripoti za Hisa za kila mwanachama, Jamii na mikopo zitapitiwa.`,
    };
  }
  if (kind === 'sunday_rollcall') {
    return {
      en: `Tujenge Hub Sunday Closing Roll-Call: Weekly share (min 12,000 TSH = 10,000 Hisa + 2,000 Jamii) closes tonight. Missing Sunday incurs 5,000 TSH fine. Pending: ${pendingList}.`,
      sw: `Orodha ya Jioni Jumapili Tujenge Hub: Mchango wa wiki (angalau 12,000 TSH) unafungwa usiku huu. Kukosa Jumapili kuna faini ya 5,000 TSH. Wanaosubiriwa: ${pendingList}.`,
    };
  }
  return {
    en: `Tujenge Hub VICOBA Sunday Reminder: Today is Sunday contribution day! Minimum 12,000 TSH (10,000 Hisa + 2,000 Jamii; extra goes to Hisa). Missing Sunday incurs 5,000 TSH fine.`,
    sw: `Ukumbusho wa Jumapili Tujenge Hub VICOBA: Leo ni siku ya mchango! Kiwango cha chini ni 12,000 TSH (10,000 Hisa + 2,000 Jamii). Kukosa Jumapili kuna faini ya 5,000 TSH.`,
  };
}

async function dispatchReminderEvent(
  type: CronRunLog['type'],
  eatLabel: string
): Promise<CronRunLog> {
  const messages = buildReminderMessages(type);
  const webhookUrl = process.env.REMINDER_WEBHOOK_URL?.trim();
  let webhookStatus: CronRunLog['webhookStatus'] = 'not_configured';

  if (webhookUrl) {
    try {
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'Tujenge Hub VICOBA',
          admin: 'Sarah Kapuya',
          type,
          eatTimeLabel: eatLabel,
          messageEn: messages.en,
          messageSw: messages.sw,
          pendingMemberNumbers: cronConfig.pendingMemberNumbers,
        }),
      });
      webhookStatus = resp.ok ? 'dispatched' : 'failed';
    } catch {
      webhookStatus = 'failed';
    }
  }

  const entry: CronRunLog = {
    id: `cron-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    triggeredAtIso: new Date().toISOString(),
    eatTimeLabel: eatLabel,
    summary: messages.en,
    webhookStatus,
  };

  runHistory.unshift(entry);
  if (runHistory.length > 15) {
    runHistory.length = 15;
  }
  return entry;
}

function startReminderCron() {
  setInterval(() => {
    if (!cronConfig.enabled) return;
    const eat = getEatNowParts();

    // Sunday morning reminder (e.g. 08:00 EAT)
    if (
      eat.weekday === 'Sun' &&
      eat.hour === cronConfig.sundayHourEat &&
      eat.minute === cronConfig.sundayMinuteEat
    ) {
      const key = `sun-am-${eat.dateStr}`;
      if (!firedKeys.has(key)) {
        firedKeys.add(key);
        void dispatchReminderEvent('sunday_morning', eat.label);
      }
    }

    // Sunday evening roll-call alert (e.g. 19:00 EAT)
    if (
      eat.weekday === 'Sun' &&
      eat.hour === cronConfig.eveningRollCallHourEat &&
      eat.minute === 0
    ) {
      const key = `sun-pm-${eat.dateStr}`;
      if (!firedKeys.has(key)) {
        firedKeys.add(key);
        void dispatchReminderEvent('sunday_rollcall', eat.label);
      }
    }

    // Quarterly meeting check at 08:00 EAT
    if (cronConfig.nextMeetingDate && eat.hour === 8 && eat.minute === 0) {
      const mtgMs = new Date(`${cronConfig.nextMeetingDate}T00:00:00Z`).getTime();
      const todayMs = new Date(`${eat.dateStr}T00:00:00Z`).getTime();
      const diffDays = Math.round((mtgMs - todayMs) / (1000 * 60 * 60 * 24));
      if (cronConfig.quarterlyLeadDays.includes(diffDays)) {
        const key = `mtg-${cronConfig.nextMeetingDate}-d${diffDays}`;
        if (!firedKeys.has(key)) {
          firedKeys.add(key);
          void dispatchReminderEvent('quarterly_meeting', eat.label);
        }
      }
    }
  }, 60_000);
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: 'Tujenge Hub', admin: 'Sarah Kapuya' });
  });

  app.get('/api/scheduler/status', (_req, res) => {
    const eat = getEatNowParts();
    res.json({
      eatNow: eat,
      config: cronConfig,
      webhookConfigured: Boolean(process.env.REMINDER_WEBHOOK_URL?.trim()),
      history: runHistory,
      previewMessages: buildReminderMessages('sunday_morning'),
    });
  });

  app.post('/api/scheduler/config', (req, res) => {
    const body = req.body || {};
    if (typeof body.enabled === 'boolean') {
      cronConfig.enabled = body.enabled;
    }
    if (typeof body.sundayHourEat === 'number' && body.sundayHourEat >= 5 && body.sundayHourEat <= 21) {
      cronConfig.sundayHourEat = Math.round(body.sundayHourEat);
    }
    if (typeof body.eveningRollCallHourEat === 'number' && body.eveningRollCallHourEat >= 12 && body.eveningRollCallHourEat <= 23) {
      cronConfig.eveningRollCallHourEat = Math.round(body.eveningRollCallHourEat);
    }
    if (typeof body.nextMeetingDate === 'string' && body.nextMeetingDate.length >= 8) {
      cronConfig.nextMeetingDate = body.nextMeetingDate.slice(0, 20);
    }
    if (typeof body.nextMeetingTitle === 'string' && body.nextMeetingTitle.trim()) {
      cronConfig.nextMeetingTitle = body.nextMeetingTitle.trim().slice(0, 100);
    }
    if (Array.isArray(body.pendingMemberNumbers)) {
      cronConfig.pendingMemberNumbers = body.pendingMemberNumbers
        .filter((x: unknown): x is string => typeof x === 'string')
        .slice(0, 50);
      cronConfig.pendingCount = cronConfig.pendingMemberNumbers.length;
    }
    res.json({ ok: true, config: cronConfig });
  });

  app.post('/api/scheduler/run-now', async (req, res) => {
    const reqType = req.body?.type;
    const type: CronRunLog['type'] =
      reqType === 'quarterly_meeting' || reqType === 'sunday_rollcall' || reqType === 'sunday_morning'
        ? reqType
        : 'manual_test';
    const eat = getEatNowParts();
    const entry = await dispatchReminderEvent(type, eat.label);
    res.json({
      ok: true,
      entry,
      messages: buildReminderMessages(type),
      history: runHistory,
    });
  });

  startReminderCron();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tujenge Hub server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
