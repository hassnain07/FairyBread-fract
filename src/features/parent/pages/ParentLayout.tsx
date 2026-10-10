import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, CircleDollarSign, ClipboardList, FileText, LayoutDashboard, MessageCircle, Package, ShoppingBag, Ticket, Users } from 'lucide-react';
import { AppShell } from '../../../components/layout/AppShell';
import { useAuth } from '../../../app/providers';

const nav = [
  { id: '/parent', label: 'Overview', icon: LayoutDashboard },
  { id: '/parent/children', label: 'My children', icon: Users },
  { id: '/parent/assessments', label: 'My assessments', icon: ClipboardList },
  { id: '/parent/book-assessment', label: 'Book assessment', icon: ClipboardList },
  { id: '/parent/book-class', label: 'Book a class', icon: CalendarDays },
  { id: '/parent/bookings', label: 'My bookings', icon: Ticket },
  { id: '/parent/payments', label: 'Payments', icon: CircleDollarSign },
  { id: '/parent/reports', label: 'Reports', icon: BarChart3 },
  { id: '/parent/messages', label: 'Messages', icon: MessageCircle },
  { id: '/parent/enrol', label: 'Enrolment', icon: FileText },
  { id: '/parent/shop', label: 'Learning shop', icon: ShoppingBag },
  { id: '/parent/orders', label: 'My orders', icon: Package },
];

const subtitles: Record<string, string> = {
  '/parent': 'Here is what is happening with your family this week.',
  '/parent/children': 'Keep an eye on their learning journey.',
  '/parent/assessments': 'Track upcoming and past assessments for your children.',
  '/parent/book-assessment': 'A lovely first step towards confident learning.',
  '/parent/book-class': 'Choose a session for your child this week.',
  '/parent/bookings': 'Your upcoming sessions, all in one place.',
  '/parent/reports': 'Progress worth celebrating.',
  '/parent/messages': 'A little inbox for all the important things.',
  '/parent/payments': 'Simple, clear and all in one place.',
  '/parent/enrol': "A few details and we'll be ready to begin.",
};

const titles: Record<string, string> = {
  '/parent/children': 'My children',
  '/parent/assessments': 'My assessments',
  '/parent/book-assessment': 'Book an assessment',
  '/parent/book-class': 'Book a class',
  '/parent/bookings': 'My bookings',
  '/parent/reports': 'Learning journey',
  '/parent/messages': 'Messages',
  '/parent/payments': 'Payments',
  '/parent/enrol': 'Complete enrolment',
};

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function ParentLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const path = location.pathname.replace(/\/children\/.*/, '/children');

  const title = titles[path] ?? `Good ${timeOfDay()}, ${user?.firstName ?? 'there'}`;
  const subtitle = subtitles[path] ?? '';

  return (
    <AppShell
      role="parent"
      nav={nav}
      active={path}
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
