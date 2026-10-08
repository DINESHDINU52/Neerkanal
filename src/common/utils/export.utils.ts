export const csv = (rows: any[][]) =>
  rows
    .map((r) =>
      r
        .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
