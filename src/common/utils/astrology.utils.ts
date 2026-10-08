import { P, ymd } from './date.utils';
import { sha } from './crypto.utils';

export const SIGNS = [
  'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini', 'Cancer',
  'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn',
];
export const SIGN_CUT = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22];

export const zodiac = (dob: string) => {
  if (!dob) return null;
  const d = P(dob),
    m = d.getMonth(),
    day = d.getDate();
  return day >= SIGN_CUT[m] ? SIGNS[m] : SIGNS[(m + 11) % 12];
};

export const horoscope = (sign: string, date = ymd()) => {
  const h = parseInt(sha(sign + date).slice(0, 8), 16);
  const pick = (a: string[], k: number) => a[(h >> k) % a.length];
  const colors = ['Navy', 'Gold', 'Emerald', 'Crimson', 'Ivory', 'Teal', 'Violet'];
  return {
    sign,
    date,
    mood: pick(['Energetic', 'Calm', 'Focused', 'Curious', 'Confident'], 1),
    text: `${pick(
      [
        'A steady day for deep work.',
        'Collaboration brings a pleasant surprise.',
        'A small win today builds momentum.',
        'Listen first — the best idea may come from a colleague.',
        'Plan ahead and the afternoon flows easily.',
      ],
      3,
    )} ${pick(
      [
        'Keep hydrated.',
        'Take a short walk after lunch.',
        'Express gratitude to a teammate.',
        'Avoid multitasking.',
      ],
      5,
    )}`,
    luckyNumber: (h % 9) + 1,
    luckyColor: pick(colors, 7),
    note: 'For entertainment only.',
  };
};
