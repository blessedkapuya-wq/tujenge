import { Bell, CheckCheck } from 'lucide-react';
import { useLang } from '../lib/i18n';
import {
  GroupNotification,
  MemberLedger,
  MobilePayment,
  formatTimestamp,
  formatTsh,
} from '../types/vicoba';

interface GroupAlertsViewProps {
  isAdmin: boolean;
  currentMember: MemberLedger | null;
  notifications: GroupNotification[];
  payments: MobilePayment[];
}

export default function GroupAlertsView({
  isAdmin,
  currentMember,
  notifications,
  payments,
}: GroupAlertsViewProps) {
  const { t } = useLang();
  const visiblePayments = isAdmin
    ? payments
    : currentMember
      ? payments.filter((p) => p.memberId === currentMember.id)
      : [];

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E5DEC9] pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#17231C]">
          {t('Group Payment Notifications', 'Taarifa za Malipo na Kikundi')}
        </h1>
        <p className="mt-1 text-sm text-[#55635A] max-w-2xl">
          {t(
            'Whenever any member pastes a mobile money confirmation message and taps “I Have Paid”, every member receives a clean notification showing their Member No. and the TSH amount paid.',
            'Kila mwanachama anapobandika ujumbe wa malipo na kubonyeza Nimekwisha Lipa, wanachama wote hupokea taarifa yenye Namba ya Mwanachama na kiasi cha TSH.'
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#165432]" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold text-[#17231C]">
                {t('Group Notifications', 'Taarifa za Kikundi')}
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-[#55635A]">
              {notifications.length} {t('alerts', 'taarifa')}
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#55635A]">
              {t(
                'No notifications yet. Paste a mobile money message and tap Paid to notify all members.',
                'Hakuna taarifa bado. Bandika ujumbe wa malipo kisha bonyeza Nimekwisha Lipa.'
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE0]">
              {notifications.map((n) => (
                <div key={n.id} className="p-5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#17231C]">{n.title}</span>
                    <span className="font-mono tabular-nums text-[#8A948D]">
                      {formatTimestamp(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#17231C]">{n.message}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#165432]">
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {t('Sent to all', 'Imetumwa kwa wanachama')} {n.recipientCount}{' '}
                      {t('members', '')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-[#E5DEC9] bg-white overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-[#EFEAE0] flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-[#17231C]">
              {isAdmin
                ? t('Admin Payment Audit Log', 'Kumbukumbu za Malipo (Msimamizi)')
                : t('My Confirmed Receipts', 'Risiti Zangu Zilizothibitishwa')}
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#55635A]">
              {visiblePayments.length} {t('receipts', 'risiti')}
            </span>
          </div>

          {visiblePayments.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#55635A]">
              {isAdmin
                ? t('Confirmed member payments will appear here.', 'Malipo yote yataonekana hapa.')
                : t('Your personal mobile money receipts will appear here after you pay.', 'Risiti zako zitaonekana hapa ukilipa.')}
            </div>
          ) : (
            <div className="divide-y divide-[#EFEAE0]">
              {visiblePayments.map((pay) => (
                <div
                  key={pay.id}
                  className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-medium text-[#17231C]">
                      <span className="font-mono text-[#165432] font-semibold mr-1.5">
                        {pay.memberNumber}
                      </span>
                      {pay.memberName}
                    </div>
                    <div className="text-[#55635A] mt-0.5 font-mono">
                      {pay.provider} · Ref: {pay.reference} · {formatTimestamp(pay.createdAt)}
                      {pay.status !== 'confirmed' ? ` · ${pay.status.toUpperCase()}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono font-semibold tabular-nums ${
                        pay.status === 'reversed'
                          ? 'text-[#8A948D] line-through'
                          : 'text-[#165432]'
                      }`}
                    >
                      {formatTsh(pay.amountTsh)}
                    </div>
                    <div className="text-[11px] text-[#55635A]">
                      {pay.category === 'weekly_contribution'
                        ? `+${pay.sharesCount} Hisa + Jamii`
                        : pay.category === 'shares'
                          ? `+${pay.sharesCount} Hisa`
                          : pay.category === 'social_fund'
                            ? 'Jamii'
                            : pay.category === 'fine'
                              ? t('Sunday Fine', 'Faini ya Jumapili')
                              : t('Loan Repayment', 'Marejesho ya Mkopo')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
