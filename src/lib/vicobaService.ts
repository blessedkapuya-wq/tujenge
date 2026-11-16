import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ADMIN_BOOTSTRAP_EMAIL,
  OperationType,
  db,
  handleFirestoreError,
} from './firebase';
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

export const GROUP_DOC_ID = 'tujenge-main';

function formatMemberNumber(seq: number): string {
  return `TUJ-${String(seq).padStart(3, '0')}`;
}

function sanitizeIdPart(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'user';
}

export async function ensureInitialGroupSeeded(params: {
  uid: string;
  email: string | null;
  displayName: string | null;
}): Promise<void> {
  const isBootstrapAdmin =
    params.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();

  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  let snap;
  try {
    snap = await getDoc(groupRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `groups/${GROUP_DOC_ID}`);
  }

  if (snap.exists()) {
    const existingData = snap.data();
    if (isBootstrapAdmin) {
      const updates: Record<string, unknown> = {};
      if (existingData.socialFundTsh !== 2000) {
        updates.socialFundTsh = 2000;
      }
      if (existingData.sundayFineTsh === undefined) {
        updates.sundayFineTsh = 5000;
      }
      if (existingData.meetingIntervalMonths === undefined) {
        updates.meetingIntervalMonths = 3;
      }
      if (existingData.totalLoanRepaidTsh === undefined) {
        updates.totalLoanRepaidTsh = 32000;
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp();
        try {
          await updateDoc(groupRef, updates);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `groups/${GROUP_DOC_ID}`);
        }
      }
      const founder1Ref = doc(db, 'members', 'founder-1');
      try {
        const f1Snap = await getDoc(founder1Ref);
        if (f1Snap.exists() && f1Snap.data().fullName === 'Blessed Kapuya') {
          await updateDoc(founder1Ref, {
            fullName: 'Sarah Kapuya',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'members/founder-1');
      }
      await ensureSeededResourcesAndMeetings(params.uid, 'Sarah Kapuya');
    }
    return;
  }

  if (!isBootstrapAdmin) {
    return;
  }

  const batch = writeBatch(db);
  const founder1Name = 'Sarah Kapuya';

  batch.set(groupRef, {
    name: 'Tujenge Hub VICOBA',
    tagline:
      'Four founding sisters building shared capital, emergency resilience, and fair loans.',
    currency: 'TSH',
    sharePriceTsh: 10000,
    socialFundTsh: 2000,
    sundayFineTsh: 5000,
    meetingIntervalMonths: 3,
    loanMultiplier: 3,
    interestRatePct: 10,
    nextMemberSeq: 5,
    memberCount: 4,
    totalShares: 42,
    totalGroupPoolTsh: 536000,
    totalLoanOutTsh: 100000,
    totalLoanRepaidTsh: 32000,
    inviteCode: 'TUJENGE-2026',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const founders = [
    {
      id: 'founder-1',
      uid: params.uid,
      memberNumber: 'TUJ-001',
      fullName: founder1Name,
      preferredNetwork: 'M-Pesa' as MobileNetwork,
      maskedPhone: '+255 75 *** 201',
      totalShares: 12,
      totalSavedTsh: 120000,
      socialFundTsh: 24000,
      activeLoanBalanceTsh: 0,
      totalLoanRepaidTsh: 0,
      totalFinesTsh: 0,
    },
    {
      id: 'founder-2',
      uid: 'founder-seed-2',
      memberNumber: 'TUJ-002',
      fullName: 'Amina Juma',
      preferredNetwork: 'Mixx by Yas' as MobileNetwork,
      maskedPhone: '+255 71 *** 418',
      totalShares: 10,
      totalSavedTsh: 100000,
      socialFundTsh: 20000,
      activeLoanBalanceTsh: 0,
      totalLoanRepaidTsh: 0,
      totalFinesTsh: 0,
    },
    {
      id: 'founder-3',
      uid: 'founder-seed-3',
      memberNumber: 'TUJ-003',
      fullName: 'Grace Mwakasege',
      preferredNetwork: 'Airtel Money' as MobileNetwork,
      maskedPhone: '+255 78 *** 892',
      totalShares: 11,
      totalSavedTsh: 110000,
      socialFundTsh: 22000,
      activeLoanBalanceTsh: 100000,
      totalLoanRepaidTsh: 32000,
      totalFinesTsh: 0,
      activeLoanId: 'loan-founder-3',
    },
    {
      id: 'founder-4',
      uid: 'founder-seed-4',
      memberNumber: 'TUJ-004',
      fullName: 'Neema Mollel',
      preferredNetwork: 'M-Pesa' as MobileNetwork,
      maskedPhone: '+255 76 *** 534',
      totalShares: 9,
      totalSavedTsh: 90000,
      socialFundTsh: 18000,
      activeLoanBalanceTsh: 0,
      totalLoanRepaidTsh: 0,
      totalFinesTsh: 0,
    },
  ];

  for (const f of founders) {
    const memberRef = doc(db, 'members', f.id);
    batch.set(memberRef, {
      uid: f.uid,
      memberNumber: f.memberNumber,
      fullName: f.fullName,
      role: 'founder',
      status: 'active',
      preferredNetwork: f.preferredNetwork,
      maskedPhone: f.maskedPhone,
      totalShares: f.totalShares,
      totalSavedTsh: f.totalSavedTsh,
      socialFundTsh: f.socialFundTsh,
      activeLoanBalanceTsh: f.activeLoanBalanceTsh,
      totalLoanRepaidTsh: f.totalLoanRepaidTsh,
      totalFinesTsh: f.totalFinesTsh,
      ...(f.activeLoanId ? { activeLoanId: f.activeLoanId } : {}),
      lastPaymentAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const loanRef = doc(db, 'loans', 'loan-founder-3');
  batch.set(loanRef, {
    memberId: 'founder-3',
    memberUid: 'founder-seed-3',
    memberNumber: 'TUJ-003',
    memberName: 'Grace Mwakasege',
    principalTsh: 120000,
    interestTsh: 12000,
    totalDueTsh: 132000,
    repaidTsh: 32000,
    remainingTsh: 100000,
    durationMonths: 3,
    purpose: 'Restocking tailoring materials & fabric',
    guarantorName: 'Amina Juma (TUJ-002)',
    status: 'active',
    dueDate: '2027-01-15',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const pay1Ref = doc(db, 'payments', 'seed-pay-1');
  batch.set(pay1Ref, {
    uid: params.uid,
    memberId: 'founder-1',
    memberNumber: 'TUJ-001',
    memberName: founder1Name,
    category: 'weekly_contribution',
    sharesCount: 1,
    amountTsh: 12000,
    provider: 'M-Pesa',
    maskedPhone: '+255 75 *** 201',
    reference: 'MP261184A',
    status: 'confirmed',
    createdAt: serverTimestamp(),
  });

  const pay2Ref = doc(db, 'payments', 'seed-pay-2');
  batch.set(pay2Ref, {
    uid: 'founder-seed-3',
    memberId: 'founder-3',
    memberNumber: 'TUJ-003',
    memberName: 'Grace Mwakasege',
    category: 'loan_repayment',
    sharesCount: 0,
    amountTsh: 32000,
    provider: 'Airtel Money',
    maskedPhone: '+255 78 *** 892',
    reference: 'AM261139C',
    status: 'confirmed',
    createdAt: serverTimestamp(),
  });

  const notif1Ref = doc(db, 'notifications', 'seed-notif-1');
  batch.set(notif1Ref, {
    senderUid: params.uid,
    eventType: 'payment_received',
    title: 'Member Payment Notification',
    message: 'Member No. TUJ-001 made a payment of 12,000 TSH.',
    memberNumber: 'TUJ-001',
    amountTsh: 12000,
    provider: 'M-Pesa',
    recipientCount: 4,
    createdAt: serverTimestamp(),
  });

  const notif2Ref = doc(db, 'notifications', 'seed-notif-2');
  batch.set(notif2Ref, {
    senderUid: params.uid,
    eventType: 'payment_received',
    title: 'Member Payment Notification',
    message: 'Member No. TUJ-003 made a payment of 32,000 TSH.',
    memberNumber: 'TUJ-003',
    amountTsh: 32000,
    provider: 'Airtel Money',
    recipientCount: 4,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'groups/tujenge-main');
  }

  await ensureSeededResourcesAndMeetings(params.uid, params.displayName);
}

async function ensureSeededResourcesAndMeetings(
  adminUid: string,
  adminName: string | null
): Promise<void> {
  const cleanAdminName = (adminName || 'Sarah Kapuya').slice(0, 80);

  // Seed official documents if missing
  const policyDocRef = doc(db, 'documents', 'seed-doc-official-policy');
  try {
    const docSnap = await getDoc(policyDocRef);
    if (!docSnap.exists()) {
      const batch = writeBatch(db);
      batch.set(policyDocRef, {
        groupId: GROUP_DOC_ID,
        title:
          'Official Weekly Contribution & Sunday Fine Policy / Sera Rasmi ya Michango na Faini ya Jumapili',
        category: 'Policy',
        content:
          'ENGLISH:\n1. Payment of the week must be made every Sunday.\n2. Missing the Sunday weekly payment results in a 5,000 TSH fine.\n3. The minimum weekly share contribution is 12,000 TSH (10,000 TSH Hisa + 2,000 TSH Jamii). Members may contribute above 12,000 TSH.\n4. Paste your mobile money SMS confirmation and tap "I Have Paid" immediately after sending.\n\nKISWAHILI:\n1. Malipo ya wiki lazima yafanyike kila Jumapili.\n2. Kutofanya malipo ya wiki kila Jumapili husababisha faini ya 5,000 TSH.\n3. Kiwango cha chini cha mchango wa wiki ni 12,000 TSH (10,000 TSH Hisa + 2,000 TSH Jamii). Mwanachama anaweza kulipa zaidi ya 12,000 TSH.\n4. Bandika ujumbe wa malipo ya simu kisha ubonyeze "Nimelipa" mara tu baada ya kutuma.',
        visibility: 'public',
        addedByUid: adminUid,
        addedByName: cleanAdminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'documents', 'seed-doc-loan-policy'), {
        groupId: GROUP_DOC_ID,
        title:
          'Loan Eligibility, 10% Interest & Quarterly Meetings / Kanuni za Mikopo, Riba 10% na Mikutano ya Miezi 3',
        category: 'Constitution',
        content:
          'ENGLISH:\n1. Members may apply for a loan up to 3x their saved Hisa balance.\n2. Standard group loan interest is 10% flat for 1 to 6 months.\n3. Every 3 months, all members meet on Sunday to review individual share reports, total group pool collected, Jamii emergency fund payouts, and active loan repayments.\n\nKISWAHILI:\n1. Mwanachama anaweza kuomba mkopo hadi mara 3 (3x) ya akiba yake ya Hisa.\n2. Riba ya kawaida ya mkopo wa kikundi ni 10% kwa muda wa mwezi 1 hadi 6.\n3. Kila baada ya miezi 3, wanachama wote hukutana siku ya Jumapili kupitia ripoti ya Hisa za kila mwanachama, jumla ya makusanyo, mfuko wa Jamii, na marejesho ya mikopo.',
        visibility: 'public',
        addedByUid: adminUid,
        addedByName: cleanAdminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'documents');
  }

  // Seed 3-month quarterly meetings calendar if missing
  const firstMtgRef = doc(db, 'meetings', 'seed-mtg-q4-2026');
  try {
    const mtgSnap = await getDoc(firstMtgRef);
    if (!mtgSnap.exists()) {
      const batch = writeBatch(db);
      const quarterlySchedule = [
        {
          id: 'seed-mtg-q4-2026',
          title: 'Q4 2026 Quarterly Share-Out & Contribution Review',
          quarterLabel: 'Q4 2026',
          meetingDate: '2026-11-29',
          meetingTime: '15:00 EAT',
          location: 'Sinza Community Hall & WhatsApp Video',
          agenda:
            'Review every member Hisa & Jamii share report, confirm Sunday collections, audit active loans, and plan Q1 2027 goals.',
          status: 'scheduled',
        },
        {
          id: 'seed-mtg-q1-2027',
          title: 'Q1 2027 Quarterly VICOBA General Meeting',
          quarterLabel: 'Q1 2027',
          meetingDate: '2027-02-28',
          meetingTime: '15:00 EAT',
          location: 'Sinza Community Hall & WhatsApp Video',
          agenda:
            'Present 3-month total collected report, individual member share progress, Jamii solidarity payouts, and new loan approvals.',
          status: 'scheduled',
        },
        {
          id: 'seed-mtg-q2-2027',
          title: 'Q2 2027 Mid-Year Share & Loan Audit Meeting',
          quarterLabel: 'Q2 2027',
          meetingDate: '2027-05-30',
          meetingTime: '15:00 EAT',
          location: 'Sinza Community Hall & WhatsApp Video',
          agenda:
            'Mid-year dividend projection, individual member share statements, and repayment schedule verification.',
          status: 'scheduled',
        },
        {
          id: 'seed-mtg-q3-2027',
          title: 'Q3 2027 Quarterly Review & Pre-Cycle Planning',
          quarterLabel: 'Q3 2027',
          meetingDate: '2027-08-29',
          meetingTime: '15:00 EAT',
          location: 'Sinza Community Hall & WhatsApp Video',
          agenda:
            'Quarterly share ledger audit, loan clearance deadline review, and next cycle preparation.',
          status: 'scheduled',
        },
      ];

      for (const m of quarterlySchedule) {
        batch.set(doc(db, 'meetings', m.id), {
          groupId: GROUP_DOC_ID,
          title: m.title,
          quarterLabel: m.quarterLabel,
          meetingDate: m.meetingDate,
          meetingTime: m.meetingTime,
          location: m.location,
          agenda: m.agenda,
          status: m.status,
          createdByUid: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'meetings');
  }
}

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
}): Promise<{ memberId: string; memberNumber: string }> {
  const memberId = `mem-${sanitizeIdPart(params.uid)}`;
  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const memberRef = doc(db, 'members', memberId);
  const piiRef = doc(db, 'members', memberId, 'private', 'pii');
  const notifRef = doc(collection(db, 'notifications'));

  try {
    const result = await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists()) {
        throw new Error('The Tujenge Hub group ledger is not initialized yet.');
      }
      const existingMemberSnap = await tx.get(memberRef);
      if (existingMemberSnap.exists()) {
        const existingData = existingMemberSnap.data() as MemberLedger;
        return { memberId, memberNumber: existingData.memberNumber };
      }

      const groupData = groupSnap.data();
      const seq = Number(groupData.nextMemberSeq || 1);
      const memberCount = Number(groupData.memberCount || 0);
      const memberNumber = formatMemberNumber(seq);
      const cleanName = params.fullName.trim().slice(0, 80);
      const cleanMasked = maskPhone(params.phone.trim());
      const cleanNationalId = params.nationalId?.trim().slice(0, 40) || '';

      tx.set(memberRef, {
        uid: params.uid,
        memberNumber,
        fullName: cleanName,
        role: 'member',
        status: 'active',
        preferredNetwork: params.preferredNetwork,
        maskedPhone: cleanMasked,
        totalShares: 0,
        totalSavedTsh: 0,
        socialFundTsh: 0,
        activeLoanBalanceTsh: 0,
        totalLoanRepaidTsh: 0,
        totalFinesTsh: 0,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(piiRef, {
        uid: params.uid,
        phone: params.phone.trim().slice(0, 24),
        ...(params.email.trim() ? { email: params.email.trim().slice(0, 120) } : {}),
        nextOfKinName: params.nextOfKinName.trim().slice(0, 80),
        nextOfKinPhone: params.nextOfKinPhone.trim().slice(0, 24),
        mtaaHouseNumber: params.mtaaHouseNumber.trim().slice(0, 140),
        ...(cleanNationalId ? { nationalId: cleanNationalId } : {}),
        startingCommitmentShares: Math.max(
          0,
          Math.min(1000, params.startingCommitmentShares)
        ),
        createdAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        nextMemberSeq: seq + 1,
        memberCount: memberCount + 1,
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.uid,
        eventType: 'member_joined',
        title: 'New Member Joined Tujenge Hub',
        message: `${cleanName} joined via invite link and was automatically assigned Member No. ${memberNumber}.`,
        memberNumber,
        recipientCount: memberCount + 1,
        createdAt: serverTimestamp(),
      });

      return { memberId, memberNumber };
    });

    return result;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `members/${memberId}`);
  }
}

export async function fetchMemberPrivatePii(
  memberId: string
): Promise<MemberPrivatePii | null> {
  const piiRef = doc(db, 'members', memberId, 'private', 'pii');
  try {
    const snap = await getDoc(piiRef);
    return snap.exists() ? (snap.data() as MemberPrivatePii) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `members/${memberId}/private/pii`);
  }
}

export type WeeklySplitMode = 'extra_to_hisa' | 'multi_week';

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
}> {
  const cleanRef =
    params.reference
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 40) || `PAY${Date.now()}`;

  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const memberRef = doc(db, 'members', params.member.id);
  const paymentRef = doc(db, 'payments', `ref-${cleanRef}`);
  const notifRef = doc(collection(db, 'notifications'));
  const loanRef =
    params.category === 'loan_repayment' && params.member.activeLoanId
      ? doc(db, 'loans', params.member.activeLoanId)
      : null;

  try {
    return await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      const existingPaySnap = await tx.get(paymentRef);
      const loanSnap = loanRef ? await tx.get(loanRef) : null;

      if (!groupSnap.exists() || !memberSnap.exists()) {
        throw new Error('Group or member ledger record could not be found.');
      }
      if (existingPaySnap.exists()) {
        throw new Error(
          `Payment reference ${cleanRef} has already been submitted.`
        );
      }

      const groupData = groupSnap.data();
      const memberData = memberSnap.data() as MemberLedger;
      const memberCount = Number(groupData.memberCount || 1);
      const sharePriceTsh = Number(groupData.sharePriceTsh || 10000);
      const socialFundUnitTsh = Number(groupData.socialFundTsh ?? 2000);
      const weeklyBundleTsh = sharePriceTsh + socialFundUnitTsh;

      const cleanAmount = Math.max(1000, Math.round(params.amountTsh));
      let cleanShares = 0;
      let hisaAddedTsh = 0;
      let jamiiAddedTsh = 0;

      if (params.category === 'weekly_contribution') {
        if (cleanAmount >= weeklyBundleTsh) {
          const splitMode = params.weeklySplitMode || 'extra_to_hisa';
          if (splitMode === 'multi_week') {
            const weeks = Math.max(1, Math.floor(cleanAmount / weeklyBundleTsh));
            jamiiAddedTsh = weeks * socialFundUnitTsh;
            hisaAddedTsh = Math.max(0, cleanAmount - jamiiAddedTsh);
          } else {
            jamiiAddedTsh = socialFundUnitTsh;
            hisaAddedTsh = Math.max(0, cleanAmount - jamiiAddedTsh);
          }
          cleanShares = sharePriceTsh > 0 ? Math.floor(hisaAddedTsh / sharePriceTsh) : 0;
        } else {
          jamiiAddedTsh = cleanAmount;
        }
      } else if (params.category === 'shares') {
        cleanShares = Math.max(
          1,
          Math.round(params.sharesCount || Math.floor(cleanAmount / sharePriceTsh))
        );
        hisaAddedTsh = cleanAmount;
      } else if (params.category === 'social_fund') {
        jamiiAddedTsh = cleanAmount;
      }

      const masked = maskPhone(params.phone.trim() || memberData.maskedPhone);

      tx.set(paymentRef, {
        uid: params.actorUid,
        memberId: params.member.id,
        memberNumber: memberData.memberNumber,
        memberName: memberData.fullName,
        category: params.category,
        sharesCount: cleanShares,
        hisaTsh: hisaAddedTsh,
        jamiiTsh: jamiiAddedTsh,
        amountTsh: cleanAmount,
        provider: params.provider,
        maskedPhone: masked,
        reference: cleanRef,
        status: 'confirmed',
        createdAt: serverTimestamp(),
      });

      const previousShares = Number(memberData.totalShares || 0);
      const previousSocialFundTsh = Number(memberData.socialFundTsh || 0);
      let nextTotalShares = previousShares;
      let nextSavedTsh = Number(memberData.totalSavedTsh || 0);
      let nextSocialTsh = previousSocialFundTsh;
      let nextLoanBal = Number(memberData.activeLoanBalanceTsh || 0);
      let nextMemberLoanRepaid = Number(memberData.totalLoanRepaidTsh || 0);
      let nextMemberFines = Number(memberData.totalFinesTsh || 0);
      let nextUnpaidFines = Number(memberData.unpaidFineTsh || 0);

      let nextGroupShares = Number(groupData.totalShares || 0);
      let nextGroupPool = Number(groupData.totalGroupPoolTsh || 0);
      let nextGroupLoanOut = Number(groupData.totalLoanOutTsh || 0);
      let nextGroupLoanRepaid = Number(groupData.totalLoanRepaidTsh || 0);

      if (params.category === 'weekly_contribution') {
        nextTotalShares += cleanShares;
        nextSavedTsh += hisaAddedTsh;
        nextSocialTsh += jamiiAddedTsh;
        nextGroupShares += cleanShares;
        nextGroupPool += cleanAmount;
      } else if (params.category === 'shares') {
        nextTotalShares += cleanShares;
        nextSavedTsh += cleanAmount;
        nextGroupShares += cleanShares;
        nextGroupPool += cleanAmount;
      } else if (params.category === 'social_fund') {
        nextSocialTsh += cleanAmount;
        nextGroupPool += cleanAmount;
      } else if (params.category === 'fine') {
        nextMemberFines += cleanAmount;
        nextUnpaidFines = Math.max(0, nextUnpaidFines - cleanAmount);
        nextGroupPool += cleanAmount;
      } else {
        const applied = Math.min(nextLoanBal, cleanAmount);
        nextLoanBal = Math.max(0, nextLoanBal - applied);
        nextMemberLoanRepaid += cleanAmount;
        nextGroupPool += cleanAmount;
        nextGroupLoanOut = Math.max(0, nextGroupLoanOut - applied);
        nextGroupLoanRepaid += cleanAmount;

        if (loanRef && loanSnap?.exists()) {
          const loanData = loanSnap.data() as MemberLoan;
          const nextRepaid = Number(loanData.repaidTsh || 0) + applied;
          const nextRemaining = Math.max(0, Number(loanData.remainingTsh || 0) - applied);
          tx.update(loanRef, {
            repaidTsh: nextRepaid,
            remainingTsh: nextRemaining,
            status: nextRemaining === 0 ? 'paid' : 'active',
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(memberRef, {
        totalShares: nextTotalShares,
        totalSavedTsh: nextSavedTsh,
        socialFundTsh: nextSocialTsh,
        activeLoanBalanceTsh: nextLoanBal,
        totalLoanRepaidTsh: nextMemberLoanRepaid,
        totalFinesTsh: nextMemberFines,
        unpaidFineTsh: nextUnpaidFines,
        lastPaymentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        totalShares: nextGroupShares,
        totalGroupPoolTsh: nextGroupPool,
        totalLoanOutTsh: nextGroupLoanOut,
        totalLoanRepaidTsh: nextGroupLoanRepaid,
        updatedAt: serverTimestamp(),
      });

      const broadcastMessage = `Member No. ${memberData.memberNumber} made a payment of ${formatTsh(
        cleanAmount
      )}.`;

      tx.set(notifRef, {
        senderUid: params.actorUid,
        eventType: 'payment_received',
        title: 'Member Payment Notification',
        message: broadcastMessage.slice(0, 320),
        memberNumber: memberData.memberNumber,
        amountTsh: cleanAmount,
        provider: params.provider,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });

      return {
        reference: cleanRef,
        broadcastMessage,
        recipientCount: memberCount,
        previousShares,
        newShares: nextTotalShares,
        newSavedTsh: nextSavedTsh,
        previousSocialFundTsh,
        newSocialFundTsh: nextSocialTsh,
        hisaAddedTsh,
        jamiiAddedTsh,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'payments');
  }
}

export async function requestMemberLoan(params: {
  member: MemberLedger;
  principalTsh: number;
  durationMonths: number;
  purpose: string;
  guarantorName?: string;
}): Promise<{ loanId: string; totalDueTsh: number }> {
  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const loanRef = doc(collection(db, 'loans'));
  const notifRef = doc(collection(db, 'notifications'));

  try {
    return await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists()) {
        throw new Error('Group record not found.');
      }
      const groupData = groupSnap.data();
      const interestPct = Number(groupData.interestRatePct || 10);
      const loanMultiplier = Number(groupData.loanMultiplier || 3);
      const maxEligible = Math.max(10000, params.member.totalSavedTsh * loanMultiplier);

      const principal = Math.round(params.principalTsh);
      if (principal > maxEligible && params.member.totalSavedTsh > 0) {
        throw new Error(
          `Requested amount exceeds your ${loanMultiplier}x Hisa limit of ${formatTsh(maxEligible)}.`
        );
      }

      const interest = Math.round((principal * interestPct) / 100);
      const totalDue = principal + interest;

      const due = new Date();
      due.setMonth(due.getMonth() + params.durationMonths);
      const dueDate = due.toISOString().slice(0, 10);
      const memberCount = Number(groupData.memberCount || 1);

      tx.set(loanRef, {
        memberId: params.member.id,
        memberUid: params.member.uid,
        memberNumber: params.member.memberNumber,
        memberName: params.member.fullName,
        principalTsh: principal,
        interestTsh: interest,
        totalDueTsh: totalDue,
        repaidTsh: 0,
        remainingTsh: totalDue,
        durationMonths: params.durationMonths,
        purpose: params.purpose.trim().slice(0, 120),
        ...(params.guarantorName?.trim()
          ? { guarantorName: params.guarantorName.trim().slice(0, 80) }
          : {}),
        status: 'pending',
        dueDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.member.uid,
        eventType: 'loan_requested',
        title: 'New Loan Application Submitted',
        message: `${params.member.memberNumber} (${params.member.fullName}) applied for a loan of ${formatTsh(
          principal
        )} for ${params.purpose.trim().slice(0, 60)}.`,
        memberNumber: params.member.memberNumber,
        amountTsh: principal,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });

      return { loanId: loanRef.id, totalDueTsh: totalDue };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'loans');
  }
}

export async function approvePendingLoan(params: {
  adminUid: string;
  loan: MemberLoan;
}): Promise<void> {
  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const memberRef = doc(db, 'members', params.loan.memberId);
  const loanRef = doc(db, 'loans', params.loan.id);
  const notifRef = doc(collection(db, 'notifications'));

  try {
    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      const loanSnap = await tx.get(loanRef);
      if (!groupSnap.exists() || !memberSnap.exists() || !loanSnap.exists()) {
        throw new Error('Loan, member, or group document not found.');
      }
      const loanData = loanSnap.data() as MemberLoan;
      if (loanData.status !== 'pending') {
        throw new Error('This loan request has already been processed.');
      }

      const memberData = memberSnap.data() as MemberLedger;
      if (memberData.activeLoanBalanceTsh > 0) {
        throw new Error(`${memberData.fullName} already has an active loan balance.`);
      }

      const groupData = groupSnap.data();
      const memberCount = Number(groupData.memberCount || 1);

      tx.update(loanRef, {
        status: 'active',
        updatedAt: serverTimestamp(),
      });

      tx.update(memberRef, {
        activeLoanBalanceTsh: loanData.remainingTsh,
        activeLoanId: params.loan.id,
        updatedAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        totalLoanOutTsh: Number(groupData.totalLoanOutTsh || 0) + loanData.remainingTsh,
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.adminUid,
        eventType: 'loan_issued',
        title: 'Loan Application Approved',
        message: `${loanData.memberNumber} (${loanData.memberName}) loan of ${formatTsh(
          loanData.principalTsh
        )} was approved (Due ${loanData.dueDate}).`,
        memberNumber: loanData.memberNumber,
        amountTsh: loanData.principalTsh,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `loans/${params.loan.id}`);
  }
}

export async function declinePendingLoan(loanId: string): Promise<void> {
  const loanRef = doc(db, 'loans', loanId);
  try {
    await updateDoc(loanRef, {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `loans/${loanId}`);
  }
}

export async function issueMemberLoan(params: {
  adminUid: string;
  member: MemberLedger;
  principalTsh: number;
  durationMonths: number;
  purpose: string;
  guarantorName?: string;
}): Promise<{ loanId: string; totalDueTsh: number }> {
  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const memberRef = doc(db, 'members', params.member.id);
  const loanRef = doc(collection(db, 'loans'));
  const notifRef = doc(collection(db, 'notifications'));

  try {
    return await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      if (!groupSnap.exists() || !memberSnap.exists()) {
        throw new Error('Group or member record not found.');
      }

      const groupData = groupSnap.data();
      const memberData = memberSnap.data() as MemberLedger;
      if (memberData.activeLoanBalanceTsh > 0) {
        throw new Error(`${memberData.fullName} already has an active loan balance.`);
      }

      const interestPct = Number(groupData.interestRatePct || 10);
      const principal = Math.round(params.principalTsh);
      const interest = Math.round((principal * interestPct) / 100);
      const totalDue = principal + interest;

      const due = new Date();
      due.setMonth(due.getMonth() + params.durationMonths);
      const dueDate = due.toISOString().slice(0, 10);
      const memberCount = Number(groupData.memberCount || 1);

      tx.set(loanRef, {
        memberId: params.member.id,
        memberUid: memberData.uid,
        memberNumber: memberData.memberNumber,
        memberName: memberData.fullName,
        principalTsh: principal,
        interestTsh: interest,
        totalDueTsh: totalDue,
        repaidTsh: 0,
        remainingTsh: totalDue,
        durationMonths: params.durationMonths,
        purpose: params.purpose.trim().slice(0, 120),
        ...(params.guarantorName?.trim()
          ? { guarantorName: params.guarantorName.trim().slice(0, 80) }
          : {}),
        status: 'active',
        dueDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(memberRef, {
        activeLoanBalanceTsh: totalDue,
        activeLoanId: loanRef.id,
        updatedAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        totalLoanOutTsh: Number(groupData.totalLoanOutTsh || 0) + totalDue,
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.adminUid,
        eventType: 'loan_issued',
        title: 'Group Loan Disbursed',
        message: `${memberData.memberNumber} (${memberData.fullName}) received a loan of ${formatTsh(
          principal
        )} (${interestPct}% interest · Due ${dueDate}).`,
        memberNumber: memberData.memberNumber,
        amountTsh: principal,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });

      return { loanId: loanRef.id, totalDueTsh: totalDue };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'loans');
  }
}

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
}): Promise<string> {
  const docRef = doc(collection(db, 'documents'));
  const notifRef = doc(collection(db, 'notifications'));
  const batch = writeBatch(db);

  batch.set(docRef, {
    groupId: GROUP_DOC_ID,
    title: params.title.trim().slice(0, 120),
    category: params.category,
    content: params.content.trim().slice(0, 4000),
    ...(params.externalUrl?.trim()
      ? { externalUrl: params.externalUrl.trim().slice(0, 300) }
      : {}),
    ...(params.attachmentName?.trim()
      ? { attachmentName: params.attachmentName.trim().slice(0, 120) }
      : {}),
    visibility: params.visibility,
    addedByUid: params.adminUid,
    addedByName: (params.adminName || 'Admin').trim().slice(0, 80),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(notifRef, {
    senderUid: params.adminUid,
    eventType: 'document_added',
    title: 'New Group Resource Document',
    message: `Admin added "${params.title.trim().slice(0, 80)}" (${params.category}) to the Resources page.`,
    recipientCount: Math.max(1, params.memberCount),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'documents');
  }
}

export async function deleteGroupDocument(docId: string): Promise<void> {
  const docRef = doc(db, 'documents', docId);
  try {
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `documents/${docId}`);
  }
}

export async function addGroupMeeting(params: {
  adminUid: string;
  title: string;
  quarterLabel: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agenda: string;
  memberCount: number;
}): Promise<string> {
  const mtgRef = doc(collection(db, 'meetings'));
  const notifRef = doc(collection(db, 'notifications'));
  const batch = writeBatch(db);

  batch.set(mtgRef, {
    groupId: GROUP_DOC_ID,
    title: params.title.trim().slice(0, 100),
    quarterLabel: params.quarterLabel.trim().slice(0, 32),
    meetingDate: params.meetingDate.trim().slice(0, 20),
    meetingTime: params.meetingTime.trim().slice(0, 20),
    location: params.location.trim().slice(0, 120),
    agenda: params.agenda.trim().slice(0, 500),
    status: 'scheduled',
    createdByUid: params.adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(notifRef, {
    senderUid: params.adminUid,
    eventType: 'meeting_reminder',
    title: 'Quarterly Meeting Scheduled',
    message: `${params.quarterLabel}: ${params.title.trim().slice(0, 80)} on ${params.meetingDate} at ${params.meetingTime} (${params.location.trim().slice(0, 50)}).`,
    recipientCount: Math.max(1, params.memberCount),
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return mtgRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'meetings');
  }
}

export async function toggleMeetingStatus(
  meeting: GroupMeeting
): Promise<void> {
  const mtgRef = doc(db, 'meetings', meeting.id);
  try {
    await updateDoc(mtgRef, {
      status: meeting.status === 'scheduled' ? 'completed' : 'scheduled',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `meetings/${meeting.id}`);
  }
}

export async function sendMeetingReminderBroadcast(params: {
  senderUid: string;
  meeting: GroupMeeting;
  memberCount: number;
  deterministicKey?: string;
}): Promise<void> {
  const notifRef = params.deterministicKey
    ? doc(db, 'notifications', params.deterministicKey)
    : doc(collection(db, 'notifications'));

  if (params.deterministicKey) {
    try {
      const existing = await getDoc(notifRef);
      if (existing.exists()) return;
    } catch {
      return;
    }
  }

  try {
    await setDoc(notifRef, {
      senderUid: params.senderUid,
      eventType: 'meeting_reminder',
      title: `Meeting Reminder · ${params.meeting.quarterLabel}`,
      message: `Reminder: ${params.meeting.title} is on ${params.meeting.meetingDate} at ${params.meeting.meetingTime} (${params.meeting.location}). Member share reports will be reviewed.`,
      recipientCount: Math.max(1, params.memberCount),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'notifications');
  }
}

export async function applySundayFineToMember(params: {
  adminUid: string;
  member: MemberLedger;
  fineTsh: number;
  weekLabel: string;
  memberCount: number;
}): Promise<void> {
  const memberRef = doc(db, 'members', params.member.id);
  const notifRef = doc(collection(db, 'notifications'));
  const cleanFine = Math.max(1000, Math.round(params.fineTsh));

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(memberRef);
      if (!snap.exists()) {
        throw new Error('Member ledger record not found.');
      }
      const mData = snap.data() as MemberLedger;
      const nextUnpaid = Number(mData.unpaidFineTsh || 0) + cleanFine;

      tx.update(memberRef, {
        unpaidFineTsh: nextUnpaid,
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.adminUid,
        eventType: 'fine_applied',
        title: 'Sunday Missed Payment Fine',
        message: `Sunday fine of ${formatTsh(cleanFine)} applied to ${mData.memberNumber} for week ${params.weekLabel}.`,
        memberNumber: mData.memberNumber,
        amountTsh: cleanFine,
        recipientCount: Math.max(1, params.memberCount),
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `members/${params.member.id}`);
  }
}

export async function sendSundayRollCallReminder(params: {
  adminUid: string;
  pendingNumbers: string[];
  sundayDateStr: string;
  memberCount: number;
}): Promise<void> {
  const notifRef = doc(collection(db, 'notifications'));
  const summaryNumbers =
    params.pendingNumbers.length > 0
      ? `Pending: ${params.pendingNumbers.slice(0, 8).join(', ')}${params.pendingNumbers.length > 8 ? '...' : ''}.`
      : 'All members are encouraged to verify their Sunday payment.';

  try {
    await setDoc(notifRef, {
      senderUid: params.adminUid,
      eventType: 'meeting_reminder',
      title: 'Sunday Contribution Reminder (12,000 TSH Min)',
      message: `Weekly share due by Sunday (${params.sundayDateStr}). Min 12,000 TSH (5,000 TSH late fine). ${summaryNumbers}`.slice(
        0,
        320
      ),
      recipientCount: Math.max(1, params.memberCount),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'notifications');
  }
}

export async function recordJamiiPayout(params: {
  adminUid: string;
  member: MemberLedger;
  reason: JamiiPayoutReason;
  notes: string;
  amountTsh: number;
  payoutDate: string;
}): Promise<string> {
  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const payoutRef = doc(collection(db, 'jamii_payouts'));
  const notifRef = doc(collection(db, 'notifications'));
  const cleanAmount = Math.max(1000, Math.round(params.amountTsh));

  try {
    return await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      if (!groupSnap.exists()) {
        throw new Error('Group record not found.');
      }
      const gData = groupSnap.data();
      const memberCount = Number(gData.memberCount || 1);
      const nextJamiiOut = Number(gData.totalJamiiOutTsh || 0) + cleanAmount;
      const nextGroupPool = Math.max(0, Number(gData.totalGroupPoolTsh || 0) - cleanAmount);

      tx.set(payoutRef, {
        groupId: GROUP_DOC_ID,
        memberId: params.member.id,
        memberNumber: params.member.memberNumber,
        memberName: params.member.fullName,
        reason: params.reason,
        notes: params.notes.trim().slice(0, 240),
        amountTsh: cleanAmount,
        payoutDate: params.payoutDate.trim().slice(0, 20),
        approvedByUid: params.adminUid,
        createdAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        totalJamiiOutTsh: nextJamiiOut,
        totalGroupPoolTsh: nextGroupPool,
        updatedAt: serverTimestamp(),
      });

      tx.set(notifRef, {
        senderUid: params.adminUid,
        eventType: 'jamii_payout',
        title: `Jamii Solidarity Support · ${params.reason}`,
        message: `Group approved ${formatTsh(cleanAmount)} Jamii support for ${params.member.memberNumber} (${params.reason}).`.slice(
          0,
          320
        ),
        memberNumber: params.member.memberNumber,
        amountTsh: cleanAmount,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });

      return payoutRef.id;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'jamii_payouts');
  }
}

export async function adjustOrReversePayment(params: {
  adminUid: string;
  payment: MobilePayment;
  action: 'adjusted' | 'reversed';
  newAmountTsh: number;
  reason: string;
}): Promise<void> {
  if (params.payment.status === 'reversed') {
    throw new Error('This payment has already been reversed.');
  }

  const groupRef = doc(db, 'groups', GROUP_DOC_ID);
  const memberRef = doc(db, 'members', params.payment.memberId);
  const payRef = doc(db, 'payments', params.payment.id);
  const adjRef = doc(collection(db, 'payment_adjustments'));
  const notifRef = doc(collection(db, 'notifications'));

  const targetAmount =
    params.action === 'reversed'
      ? 0
      : Math.max(1000, Math.round(params.newAmountTsh));

  try {
    await runTransaction(db, async (tx) => {
      const groupSnap = await tx.get(groupRef);
      const memberSnap = await tx.get(memberRef);
      const paySnap = await tx.get(payRef);

      if (!groupSnap.exists() || !memberSnap.exists() || !paySnap.exists()) {
        throw new Error('Payment, member, or group document not found.');
      }

      const gData = groupSnap.data();
      const mData = memberSnap.data() as MemberLedger;
      const pData = paySnap.data() as MobilePayment;

      const loanRef =
        pData.category === 'loan_repayment' && mData.activeLoanId
          ? doc(db, 'loans', mData.activeLoanId)
          : null;
      const loanSnap = loanRef ? await tx.get(loanRef) : null;

      const oldAmount = Number(pData.amountTsh || 0);
      const oldShares = Number(pData.sharesCount || 0);
      const deltaAmount = targetAmount - oldAmount;

      const sharePriceTsh = Number(gData.sharePriceTsh || 10000);
      const socialFundUnitTsh = Number(gData.socialFundTsh ?? 2000);

      let newShares = 0;
      let oldHisa = 0;
      let oldJamii = 0;
      let newHisa = 0;
      let newJamii = 0;

      if (pData.category === 'weekly_contribution') {
        const weeklyBundleTsh = sharePriceTsh + socialFundUnitTsh;
        if (typeof pData.hisaTsh === 'number' && typeof pData.jamiiTsh === 'number') {
          oldHisa = pData.hisaTsh;
          oldJamii = pData.jamiiTsh;
        } else if (oldAmount >= weeklyBundleTsh) {
          const isExactMultiWeek =
            oldShares > 1 && oldAmount === oldShares * weeklyBundleTsh;
          oldJamii = isExactMultiWeek ? oldShares * socialFundUnitTsh : socialFundUnitTsh;
          oldHisa = Math.max(0, oldAmount - oldJamii);
        } else {
          oldJamii = oldAmount;
          oldHisa = 0;
        }

        if (targetAmount > 0) {
          if (targetAmount >= weeklyBundleTsh) {
            const wasMultiWeek =
              (typeof pData.jamiiTsh === 'number' &&
                pData.jamiiTsh > socialFundUnitTsh) ||
              (oldShares > 1 && oldAmount === oldShares * weeklyBundleTsh);
            if (wasMultiWeek) {
              const weeks = Math.max(1, Math.floor(targetAmount / weeklyBundleTsh));
              newJamii = weeks * socialFundUnitTsh;
            } else {
              newJamii = socialFundUnitTsh;
            }
            newHisa = Math.max(0, targetAmount - newJamii);
            newShares = sharePriceTsh > 0 ? Math.floor(newHisa / sharePriceTsh) : 0;
          } else {
            newJamii = targetAmount;
            newHisa = 0;
            newShares = 0;
          }
        }
      } else if (pData.category === 'shares') {
        oldHisa = typeof pData.hisaTsh === 'number' ? pData.hisaTsh : oldAmount;
        newHisa = targetAmount;
        newShares =
          targetAmount > 0 && sharePriceTsh > 0
            ? Math.max(1, Math.floor(targetAmount / sharePriceTsh))
            : 0;
      } else if (pData.category === 'social_fund') {
        oldJamii = typeof pData.jamiiTsh === 'number' ? pData.jamiiTsh : oldAmount;
        newJamii = targetAmount;
      }

      const deltaShares = newShares - oldShares;
      const deltaHisa = newHisa - oldHisa;
      const deltaJamii = newJamii - oldJamii;

      const nextMemberShares = Math.max(0, Number(mData.totalShares || 0) + deltaShares);
      const nextMemberSaved = Math.max(0, Number(mData.totalSavedTsh || 0) + deltaHisa);
      const nextMemberJamii = Math.max(0, Number(mData.socialFundTsh || 0) + deltaJamii);
      let nextMemberFines = Number(mData.totalFinesTsh || 0);
      let nextMemberUnpaidFines = Number(mData.unpaidFineTsh || 0);
      let nextMemberLoanBal = Number(mData.activeLoanBalanceTsh || 0);
      let nextMemberLoanRepaid = Number(mData.totalLoanRepaidTsh || 0);

      const nextGroupShares = Math.max(0, Number(gData.totalShares || 0) + deltaShares);
      const nextGroupPool = Math.max(0, Number(gData.totalGroupPoolTsh || 0) + deltaAmount);
      let nextGroupLoanOut = Number(gData.totalLoanOutTsh || 0);
      let nextGroupLoanRepaid = Number(gData.totalLoanRepaidTsh || 0);

      if (pData.category === 'fine') {
        nextMemberFines = Math.max(0, nextMemberFines + deltaAmount);
        nextMemberUnpaidFines = Math.max(0, nextMemberUnpaidFines - deltaAmount);
      } else if (pData.category === 'loan_repayment') {
        nextMemberLoanRepaid = Math.max(0, nextMemberLoanRepaid + deltaAmount);
        nextMemberLoanBal = Math.max(0, nextMemberLoanBal - deltaAmount);
        nextGroupLoanRepaid = Math.max(0, nextGroupLoanRepaid + deltaAmount);
        nextGroupLoanOut = Math.max(0, nextGroupLoanOut - deltaAmount);

        if (loanRef && loanSnap?.exists()) {
          const lData = loanSnap.data() as MemberLoan;
          const nextRepaid = Math.max(0, Number(lData.repaidTsh || 0) + deltaAmount);
          const nextRemaining = Math.max(0, Number(lData.totalDueTsh || 0) - nextRepaid);
          tx.update(loanRef, {
            repaidTsh: nextRepaid,
            remainingTsh: nextRemaining,
            status: nextRemaining === 0 ? 'paid' : 'active',
            updatedAt: serverTimestamp(),
          });
        }
      }

      tx.update(payRef, {
        amountTsh: targetAmount,
        sharesCount: newShares,
        hisaTsh: newHisa,
        jamiiTsh: newJamii,
        status: params.action,
        adjustedFromAmountTsh: oldAmount,
        adjustmentReason: params.reason.trim().slice(0, 200),
        adjustedByUid: params.adminUid,
        adjustedAt: serverTimestamp(),
      });

      tx.update(memberRef, {
        totalShares: nextMemberShares,
        totalSavedTsh: nextMemberSaved,
        socialFundTsh: nextMemberJamii,
        totalFinesTsh: nextMemberFines,
        unpaidFineTsh: nextMemberUnpaidFines,
        activeLoanBalanceTsh: nextMemberLoanBal,
        totalLoanRepaidTsh: nextMemberLoanRepaid,
        updatedAt: serverTimestamp(),
      });

      tx.update(groupRef, {
        totalShares: nextGroupShares,
        totalGroupPoolTsh: nextGroupPool,
        totalLoanOutTsh: nextGroupLoanOut,
        totalLoanRepaidTsh: nextGroupLoanRepaid,
        updatedAt: serverTimestamp(),
      });

      tx.set(adjRef, {
        groupId: GROUP_DOC_ID,
        paymentId: params.payment.id,
        reference: pData.reference,
        memberId: params.payment.memberId,
        memberNumber: pData.memberNumber,
        memberName: pData.memberName,
        action: params.action,
        previousAmountTsh: oldAmount,
        newAmountTsh: targetAmount,
        reason: params.reason.trim().slice(0, 200),
        adminUid: params.adminUid,
        createdAt: serverTimestamp(),
      });

      const memberCount = Number(gData.memberCount || 1);
      tx.set(notifRef, {
        senderUid: params.adminUid,
        eventType: 'payment_adjusted',
        title:
          params.action === 'reversed'
            ? 'Payment Reversed by Admin'
            : 'Payment Amount Adjusted by Admin',
        message:
          params.action === 'reversed'
            ? `Ref ${pData.reference} (${pData.memberNumber}) of ${formatTsh(oldAmount)} was reversed (${params.reason.trim().slice(0, 80)}).`
            : `Ref ${pData.reference} (${pData.memberNumber}) adjusted from ${formatTsh(oldAmount)} to ${formatTsh(targetAmount)}.`,
        memberNumber: pData.memberNumber,
        amountTsh: targetAmount,
        recipientCount: memberCount,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payments/${params.payment.id}`);
  }
}

export async function relinkMemberPhoneAndUid(params: {
  memberId: string;
  newPhone?: string;
  newUid?: string;
}): Promise<{ maskedPhone: string; uid: string }> {
  const cleanPhone = params.newPhone?.trim() || '';
  const cleanUid = params.newUid?.trim() || '';

  if (!cleanPhone && !cleanUid) {
    throw new Error('Enter a new phone number or a new Account ID.');
  }
  if (cleanPhone && (cleanPhone.length < 7 || cleanPhone.length > 24)) {
    throw new Error('Phone number must be between 7 and 24 characters.');
  }
  if (cleanUid && (cleanUid.length < 4 || cleanUid.length > 128)) {
    throw new Error('Account ID must be between 4 and 128 characters.');
  }

  const memberRef = doc(db, 'members', params.memberId);
  const piiRef = doc(db, 'members', params.memberId, 'private', 'pii');
  let result = { maskedPhone: '', uid: '' };

  try {
    await runTransaction(db, async (tx) => {
      const mSnap = await tx.get(memberRef);
      if (!mSnap.exists()) {
        throw new Error('Member ledger record not found.');
      }
      const mData = mSnap.data() as MemberLedger;
      const piiSnap = await tx.get(piiRef);
      const loanRef =
        cleanUid && mData.activeLoanId
          ? doc(db, 'loans', mData.activeLoanId)
          : null;
      const loanSnap = loanRef ? await tx.get(loanRef) : null;

      const nextMaskedPhone = cleanPhone ? maskPhone(cleanPhone) : mData.maskedPhone;
      const nextUid = cleanUid || mData.uid;

      tx.update(memberRef, {
        maskedPhone: nextMaskedPhone,
        uid: nextUid,
        updatedAt: serverTimestamp(),
      });

      if (piiSnap.exists()) {
        const piiUpdates: Record<string, unknown> = {};
        if (cleanPhone) piiUpdates.phone = cleanPhone;
        if (cleanUid) piiUpdates.uid = cleanUid;
        if (Object.keys(piiUpdates).length > 0) {
          tx.update(piiRef, piiUpdates);
        }
      }

      if (loanRef && loanSnap?.exists() && cleanUid) {
        tx.update(loanRef, {
          memberUid: nextUid,
          updatedAt: serverTimestamp(),
        });
      }

      result = { maskedPhone: nextMaskedPhone, uid: nextUid };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `members/${params.memberId}`);
  }

  return result;
}

