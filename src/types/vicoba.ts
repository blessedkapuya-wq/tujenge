export type MobileNetwork = 'M-Pesa' | 'Mixx by Yas' | 'Airtel Money' | 'Halopesa';

export type PaymentCategory =
  | 'weekly_contribution'
  | 'shares'
  | 'social_fund'
  | 'loan_repayment'
  | 'fine';

export type AppView = 'overview' | 'member' | 'pay' | 'meetings' | 'resources' | 'admin' | 'alerts';

export type DocumentCategory =
  | 'Policy'
  | 'Constitution'
  | 'Meeting Minutes'
  | 'Financial Form'
  | 'Notice';

export interface MobileNetworkInfo {
  id: MobileNetwork;
  label: string;
  ussd: string;
  tillNumber: string;
  accountLabel: string;
}

export const MOBILE_NETWORKS: MobileNetworkInfo[] = [
  {
    id: 'M-Pesa',
    label: 'M-Pesa (Vodacom)',
    ussd: '*150*00#',
    tillNumber: '5548920',
    accountLabel: 'Tujenge Hub VICOBA',
  },
  {
    id: 'Mixx by Yas',
    label: 'Mixx by Yas (Tigo Pesa)',
    ussd: '*150*01#',
    tillNumber: '8823104',
    accountLabel: 'Tujenge Hub VICOBA',
  },
  {
    id: 'Airtel Money',
    label: 'Airtel Money',
    ussd: '*150*60#',
    tillNumber: '6120938',
    accountLabel: 'Tujenge Hub VICOBA',
  },
  {
    id: 'Halopesa',
    label: 'Halopesa',
    ussd: '*150*88#',
    tillNumber: '7412901',
    accountLabel: 'Tujenge Hub VICOBA',
  },
];

export interface VicobaGroup {
  id: string;
  name: string;
  tagline?: string;
  currency: 'TSH';
  sharePriceTsh: number;
  socialFundTsh: number;
  sundayFineTsh?: number;
  meetingIntervalMonths?: number;
  loanMultiplier: number;
  interestRatePct: number;
  nextMemberSeq: number;
  memberCount: number;
  totalShares: number;
  totalGroupPoolTsh: number;
  totalLoanOutTsh: number;
  totalLoanRepaidTsh?: number;
  totalJamiiOutTsh?: number;
  inviteCode: string;
}

export interface MemberLedger {
  id: string;
  uid: string;
  memberNumber: string;
  fullName: string;
  role: 'founder' | 'member';
  status: 'active' | 'pending';
  preferredNetwork: MobileNetwork;
  maskedPhone: string;
  totalShares: number;
  totalSavedTsh: number;
  socialFundTsh: number;
  activeLoanBalanceTsh: number;
  totalLoanRepaidTsh?: number;
  totalFinesTsh?: number;
  unpaidFineTsh?: number;
  activeLoanId?: string;
  lastPaymentAt?: unknown;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface MemberPrivatePii {
  uid: string;
  phone: string;
  email?: string;
  nextOfKinName: string;
  nextOfKinPhone: string;
  mtaaHouseNumber: string;
  nationalId?: string;
  startingCommitmentShares?: number;
  createdAt?: unknown;
}

export interface MobilePayment {
  id: string;
  uid: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  category: PaymentCategory;
  sharesCount: number;
  amountTsh: number;
  hisaTsh?: number;
  jamiiTsh?: number;
  provider: MobileNetwork;
  maskedPhone: string;
  reference: string;
  status: 'confirmed' | 'adjusted' | 'reversed';
  adjustedFromAmountTsh?: number;
  adjustmentReason?: string;
  adjustedByUid?: string;
  adjustedAt?: unknown;
  createdAt?: unknown;
}

export interface MemberLoan {
  id: string;
  memberId: string;
  memberUid: string;
  memberNumber: string;
  memberName: string;
  principalTsh: number;
  interestTsh: number;
  totalDueTsh: number;
  repaidTsh: number;
  remainingTsh: number;
  durationMonths: number;
  purpose: string;
  guarantorName?: string;
  status: 'pending' | 'active' | 'paid' | 'rejected';
  dueDate: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupNotification {
  id: string;
  senderUid: string;
  eventType:
    | 'payment_received'
    | 'member_joined'
    | 'loan_issued'
    | 'loan_requested'
    | 'meeting_reminder'
    | 'document_added'
    | 'fine_applied'
    | 'jamii_payout'
    | 'payment_adjusted';
  title: string;
  message: string;
  memberNumber?: string;
  amountTsh?: number;
  provider?: string;
  recipientCount: number;
  createdAt?: unknown;
}

export type JamiiPayoutReason =
  | 'Illness'
  | 'Bereavement'
  | 'Family Emergency'
  | 'Maternity'
  | 'Other';

export interface JamiiPayout {
  id: string;
  groupId: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  reason: JamiiPayoutReason;
  notes: string;
  amountTsh: number;
  payoutDate: string;
  approvedByUid: string;
  createdAt?: unknown;
}

export interface PaymentAdjustment {
  id: string;
  groupId: string;
  paymentId: string;
  reference: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  action: 'adjusted' | 'reversed';
  previousAmountTsh: number;
  newAmountTsh: number;
  reason: string;
  adminUid: string;
  createdAt?: unknown;
}

export interface GroupDocument {
  id: string;
  groupId: string;
  title: string;
  category: DocumentCategory;
  content: string;
  externalUrl?: string;
  attachmentName?: string;
  visibility: 'public' | 'members';
  addedByUid: string;
  addedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMeeting {
  id: string;
  groupId: string;
  title: string;
  quarterLabel: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agenda: string;
  status: 'scheduled' | 'completed';
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function formatTsh(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} TSH`;
}

export function normalizeTzPhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('255')) return `+${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    return `+255${cleaned.slice(1)}`;
  }
  if ((cleaned.startsWith('7') || cleaned.startsWith('6')) && cleaned.length >= 9) {
    return `+255${cleaned}`;
  }
  return cleaned.startsWith('+') ? cleaned : `+255${cleaned}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, '');
  if (digits.length <= 6) return digits;
  const start = digits.slice(0, 5);
  const end = digits.slice(-3);
  return `${start} *** ${end}`;
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return 'Just now';
}

export function getNextSundayInfo(from = new Date()): {
  dateStr: string;
  daysUntil: number;
  isTodaySunday: boolean;
} {
  const day = from.getDay(); // 0 = Sunday
  const daysUntil = day === 0 ? 0 : 7 - day;
  const target = new Date(from);
  target.setDate(from.getDate() + daysUntil);
  return {
    dateStr: target.toISOString().slice(0, 10),
    daysUntil,
    isTodaySunday: day === 0,
  };
}

export function getCurrentWeekWindow(from = new Date()): {
  weekLabel: string;
  startMs: number;
  endMs: number;
  sundayDateStr: string;
} {
  const d = new Date(from);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const sundayDateStr = sunday.toISOString().slice(0, 10);
  const mondayStr = monday.toISOString().slice(5, 10);
  const sundayShort = sundayDateStr.slice(5, 10);
  return {
    weekLabel: `${mondayStr} to ${sundayShort}`,
    startMs: monday.getTime(),
    endMs: sunday.getTime(),
    sundayDateStr,
  };
}

export function buildWhatsAppUrl(message: string, phone?: string): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const digits = normalizeTzPhone(phone).replace(/[^0-9]/g, '');
    if (digits.length >= 9) {
      return `https://wa.me/${digits}?text=${encoded}`;
    }
  }
  return `https://wa.me/?text=${encoded}`;
}

export function getTimestampMs(ts: unknown): number | null {
  if (!ts) return null;
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}
