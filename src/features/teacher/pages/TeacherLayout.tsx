import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Check, ClipboardList, FileText, GraduationCap, LayoutDashboard, Mail } from 'lucide-react';
import { AppShell } from '../../../components/layout/AppShell';

const nav = [
  { id: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/teacher/classes', label: 'My classes', icon: CalendarDays },
  { id: '/teacher/students', label: 'My students', icon: GraduationCap },
  { id: '/teacher/attendance', label: 'Attendance', icon: Check },
  { id: '/teacher/assessments', label: 'Assessments', icon: ClipboardList },
  { id: '/teacher/reports', label: 'Reports', icon: FileText },
  { id: '/teacher/messages', label: 'Messages', icon: Mail },
];

const titles: Record<string, [string, string]> = {
  '/teacher': ['Good morning, Jessica', "Here's your schedule for today."],
  '/teacher/classes': ['My classes', 'Manage your timetable and class pricing.'],
  '/teacher/students': ['My students', 'Students across all your classes.'],
  '/teacher/attendance': ['Attendance', 'Mark attendance for your sessions.'],
  '/teacher/assessments': ['Assessments', 'Schedule and track assessments for your students.'],
  '/teacher/reports': ['Student reports', 'Write end-of-term reports for your students.'],
  '/teacher/messages': ['Messages', 'Stay in touch with parents and admin.'],
};

export function TeacherLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [title, subtitle] = titles[location.pathname] ?? ['Teacher portal', ''];

  return (
    <AppShell
      role="teacher"
      nav={nav}
      active={location.pathname}
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
