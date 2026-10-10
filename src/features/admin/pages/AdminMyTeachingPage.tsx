import { useState } from 'react';
import { useAuth } from '../../../app/providers';
import { TeacherAssessmentsView } from '../../teacher/pages/TeacherAssessmentsPage';
import { TeacherDashboardView } from '../../teacher/pages/TeacherDashboardPage';
import { TeacherStudentsView } from '../../teacher/pages/TeacherStudentsPage';
import { TeacherAttendanceView } from '../../teacher/pages/TeacherAttendancePage';
import { TeacherReportsView } from '../../teacher/pages/TeacherReportsPage';
import { TeacherClassesPage } from '../../teacher/pages/TeacherClassesPage';
import { Link } from 'react-router-dom';

type Tab = 'dashboard' | 'classes' | 'students' | 'attendance' | 'assessments' | 'reports';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard',   label: 'Overview'    },
  { id: 'classes',     label: 'My classes'  },
  { id: 'students',    label: 'My students' },
  { id: 'attendance',  label: 'Attendance'  },
  { id: 'assessments', label: 'Assessments' },
  { id: 'reports',     label: 'Reports'     },
];

export function AdminMyTeachingPage() {
  const { teacherId } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');

  if (!teacherId) {
    return (
      <div className="page-stack">
        <div className="card" style={{ padding: 24 }}>
          <p style={{ color: 'var(--muted)' }}>Your account isn't set up as a teacher. Ask an admin to create a teacher profile for you.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="profile-tabs" style={{ paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'dashboard'   && <TeacherDashboardView  teacherId={teacherId} onGoToClasses={() => setTab('classes')} onGoToAttendance={() => setTab('attendance')} />}
      {tab === 'classes' && (
        <>
          <div className="card" style={{ padding: '12px 16px', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>Classes are managed in the Timetable. You can view your assigned classes below.</span>
            <Link to="/admin/timetable" className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}>Go to Timetable →</Link>
          </div>
          <TeacherClassesPage />
        </>
      )}
      {tab === 'students'    && <TeacherStudentsView   teacherIdOverride={teacherId} />}
      {tab === 'attendance'  && <TeacherAttendanceView teacherIdOverride={teacherId} />}
      {tab === 'assessments' && <TeacherAssessmentsView teacherIdOverride={teacherId} />}
      {tab === 'reports'     && <TeacherReportsView    teacherIdOverride={teacherId} />}
    </div>
  );
}
