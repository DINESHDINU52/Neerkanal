import { BadRequestException } from '@nestjs/common';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Safe arithmetic evaluator for salary formulas: + - * / ( ) numbers, variables, MIN/MAX/ROUND. */
export function evalExpr(expr: string, vars: Record<string, number>): number {
  const FN: any = { MIN: 'Math.min', MAX: 'Math.max', ROUND: 'Math.round' };
  const code = String(expr).replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => {
    if (FN[m.toUpperCase()]) return FN[m.toUpperCase()];
    if (!(m in vars)) throw new BadRequestException(`Unknown variable "${m}" in formula "${expr}"`);
    return `(${Number(vars[m]).toFixed(4)})`;
  });
  if (!/^[0-9+\-*/().,\s]*$/.test(code.replace(/Math\.(min|max|round)/g, ''))) {
    throw new BadRequestException('Invalid formula');
  }
  const v = Function(`"use strict";return (${code})`)();
  if (!Number.isFinite(v)) {
    throw new BadRequestException(`Formula "${expr}" did not evaluate to a number`);
  }
  return v;
}
