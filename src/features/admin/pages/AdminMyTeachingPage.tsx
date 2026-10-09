import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import { TeacherAssessmentsView } from '../../teacher/pages/TeacherAssessmentsPage';
import { TeacherDashboardView } from '../../teacher/pages/TeacherDashboardPage';
import { TeacherStudentsView } from '../../teacher/pages/TeacherStudentsPage';
import { TeacherAttendanceView } from '../../teacher/pages/TeacherAttendancePage';
import { TeacherReportsView } from '../../teacher/pages/TeacherReportsPage';
import { TeacherClassesPage } from '../../teacher/pages/TeacherClassesPage';

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
  const { teacherId: myTeacherId } = useAuth();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [teacherId, setTeacherId] = useState(myTeacherId);

  const { data: teachers = [] } = useQuery({
    queryKey: qk.teachers,
    queryFn: () => dataClient.getTeachers(),
  });

  if (!myTeacherId) {
    return (
      <div className="page-stack">
        <div className="card" style={{ padding: 24 }}>
          <p style={{ color: 'var(--muted)' }}>Your account isn't set up as a teacher. Ask an admin to create a teacher profile for you.</p>
        </div>
      </div>
    );
  }

  const activeTeacher = teachers.find(t => t.id === teacherId);

  return (
    <div className="page-stack">
      <div className="card" style={{ padding: '16px 20px' }}>
        <span className="label" style={{ display: 'block', marginBottom: 10 }}>Teaching as</span>
        <div className="child-switcher">
          {teachers.map(t => (
            <button
              key={t.id}
              className={teacherId === t.id ? 'active' : ''}
              onClick={() => { setTeacherId(t.id); setTab('dashboard'); }}
            >
              <span className={`switcher-avatar ${t.color}-bg`} style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                {t.initials}
              </span>
              <span className="switcher-name">{t.name}</span>
            </button>
          ))}
        </div>
        {activeTeacher && (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
            Subjects: {activeTeacher.subjects.join(', ')}
          </p>
        )}
      </div>

      <div className="profile-tabs" style={{ paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'dashboard'   && <TeacherDashboardView  teacherId={teacherId} onGoToClasses={() => setTab('classes')} onGoToAttendance={() => setTab('attendance')} />}
      {tab === 'classes'     && <TeacherClassesPage />}
      {tab === 'students'    && <TeacherStudentsView   teacherIdOverride={teacherId} />}
      {tab === 'attendance'  && <TeacherAttendanceView teacherIdOverride={teacherId} />}
      {tab === 'assessments' && <TeacherAssessmentsView teacherIdOverride={teacherId} />}
      {tab === 'reports'     && <TeacherReportsView    teacherIdOverride={teacherId} />}
    </div>
  );
}
