import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './providers';
import type { Role } from '../types/auth';

const HOME: Record<Role, string> = {
  parent: '/parent',
  teacher: '/teacher',
  admin: '/admin',
};

export function RequireRole({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="page-stack" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <span className="auth-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={HOME[user.role]} replace />;
  }

  return <Outlet />;
}

export const homeFor = (r: Role) => HOME[r];
