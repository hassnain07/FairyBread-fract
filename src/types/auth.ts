export type Role = 'parent' | 'teacher' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  role: Role;
  familyId: string | null;
  teacherId: string | null;
}
