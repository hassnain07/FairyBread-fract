import { ArrowRight, CalendarDays, GraduationCap, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';

function Stat({ label, value, accent, icon: Icon }: { label: string; value: string; accent: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <strong>{value}</strong><span>{label}</span><div className="stat-line" />
    </div>
  );
}

export function TeacherDashboardPage() {
  const navigate = useNavigate();
  const { teacherId } = useAuth();
  return (
    <TeacherDashboardView
      teacherId={teacherId}
      onGoToClasses={() => navigate('/teacher/classes')}
      onGoToAttendance={() => navigate('/teacher/attendance')}
    />
  );
}

export function TeacherDashboardView({ teacherId, onGoToClasses, onGoToAttendance }: {
  teacherId: string;
  onGoToClasses?: () => void;
  onGoToAttendance?: () => void;
}) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

  const { data: todaySessions = [] } = useQuery({
    queryKey: qk.sessions({ teacherId, from: startOfToday, to: endOfToday }),
    queryFn: () => dataClient.getUpcomingSessions({ teacherId, from: startOfToday, to: endOfToday }),
    enabled: !!teacherId,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: qk.teacherBookings,
    queryFn: () => dataClient.getBookingsForTeacher(),
    enabled: !!teacherId,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: qk.teachers,
    queryFn: () => dataClient.getTeachers(),
  });

  const teacher = teachers.find(t => t.id === teacherId);
  const color = teacher?.color ?? 'pink';

  const studentIds = new Set(bookings.filter(b => b.status === 'confirmed').map(b => b.child_id));
  const totalStudents = studentIds.size;
  const pendingAttendance = todaySessions.filter(s => s.status === 'scheduled').length;

  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="page-stack">
      <div className="admin-stats">
        <Stat label="Classes today" value={String(todaySessions.length)} accent="pink" icon={CalendarDays} />
        <Stat label="My students" value={String(totalStudents)} accent="teal" icon={GraduationCap} />
        <Stat label="Attendance pending" value={String(pendingAttendance)} accent="orange" icon={Users} />
      </div>

      <div className="card">
        <div className="card-heading">
          <div><span className="label">Today</span><h3>Today's classes</h3></div>
          {onGoToClasses && <button className="text-link" onClick={onGoToClasses}>View all <ArrowRight size={14} /></button>}
        </div>
        {todaySessions.length === 0 && <p className="empty-state-text">No classes scheduled for today.</p>}
        {todaySessions.map(s => {
          const d = new Date(s.starts_at);
          return (
            <div className="today-row" key={s.id}>
              <strong>{d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</strong>
              <span className={`today-dot ${color}`} />
              <div>
                <b>{s.subject}</b>
                <small>{DAYS[d.getDay()]} · {s.booked_count}/{s.capacity} enrolled</small>
              </div>
              {onGoToAttendance && (
                <button className="text-link" onClick={onGoToAttendance}>Take attendance <ArrowRight size={14} /></button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
