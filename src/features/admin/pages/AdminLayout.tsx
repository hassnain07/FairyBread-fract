import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BookOpen, CalendarDays, CircleDollarSign, LayoutDashboard, Mail, PhoneCall, Presentation, Settings, ShoppingBag, Ticket, UserRound, Users } from 'lucide-react';
import { AppShell } from '../../../components/layout/AppShell';

const nav = [
  { id: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/admin/bookings', label: 'Bookings', icon: Ticket },
  { id: '/admin/family-booking', label: 'Family booking', icon: PhoneCall },
  { id: '/admin/my-teaching', label: 'My teaching', icon: Presentation },
  { id: '/admin/payments', label: 'Payments', icon: CircleDollarSign },
  { id: '/admin/messages', label: 'Messages', icon: Mail },
  { id: '/admin/tutors', label: 'Tutors', icon: UserRound },
  { id: '/admin/parents', label: 'Parents', icon: Users },
  { id: '/admin/timetable', label: 'Timetable', icon: CalendarDays },
  { id: '/admin/programs', label: 'Programs', icon: BookOpen },
  { id: '/admin/orders', label: 'Shop orders', icon: ShoppingBag },
  { id: '/admin/settings', label: 'Settings', icon: Settings },
];

const titles: Record<string, [string, string]> = {
  '/admin': ['Admin dashboard', "Here's the heartbeat of Fairybread & Fractions today."],
  '/admin/bookings': ['Bookings', 'A clear view of the week ahead.'],
  '/admin/family-booking': ['Family booking', 'Book on behalf of families without portal access.'],
  '/admin/my-teaching': ['My teaching', 'Manage your own classes, students and reports.'],
  '/admin/payments': ['Payments', 'Keep the numbers feeling simple.'],
  '/admin/messages': ['Messages', 'Stay close to every family.'],
  '/admin/tutors': ['Tutors', 'Meet the team behind every session.'],
  '/admin/parents': ['Parents', 'Every family, connected in one place.'],
  '/admin/timetable': ['Timetable', 'Build and manage the term class schedule.'],
  '/admin/programs': ['Programs', 'What we teach and who is learning.'],
  '/admin/orders': ['Shop orders', 'Review and manage learning shop orders.'],
  '/admin/settings': ['Settings', 'Business details and notification preferences.'],
};

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [title, subtitle] = titles[location.pathname] ?? ['Admin', ''];

  return (
    <AppShell
      role="admin"
      nav={nav}
      active={location.pathname}
      onNavChange={id => navigate(id)}
      title={title}
      subtitle={subtitle}
      menuOpen={menuOpen}
      onMenuToggle={() => setMenuOpen(v => !v)}
    >
      <Outlet />
    </AppShell>
  );
}
