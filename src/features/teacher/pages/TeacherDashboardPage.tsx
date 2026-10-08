import { ArrowRight, CalendarDays, GraduationCap, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';

const colours: Record<string, string> = { tch1: 'pink', tch2: 'teal', tch3: 'orange' };

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
  return <TeacherDashboardView teacherId="tch1" onGoToClasses={() => navigate('/teacher/classes')} onGoToAttendance={() => navigate('/teacher/attendance')} />;
}

export function TeacherDashboardView({ teacherId, onGoToClasses, onGoToAttendance }: {
  teacherId: string;
  onGoToClasses?: () => void;
  onGoToAttendance?: () => void;
}) {
  const { data: allClasses = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  const myClasses = allClasses.filter(c => c.teacher_id === teacherId);
  const color = colours[teacherId] ?? 'pink';
  const todayClasses = myClasses.slice(0, 2);
  const upcomingClasses = myClasses.slice(2);
  const totalStudents = myClasses.reduce((sum, c) => sum + c.enrolled, 0);

  return (
    <div className="page-stack">
      <div className="admin-stats">
        <Stat label="My classes" value={String(myClasses.length)} accent="pink" icon={CalendarDays} />
        <Stat label="My students" value={String(totalStudents)} accent="teal" icon={GraduationCap} />
        <Stat label="Classes today" value={String(todayClasses.length)} accent="yellow" icon={CalendarDays} />
        <Stat label="Attendance pending" value={String(todayClasses.length)} accent="orange" icon={Users} />
      </div>

      <div className="card">
        <div className="card-heading">
          <div><span className="label">Today</span><h3>Today's classes</h3></div>
          {onGoToClasses && <button className="text-link" onClick={onGoToClasses}>View all <ArrowRight size={14} /></button>}
        </div>
        {todayClasses.length === 0 && <p className="empty-state-text">No classes scheduled for today.</p>}
        {todayClasses.map((c, i) => (
          <div className="today-row" key={i}>
            <strong>{c.time}</strong>
            <span className={`today-dot ${color}`} />
            <div><b>{c.subject}</b><small>{c.day_of_week} · {c.enrolled}/{c.capacity} enrolled</small></div>
            {onGoToAttendance && (
              <button className="text-link" onClick={onGoToAttendance}>Take attendance <ArrowRight size={14} /></button>
            )}
          </div>
        ))}
      </div>

      {upcomingClasses.length > 0 && (
        <div className="card">
          <div className="card-heading"><div><span className="label">This week</span><h3>Upcoming classes</h3></div></div>
          {upcomingClasses.map((c, i) => (
            <div className="class-row" key={i}>
              <div className={`date-block ${color}`}><b>{c.day_of_week.slice(0, 3).toUpperCase()}</b></div>
              <div className="class-detail"><strong>{c.subject}</strong><span>{c.time} · {c.enrolled}/{c.capacity} enrolled</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
