import type { Child } from '../../../types/family';

export const toChild = (r: any): Child => ({
  id: r.id,
  family_id: r.family_id,
  name: r.name ?? `${r.given_name} ${r.family_name}`,
  initials: r.initials ?? `${r.given_name?.[0] ?? ''}${r.family_name?.[0] ?? ''}`.toUpperCase(),
  givenName: r.given_name,
  familyName: r.family_name,
  preferredName: r.preferred_name ?? undefined,
  year: r.year_level ?? '',
  school: r.school ?? '',
  enrolled: !!r.enrolled_at,
  concern: r.concern ?? undefined,
  subjects: r.subjects ?? [],
  preferredDays: r.preferred_days ?? [],
  goals: r.goals ?? undefined,
  notes: r.notes ?? undefined,
  preferredTutor: r.preferred_teacher?.name,
  sessions: r.sessions_per_week ?? undefined,
});
