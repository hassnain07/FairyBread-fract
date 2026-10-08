import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, CircleDollarSign, ClipboardList, FileText, LayoutDashboard, MessageCircle, Package, ShoppingBag, Ticket, Users } from 'lucide-react';
import { AppShell } from '../../../components/layout/AppShell';

const nav = [
  { id: '/parent', label: 'Overview', icon: LayoutDashboard },
  { id: '/parent/children', label: 'My children', icon: Users },
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

const titles: Record<string, [string, string]> = {
  '/parent': ['Good afternoon, Sarah', 'Here is what is happening with your family this week.'],
  '/parent/children': ['My children', 'Keep an eye on their learning journey.'],
  '/parent/book-assessment': ['Book an assessment', 'A lovely first step towards confident learning.'],
  '/parent/book-class': ["Emma's classes", 'This week: 1 of 2 sessions booked'],
  '/parent/bookings': ['My bookings', 'Your upcoming sessions, all in one place.'],
  '/parent/reports': ["Emma's learning journey", 'Progress worth celebrating.'],
  '/parent/messages': ['Messages', 'A little inbox for all the important things.'],
  '/parent/payments': ['Payments', 'Simple, clear and all in one place.'],
  '/parent/enrol': ['Complete enrolment', "A few details and we'll be ready to begin."],
};

export function ParentLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname.replace(/\/children\/.*/, '/children');
  const [title, subtitle] = titles[path] ?? ['Parent portal', ''];

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
      onSwitchRole={() => navigate('/admin')}
      onHome={() => navigate('/')}
    >
      <Outlet />
    </AppShell>
  );
}
