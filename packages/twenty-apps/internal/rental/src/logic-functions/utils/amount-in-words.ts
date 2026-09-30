const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

// 0-999 -> words
const underThousand = (n: number): string => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];

  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    parts.push(rest < 20 ? ONES[rest] : [TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join('-'));
  }

  return parts.join(' ');
};

export const integerToWords = (value: number): string => {
  if (value === 0) return 'Zero';

  const groups: string[] = [];
  let remaining = Math.floor(value);
  let scale = 0;

  while (remaining > 0 && scale < SCALES.length) {
    const chunk = remaining % 1000;

    if (chunk) groups.unshift([underThousand(chunk), SCALES[scale]].filter(Boolean).join(' '));
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }

  return groups.join(' ');
};

// 1500.5 -> "Ringgit Malaysia One Thousand Five Hundred and Sen Fifty Only"
export const ringgitInWords = (amount: number): string => {
  const cents = Math.round(amount * 100);
  const ringgit = Math.floor(cents / 100);
  const sen = cents % 100;
  const ringgitPart = `Ringgit Malaysia ${integerToWords(ringgit)}`;

  return sen ? `${ringgitPart} and Sen ${integerToWords(sen)} Only` : `${ringgitPart} Only`;
};
