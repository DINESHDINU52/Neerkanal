export const pad = (n: number) => String(n).padStart(2, '0');

export const P = (d: any) =>
  typeof d === 'string' && d.length === 10
    ? new Date(d + 'T12:00:00')
    : new Date(d);

export const ymd = (d: any = new Date()) => {
  const x = P(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export const now = () => new Date().toISOString();

export const addDays = (d: any, n: number) => {
  const x = P(d);
  x.setDate(x.getDate() + n);
  return ymd(x);
};

export const addMonths = (d: any, n: number) => {
  const x = P(d);
  x.setMonth(x.getMonth() + n);
  return x.toISOString();
};

export const diffDays = (a: any, b: any) =>
  Math.round((+P(b) - +P(a)) / 864e5);

export const ym = (d: any = new Date()) => ymd(d).slice(0, 7);

export const daysInMonth = (m: string) =>
  new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();

export const prevMonth = (m: string, k = 1) =>
  ym(addMonths(m + '-15', -k));
