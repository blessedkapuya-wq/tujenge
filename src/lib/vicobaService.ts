

import {
  DocumentCategory,
  GroupMeeting,
  JamiiPayoutReason,
  MemberLedger,
  MemberLoan,
  MemberPrivatePii,
  MobileNetwork,
  MobilePayment,
  PaymentCategory,
  formatTsh,
  maskPhone,
} from '../types/vicoba';


import {api,refresh} from "./session";
export const GROUP_DOC_ID="tujenge-main";
export type WeeklySplitMode="extra_to_hisa"|"multi_week";
export async function ensureInitialGroupSeeded(params: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<void> { const data=await api("/api/action",{action:"ensureInitialGroupSeeded",args:[params]}); await refresh(); return data.result; }
export async function joinVicobaGroup(params: {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  preferredNetwork: MobileNetwork;
  nextOfKinName: string;
  nextOfKinPhone: string;
  mtaaHouseNumber: string;
  nationalId?: string;
  startingCommitmentShares: number;
}): Promise<{ memberId: string; memberNumber: string }> { const data=await api("/api/action",{action:"joinVicobaGroup",args:[params]}); await refresh(); return data.result; }
export async function fetchMemberPrivatePii(
  memberId: string
): Promise<MemberPrivatePii | null> { const data=await api("/api/action",{action:"fetchMemberPrivatePii",args:[memberId]}); await refresh(); return data.result; }
export async function payWithMobileMoney(params: {
  actorUid: string;
  member: MemberLedger;
  category: PaymentCategory;
  sharesCount: number;
  amountTsh: number;
  provider: MobileNetwork;
  phone: string;
  reference: string;
  weeklySplitMode?: WeeklySplitMode;
}): Promise<{
  reference: string;
  broadcastMessage: string;
  recipientCount: number;
  previousShares: number;
  newShares: number;
  newSavedTsh: number;
  previousSocialFundTsh: number;
  newSocialFundTsh: number;
  hisaAddedTsh: number;
  jamiiAddedTsh: number;
}> { const data=await api("/api/action",{action:"payWithMobileMoney",args:[params]}); await refresh(); return data.result; }
export async function requestMemberLoan(params: {
  member: MemberLedger;
  principalTsh: number;
  durationMonths: number;
  purpose: string;
  guarantorName?: string;
}): Promise<{ loanId: string; totalDueTsh: number }> { const data=await api("/api/action",{action:"requestMemberLoan",args:[params]}); await refresh(); return data.result; }
export async function approvePendingLoan(params: {
  adminUid: string;
  loan: MemberLoan;
}): Promise<void> { const data=await api("/api/action",{action:"approvePendingLoan",args:[params]}); await refresh(); return data.result; }
export async function declinePendingLoan(loanId: string): Promise<void> { const data=await api("/api/action",{action:"declinePendingLoan",args:[loanId]}); await refresh(); return data.result; }
export async function issueMemberLoan(params: {
  adminUid: string;
  member: MemberLedger;
  principalTsh: number;
  durationMonths: number;
  purpose: string;
  guarantorName?: string;
}): Promise<{ loanId: string; totalDueTsh: number }> { const data=await api("/api/action",{action:"issueMemberLoan",args:[params]}); await refresh(); return data.result; }
export async function addGroupDocument(params: {
  adminUid: string;
  adminName: string;
  title: string;
  category: DocumentCategory;
  content: string;
  externalUrl?: string;
  attachmentName?: string;
  visibility: 'public' | 'members';
  memberCount: number;
}): Promise<string> { const data=await api("/api/action",{action:"addGroupDocument",args:[params]}); await refresh(); return data.result; }
export async function deleteGroupDocument(docId: string): Promise<void> { const data=await api("/api/action",{action:"deleteGroupDocument",args:[docId]}); await refresh(); return data.result; }
export async function addGroupMeeting(params: {
  adminUid: string;
  title: string;
  quarterLabel: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agenda: string;
  memberCount: number;
}): Promise<string> { const data=await api("/api/action",{action:"addGroupMeeting",args:[params]}); await refresh(); return data.result; }
export async function toggleMeetingStatus(
  meeting: GroupMeeting
): Promise<void> { const data=await api("/api/action",{action:"toggleMeetingStatus",args:[meeting]}); await refresh(); return data.result; }
export async function sendMeetingReminderBroadcast(params: {
  senderUid: string;
  meeting: GroupMeeting;
  memberCount: number;
  deterministicKey?: string;
}): Promise<void> { const data=await api("/api/action",{action:"sendMeetingReminderBroadcast",args:[params]}); await refresh(); return data.result; }
export async function applySundayFineToMember(params: {
  adminUid: string;
  member: MemberLedger;
  fineTsh: number;
  weekLabel: string;
  memberCount: number;
}): Promise<void> { const data=await api("/api/action",{action:"applySundayFineToMember",args:[params]}); await refresh(); return data.result; }
export async function sendSundayRollCallReminder(params: {
  adminUid: string;
  pendingNumbers: string[];
  sundayDateStr: string;
  memberCount: number;
}): Promise<void> { const data=await api("/api/action",{action:"sendSundayRollCallReminder",args:[params]}); await refresh(); return data.result; }
export async function recordJamiiPayout(params: {
  adminUid: string;
  member: MemberLedger;
  reason: JamiiPayoutReason;
  notes: string;
  amountTsh: number;
  payoutDate: string;
}): Promise<string> { const data=await api("/api/action",{action:"recordJamiiPayout",args:[params]}); await refresh(); return data.result; }
export async function adjustOrReversePayment(params: {
  adminUid: string;
  payment: MobilePayment;
  action: 'adjusted' | 'reversed';
  newAmountTsh: number;
  reason: string;
}): Promise<void> { const data=await api("/api/action",{action:"adjustOrReversePayment",args:[params]}); await refresh(); return data.result; }
export async function relinkMemberPhoneAndUid(params: {
  memberId: string;
  newPhone?: string;
  newUid?: string;
}): Promise<{ maskedPhone: string; uid: string }> { const data=await api("/api/action",{action:"relinkMemberPhoneAndUid",args:[params]}); await refresh(); return data.result; }