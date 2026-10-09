import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';
import { rpc } from './rpc';
import type { AuthUser } from '../../../types/auth';

function mapContext(raw: Record<string, unknown>, fallbackEmail: string): AuthUser {
  const firstName = String(raw.first_name ?? raw.firstName ?? '');
  const lastName  = String(raw.last_name  ?? raw.lastName  ?? '');
  const fullName  = String(raw.full_name  ?? raw.fullName  ?? `${firstName} ${lastName}`.trim());
  return {
    id:        String(raw.id ?? ''),
    email:     String(raw.email ?? fallbackEmail),
    fullName:  fullName  || fallbackEmail,
    firstName: firstName || fullName.split(' ')[0] || fallbackEmail.split('@')[0] || 'User',
    role:      (raw.role ?? 'parent') as AuthUser['role'],
    familyId:  raw.family_id  ? String(raw.family_id)  : (raw.familyId  ? String(raw.familyId)  : null),
    teacherId: raw.teacher_id ? String(raw.teacher_id) : (raw.teacherId ? String(raw.teacherId) : null),
  };
}

export function createAuthMethods(sb: AppSupabase) {
  return {
    async signIn(email: string, password: string): Promise<AuthUser> {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw toAppError(error);
      const { data: { session } } = await sb.auth.getSession();
      const raw = await rpc<Record<string, unknown>>(sb, 'get_my_context');
      return mapContext(raw, session?.user.email ?? email);
    },

    async requestSignupOtp(input: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
    }): Promise<void> {
      const { error } = await sb.auth.signInWithOtp({
        email: input.email,
        options: {
          shouldCreateUser: true,
          data: {
            first_name: input.firstName,
            last_name: input.lastName,
            phone: input.phone ?? null,
          },
        },
      });
      if (error) throw toAppError(error);
    },

    async requestPasswordResetOtp(email: string): Promise<void> {
      // Always resolves — never reveals whether the email exists
      await sb.auth.resetPasswordForEmail(email).catch(() => {});
    },

    async verifyOtp(
      email: string,
      code: string,
      purpose: 'signup' | 'recovery'
    ): Promise<void> {
      const { error } = await sb.auth.verifyOtp({
        email,
        token: code,
        type: purpose === 'signup' ? 'email' : 'recovery',
      });
      if (error) throw toAppError(error);
    },

    async setPassword(newPassword: string): Promise<void> {
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw toAppError(error);
    },

    async signOut(): Promise<void> {
      const { error } = await sb.auth.signOut();
      if (error) throw toAppError(error);
    },

    async getMyContext(): Promise<AuthUser | null> {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      try {
        const raw = await rpc<Record<string, unknown>>(sb, 'get_my_context');
        if (!raw) return null;
        return mapContext(raw, session.user.email ?? '');
      } catch {
        return null;
      }
    },

    onAuthChange(
      cb: (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED') => void
    ): () => void {
      const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
        if (
          event === 'SIGNED_IN' ||
          event === 'SIGNED_OUT' ||
          event === 'PASSWORD_RECOVERY' ||
          event === 'TOKEN_REFRESHED'
        ) {
          cb(event);
        }
      });
      return () => subscription.unsubscribe();
    },
  };
}
