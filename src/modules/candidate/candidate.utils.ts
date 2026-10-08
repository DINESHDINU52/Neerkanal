import { User } from '../../database/entities/user.entity';
import { PROFILE_FIELDS } from '../../common/constants';

export const candPct = (u: User) => {
  const p = u.profile || {},
    f = [u.name, u.phone, u.dob, ...PROFILE_FIELDS.map((k) => p[k])];
  return Math.round(
    (f.filter((v) =>
      Array.isArray(v)
        ? v.length
        : v !== undefined && v !== null && String(v).trim() !== '',
    ).length /
      f.length) *
      100,
  );
};
