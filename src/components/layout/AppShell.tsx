import { Bell, Check, ChevronRight, LogOut, Menu, MoreHorizontal, PanelLeftClose, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers';
import { useNotifications } from '../../hooks/useNotifications';
import { useRealtime } from '../../hooks/useRealtime';
import { pushState, enablePush } from '../../lib/push/webPush';
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
  const [ps, setPs] = useState<'unsupported' | 'denied' | 'default' | 'granted' | 'loading'>('loading');
  const [dismissed, setDismissed] = useState(() => {
    try {
      const v = localStorage.getItem('push_opt_in_dismissed');
      if (!v) return false;
      return Date.now() - Number(v) < 30 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  });

  useEffect(() => {
    pushState().then(setPs).catch(() => setPs('unsupported'));
  }, []);

  async function handleEnablePush() {
    const result = await enablePush();
    setPs(result === 'ok' ? 'granted' : result);
  }

  function handleDismiss() {
    try { localStorage.setItem('push_opt_in_dismissed', String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
  }

  function handleClick(n: AppNotification) {
    if (!n.read) markRead.mutate(n.id);
    if (n.action_url) { navigate(n.action_url); onClose(); }
  }

  const showOptIn = !dismissed && ps !== 'loading' && ps !== 'granted' && ps !== 'unsupported';

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
        {showOptIn && (
          <div className="card" style={{ margin: '8px 12px', padding: '10px 12px', fontSize: 13 }}>
            {ps === 'denied' ? (
              <p style={{ margin: 0, opacity: 0.7 }}>Enable notifications in your browser settings to get push alerts.</p>
            ) : (
              <>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Get notified about bookings, payments and messages</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={handleEnablePush}>
                    Turn on notifications
                  </button>
                  <button className="btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={handleDismiss}>
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        )}
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

interface Toast { id: number; title: string; body: string; }

export function AppShell({ children, nav, active, onNavChange, title, subtitle, role, menuOpen, onMenuToggle }: AppShellProps) {
  const { user, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { unreadCount } = useNotifications();

  const showToast = useCallback((n: { title: string; body: string; url?: string }) => {
    const id = Date.now();
    setToasts(t => [...t, { id, title: n.title, body: n.body }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
  }, []);

  useRealtime(showToast);

  // Show a toast for foreground FCM pushes (the Realtime channel handles bell updates;
  // this only adds the visible toast when the tab is focused).
  useEffect(() => {
    let unsub: (() => void) | undefined;
    import('../../lib/push/webPush').then(({ onForegroundPush }) => {
      unsub = onForegroundPush(showToast);
    }).catch(() => {});
    return () => unsub?.();
  }, [showToast]);

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
      <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9998, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        {toasts.map(t => (
          <div key={t.id} className="card" style={{ padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,.2)', cursor: 'default' }}>
            <strong style={{ fontSize: 13 }}>{t.title}</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.8 }}>{t.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


