import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import type { Role } from '../components/layout/AppShell';

const queryClient = new QueryClient();

interface AuthCtx {
  role: Role;
  familyId: string;
  setRole: (r: Role) => void;
  setFamilyId: (id: string) => void;
}

const AuthContext = createContext<AuthCtx>({
  role: 'parent',
  familyId: 'f1',
  setRole: () => {},
  setFamilyId: () => {},
});

export function useAuth() { return useContext(AuthContext); }

export function Providers({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>('parent');
  const [familyId, setFamilyId] = useState('f1');
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ role, familyId, setRole, setFamilyId }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
