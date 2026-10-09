import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { dataClient } from '../lib/data/client';
import type { AuthUser, Role } from '../types/auth';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  role: Role | null;
  familyId: string;
  teacherId: string;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <Providers>');
  return v;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await dataClient.getMyContext!());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Keep callback synchronous — awaiting inside onAuthStateChange can deadlock.
    // Defer with setTimeout so it runs after the auth event is fully processed.
    const off = dataClient.onAuthChange!((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        queryClient.clear();
        return;
      }
      setTimeout(() => { void refresh(); }, 0);
    });
    return off;
  }, [refresh]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      role: user?.role ?? null,
      familyId: user?.familyId ?? '',
      teacherId: user?.teacherId ?? '',
      signIn: async (email, password) => {
        const u = await dataClient.signIn!(email, password);
        setUser(u);
        return u;
      },
      signOut: async () => {
        await dataClient.signOut!();
        setUser(null);
        queryClient.clear();
      },
      refresh,
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Error boundary ────────────────────────────────────────────────────────────
interface EBState { error: Error | null }
class ErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}
