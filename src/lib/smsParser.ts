import { MobileNetwork } from '../types/vicoba';

export interface ParsedMobileMoneySms {
  amountTsh: number | null;
  reference: string | null;
  provider: MobileNetwork | null;
  detectedShares: number | null;
  detectedWeeks: number | null;
}

export const SAMPLE_PAYMENT_SMS: {
  label: string;
  provider: MobileNetwork;
  text: string;
}[] = [
  {
    label: 'M-Pesa (12,000 Min)',
    provider: 'M-Pesa',
    text: 'RL94K2M81P Confirmed. Tsh12,000.00 sent to TUJENGE HUB 5548920 on 15/11/26 at 10:42 AM. New M-Pesa balance is Tsh120,000.00.',
  },
  {
    label: 'M-Pesa Swahili / Wakala (12,000)',
    provider: 'M-Pesa',
    text: 'RL98W4K20N Imethibitishwa. Umelipa Tsh 12,000.00 kwenda TUJENGE HUB kwa Wakala 448120. Ada Tsh 0. Salio jipya la M-Pesa ni Tsh 82,000.00.',
  },
  {
    label: 'Mixx by Yas (22,000 · Extra Hisa)',
    provider: 'Mixx by Yas',
    text: 'Umefanikiwa kutuma Tsh 22,000 kwenda TUJENGE HUB (8823104). Kumbukumbu: TY88492019. Salio jipya ni Tsh 95,000.',
  },
  {
    label: 'Airtel Money (24,000 · 2 Wks)',
    provider: 'Airtel Money',
    text: 'Muamala umekamilika. Tsh 24,000 imetumwa kwa TUJENGE HUB 6120938. TID: PP261115.1422.A01234. Salio jipya Tsh 64,500.',
  },
  {
    label: 'Halopesa (12,000 Min)',
    provider: 'Halopesa',
    text: 'Halopesa: Umelipa Tsh 12,000 kwenda TUJENGE HUB (901122). Namba ya muamala: HP2611159912. Salio jipya ni Tsh 58,000.',
  },
];

function parseCurrencyNumber(raw: string): number | null {
  const parsed = Math.round(Number(raw.replace(/,/g, '')));
  if (Number.isNaN(parsed) || parsed < 500) return null;
  return parsed;
}

export function parseMobileMoneySms(
  rawSms: string,
  sharePriceTsh: number,
  socialFundTsh = 2000
): ParsedMobileMoneySms {
  const text = rawSms.trim();
  if (!text) {
    return {
      amountTsh: null,
      reference: null,
      provider: null,
      detectedShares: null,
      detectedWeeks: null,
    };
  }

  // Detect provider (explicit keywords first, then code prefixes)
  let provider: MobileNetwork | null = null;
  const lower = text.toLowerCase();
  if (lower.includes('m-pesa') || lower.includes('mpesa') || lower.includes('vodacom')) {
    provider = 'M-Pesa';
  } else if (
    lower.includes('mixx') ||
    lower.includes('yas') ||
    lower.includes('tigo pesa') ||
    lower.includes('tigopesa') ||
    lower.includes('tigo')
  ) {
    provider = 'Mixx by Yas';
  } else if (lower.includes('airtel')) {
    provider = 'Airtel Money';
  } else if (lower.includes('halopesa') || lower.includes('halotel') || lower.includes('halo')) {
    provider = 'Halopesa';
  }

  // 1. Prioritize amount immediately attached to transfer/payment verbs (avoids picking initial balance or fees)
  let amountTsh: number | null = null;
  const actionAmountRegex =
    /(?:sent|paid|transferred|umetuma|umelipa|imewekwa|umeweka|umetumia|kutuma|kulipa|pokea)\s+(?:kiasi\s+cha\s+)?(?:tsh|tzs|sh)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
  const actionMatch = text.match(actionAmountRegex);
  if (actionMatch && actionMatch[1]) {
    amountTsh = parseCurrencyNumber(actionMatch[1]);
  }

  // 2. Fallback: look for any TSH/TZS currency match before "balance"/"salio"/"ada"/"fee"
  if (amountTsh === null) {
    const cleanedBody = text.split(/(?:new\s+.*balance|salio\s+jipya|salio\s+lako|ada\b|fee\b)/i)[0] || text;
    const currencyRegex = /(?:tsh|tzs|sh)\.?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;
    const currencyMatch = cleanedBody.match(currencyRegex) || text.match(currencyRegex);
    if (currencyMatch && currencyMatch[1]) {
      amountTsh = parseCurrencyNumber(currencyMatch[1]);
    } else {
      const plainNumMatch = cleanedBody.match(/\b([1-9][0-9]{3,7}(?:,[0-9]{3})*)\b/);
      if (plainNumMatch && plainNumMatch[1]) {
        const parsed = parseCurrencyNumber(plainNumMatch[1]);
        if (parsed !== null && parsed >= 1000) {
          amountTsh = parsed;
        }
      }
    }
  }

  // Extract transaction reference across M-Pesa, Mixx by Yas, Airtel Money (including dotted TIDs), and Halopesa
  let reference: string | null = null;
  const explicitRefMatch = text.match(
    /(?:ref(?:erence)?|kumbukumbu(?:\s+na\.?)?|namba\s+ya\s+muamala|muamala(?:\s+na\.?)?|txn\s*id|txid|tid|trxn\s*id)[:\s#.-]*([A-Z0-9][A-Z0-9._-]{4,28})/i
  );
  if (explicitRefMatch && explicitRefMatch[1]) {
    reference = explicitRefMatch[1].replace(/\./g, '').toUpperCase().slice(0, 32);
  } else {
    // M-Pesa English/Swahili messages start with the 10-char alphanumeric transaction code
    const leadingCodeMatch = text.match(
      /^([A-Z0-9]{8,14})\s+(?:Confirmed|Imethibitishwa)/i
    );
    if (leadingCodeMatch && leadingCodeMatch[1]) {
      reference = leadingCodeMatch[1].toUpperCase();
    } else {
      const dottedTidMatch = text.match(/\b([A-Z]{2}\d{6}\.\d{4}\.[A-Z0-9]{4,8})\b/i);
      if (dottedTidMatch && dottedTidMatch[1]) {
        reference = dottedTidMatch[1].replace(/\./g, '').toUpperCase();
      } else {
        const anyAlphaNumCode = text.match(
          /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{8,16}\b/
        );
        if (anyAlphaNumCode && anyAlphaNumCode[0]) {
          reference = anyAlphaNumCode[0].toUpperCase();
        }
      }
    }
  }

  // Fallback provider inference from code prefix when provider name was omitted
  if (!provider && reference) {
    if (reference.startsWith('HP')) provider = 'Halopesa';
    else if (reference.startsWith('AM') || reference.startsWith('PP')) provider = 'Airtel Money';
    else if (reference.startsWith('TY') || reference.startsWith('MPY')) provider = 'Mixx by Yas';
  }

  const weeklyBundleTsh = sharePriceTsh + socialFundTsh;
  const detectedShares =
    amountTsh && sharePriceTsh > 0 ? Math.floor(amountTsh / sharePriceTsh) : null;
  const detectedWeeks =
    amountTsh && weeklyBundleTsh > 0 ? Math.floor(amountTsh / weeklyBundleTsh) : null;

  return {
    amountTsh,
    reference,
    provider,
    detectedShares,
    detectedWeeks,
  };
}
