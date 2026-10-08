import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { TeacherAssessmentsView } from '../../teacher/pages/TeacherAssessmentsPage';
import { TeacherDashboardView } from '../../teacher/pages/TeacherDashboardPage';
import { TeacherStudentsView } from '../../teacher/pages/TeacherStudentsPage';
import { TeacherAttendanceView } from '../../teacher/pages/TeacherAttendancePage';
import { TeacherReportsView } from '../../teacher/pages/TeacherReportsPage';
import { TeacherClassesPage } from '../../teacher/pages/TeacherClassesPage';

type Tab = 'dashboard' | 'classes' | 'students' | 'attendance' | 'assessments' | 'reports';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard',  label: 'Overview'   },
  { id: 'classes',    label: 'My classes'  },
  { id: 'students',   label: 'My students' },
  { id: 'attendance',  label: 'Attendance'   },
  { id: 'assessments', label: 'Assessments'  },
  { id: 'reports',     label: 'Reports'      },
];

const COLOUR_MAP: Record<string, string> = { tch1: 'pink', tch2: 'teal', tch3: 'orange' };

export function AdminMyTeachingPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [teacherId, setTeacherId] = useState('tch1');

  const { data: teachers = [] } = useQuery({
    queryKey: ['teachers'],
    queryFn: () => dataClient.getTeachers(),
  });

  const activeTeacher = teachers.find(t => t.id === teacherId);
  const color = COLOUR_MAP[teacherId] ?? 'pink';

  return (
    <div className="page-stack">
      {/* Teacher selector */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <span className="label" style={{ display: 'block', marginBottom: 10 }}>Teaching as</span>
        <div className="child-switcher">
          {teachers.map(t => (
            <button
              key={t.id}
              className={teacherId === t.id ? 'active' : ''}
              onClick={() => { setTeacherId(t.id); setTab('dashboard'); }}
            >
              <span className={`switcher-avatar ${COLOUR_MAP[t.id] ?? 'pink'}-bg`} style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
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

      {/* Tab bar */}
      <div className="profile-tabs" style={{ paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content — reuse teacher views with the selected teacherId */}
      {tab === 'dashboard'  && <TeacherDashboardView  teacherId={teacherId} onGoToClasses={() => setTab('classes')} onGoToAttendance={() => setTab('attendance')} />}
      {tab === 'classes'    && <TeacherClassesPage />}
      {tab === 'students'   && <TeacherStudentsView   teacherId={teacherId} />}
      {tab === 'attendance'  && <TeacherAttendanceView teacherId={teacherId} />}
      {tab === 'assessments' && <TeacherAssessmentsView teacherId={teacherId} />}
      {tab === 'reports'     && <TeacherReportsView    teacherId={teacherId} />}
    </div>
  );
}
