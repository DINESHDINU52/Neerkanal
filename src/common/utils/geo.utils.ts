export const hav = (a: number, b: number, c: number, d: number) => {
  const R = 6371000,
    t = (x: number) => (x * Math.PI) / 180,
    dl = t(c - a),
    dg = t(d - b);
  const h =
    Math.sin(dl / 2) ** 2 +
    Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const mapUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

export const mapEmbed = (lat: number, lng: number) =>
  `https://maps.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
