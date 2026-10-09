import { Bell, Check, ChevronRight, LogOut, Menu, MoreHorizontal, PanelLeftClose, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { useNotifications } from '../../hooks/useNotifications';
import type { AppNotification } from '../../types/message';
import type { Role } from '../../types/auth';

export type { Role };

interface NavItem { id: string; label: string; icon: LucideIcon; }

interface AppShellProps {
  children: React.ReactNode;
  nav: NavItem[];
  active: string;
  onNavChange: (id: string) => void;
  title: string;
  subtitle: string;
  role: Role;
  menuOpen: boolean;
  onMenuToggle: () => void;
}

const notifColors: Record<string, string> = {
  booking_confirmed: 'teal', booking_cancelled: 'orange', payment_received: 'green',
  payment_approved: 'green', payment_rejected: 'orange', assessment_confirmed: 'pink',
  term_expiring: 'yellow', report_ready: 'teal', message_received: 'pink', announcement: 'yellow',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotifDrawer({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { notifications, markRead, markAllRead } = useNotifications();

  function handleClick(n: AppNotification) {
    if (!n.read) markRead.mutate(n.id);
    if (n.action_url) { navigate(n.action_url); onClose(); }
  }

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} />
      <div className="notif-drawer">
        <div className="notif-drawer-head">
          <div>
            <span className="label">Notifications</span>
            <strong>{notifications.filter(n => !n.read).length} unread</strong>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {notifications.some(n => !n.read) && (
              <button className="notif-mark-all" onClick={() => markAllRead.mutate()} title="Mark all read">
                <Check size={13} /> All read
              </button>
            )}
            <button className="notif-close" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="notif-list">
          {notifications.length === 0 && (
            <div className="notif-empty">
              <Bell size={28} />
              <p>You're all caught up!</p>
            </div>
          )}
          {notifications.map(n => (
            <button
              key={n.id}
              className={`notif-item ${n.read ? 'read' : 'unread'}`}
              onClick={() => handleClick(n)}
            >
              <span className={`notif-dot ${notifColors[n.type] ?? 'pink'}-bg`} />
              <div className="notif-body">
                <strong>{n.title}</strong>
                <span>{n.body}</span>
                <small>{timeAgo(n.created_at)}</small>
              </div>
              {!n.read && <i className="notif-unread-pip" />}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

export function AppShell({ children, nav, active, onNavChange, title, subtitle, role, menuOpen, onMenuToggle }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { unreadCount } = useNotifications();

  const displayName = user?.fullName || (role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Parent');
  const initials = (() => {
    if (!user) return role[0].toUpperCase();
    const parts = (user.fullName || user.email || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();
  const workspace = role === 'parent' ? 'Parent account' : role === 'admin' ? 'Admin workspace' : 'Teacher portal';

  async function handleSignOut() {
    setProfileOpen(false);
    await signOut();
  }

  return (
    <div className={`app-shell ${role}-app`}>
      <aside className={menuOpen ? 'open' : ''} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="side-brand">
          <div className="brand brand-compact">
            <img src="/assets/image.png" alt="Fairybread & Fractions" />
            <div><strong>fairybread</strong><span>& fractions</span></div>
          </div>
          <button onClick={onMenuToggle}><PanelLeftClose size={18} /></button>
        </div>
        <div className="side-profile" style={{ cursor: 'pointer' }} onClick={() => setProfileOpen(o => !o)}>
          <div className="profile-avatar">{initials}</div>
          <div><strong>{displayName}</strong><span>{workspace}</span></div>
          <MoreHorizontal size={17} />
        </div>
        {profileOpen && (
          <div style={{ padding: '0 12px 8px' }}>
            <button
              onClick={handleSignOut}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.06)', color: 'inherit', cursor: 'pointer', fontSize: 13 }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
        <nav className="side-nav" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={active === id ? 'active' : ''} onClick={() => { onNavChange(id); if (menuOpen) onMenuToggle(); }}>
              <Icon size={18} /><span>{label}</span>
              {id.endsWith('/messages') && <i className="nav-dot" />}
            </button>
          ))}
        </nav>
      </aside>
      <div className="app-content">
        <header className="app-header">
          <button className="mobile-menu" onClick={onMenuToggle}><Menu size={22} /></button>
          <div>
            <div className="breadcrumb">
              {role === 'parent' ? 'Parent portal' : role === 'admin' ? 'Admin workspace' : 'Teacher portal'}
              <ChevronRight size={13} /> {title}
            </div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={() => setNotifOpen(o => !o)}>
              <Bell size={18} />
              {unreadCount > 0 && <i className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</i>}
            </button>
            <div className="header-avatar" style={{ cursor: 'pointer' }} onClick={() => setProfileOpen(o => !o)}>
              {initials}
            </div>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
      {notifOpen && <NotifDrawer onClose={() => setNotifOpen(false)} />}
      <DemoBar active={role} />
    </div>
  );
}

// DemoBar remains for development convenience — removed in Phase 12
function DemoBar({ active }: { active: Role }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const portals: { label: string; path: string; role: Role | 'home' }[] = [
    { label: 'Website', path: '/', role: 'home' },
    { label: 'Parent', path: '/parent', role: 'parent' },
    { label: 'Admin', path: '/admin', role: 'admin' },
    { label: 'Teacher', path: '/teacher', role: 'teacher' },
  ];

  const btnBase: React.CSSProperties = {
    border: 'none', color: '#fff', borderRadius: 999,
    padding: '5px 12px', fontSize: 12, cursor: 'pointer',
  };

  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: '#23312f', borderRadius: 999, padding: '7px 14px', zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.3)', flexWrap: 'wrap', maxWidth: '90vw' }}>
      <span style={{ color: '#75817d', fontSize: 11, marginRight: 2 }}>Dev</span>
      {portals.map(({ label, path, role }) => (
        <button key={path} onClick={() => navigate(path)} style={{ ...btnBase, background: role === active ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.08)', fontWeight: role === active ? 600 : 400 }}>
          {label}
        </button>
      ))}
      <span style={{ color: '#4a5e59', margin: '0 4px' }}>|</span>
      <button onClick={() => signOut()} style={{ ...btnBase, background: 'rgba(255,80,80,.2)' }}>
        Sign out
      </button>
    </div>
  );
}
