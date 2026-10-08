import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, BookOpen, Calendar, Target, MessageSquare, User } from 'lucide-react';
import { dataClient } from '../../../lib/data/client';
import type { Child } from '../../../types/family';

const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];

export function TeacherStudentsPage() {
  return <TeacherStudentsView teacherId="tch1" />;
}

export function TeacherStudentsView({ teacherId }: { teacherId: string }) {
  const [selected, setSelected] = useState<Child | null>(null);

  const { data: allClasses = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });
  const { data: allBookings = [] } = useQuery({
    queryKey: ['allBookings'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getBookings(id)))).flat(),
  });
  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren'],
    queryFn: async () => (await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getChildren(id)))).flat(),
  });

  const myClassIds = new Set(allClasses.filter(c => c.teacher_id === teacherId).map(c => c.id));
  const myBookings = allBookings.filter(b => myClassIds.has(b.class_instance_id) && b.status === 'confirmed');
  const enrolledChildIds = new Set(myBookings.map(b => b.child_id));
  const myStudents = allChildren.filter(c => enrolledChildIds.has(c.id));

  const rows = myStudents.map(child => {
    const booking = myBookings.find(b => b.child_id === child.id);
    const cls = booking ? allClasses.find(c => c.id === booking.class_instance_id) : null;
    return {
      child,
      subject: cls?.subject ?? '—',
      day: cls?.day_of_week ?? '—',
      source: booking?.source === 'term_credit' ? 'Term credit' : 'Individual',
    };
  });

  const selectedClass = selected
    ? allClasses.find(c => c.id === myBookings.find(b => b.child_id === selected.id)?.class_instance_id)
    : null;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>My students</h2><p>Students enrolled across your classes.</p></div>
      </div>

      <div className="card table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{['Student', 'Year', 'Class', 'Day', 'Booking type', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No students enrolled in your classes yet.</td></tr>
              )}
              {rows.map(({ child, subject, day, source }) => (
                <tr key={child.id}>
                  <td><strong className="table-name">{child.name}</strong></td>
                  <td>{child.year}</td>
                  <td>{subject}</td>
                  <td>{day}</td>
                  <td><span className={`table-status ${source === 'Term credit' ? 'confirmed' : 'view'}`}>{source}</span></td>
                  <td>
                    <button className="btn-view-profile" onClick={() => setSelected(child)}>
                      View profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile drawer */}
      {selected && (
        <div className="profile-drawer-overlay" onClick={() => setSelected(null)}>
          <div className="profile-drawer" onClick={e => e.stopPropagation()}>
            <div className="profile-drawer-header">
              <div className="profile-drawer-avatar">{selected.initials}</div>
              <div>
                <h3>{selected.name}</h3>
                <span>{selected.year} · {selected.school}</span>
              </div>
              <button className="drawer-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            {selectedClass && (
              <div className="profile-drawer-class-badge">
                <span>{selectedClass.subject}</span>
                <span>·</span>
                <span>{selectedClass.day_of_week} {selectedClass.time}</span>
              </div>
            )}

            <div className="profile-drawer-body">

              {selected.subjects && selected.subjects.length > 0 && (
                <div className="profile-section">
                  <div className="profile-section-title"><BookOpen size={14} />Learning areas</div>
                  <div className="profile-tags">
                    {selected.subjects.map(s => <span key={s} className="profile-tag">{s}</span>)}
                  </div>
                </div>
              )}

              {selected.preferredDays && selected.preferredDays.length > 0 && (
                <div className="profile-section">
                  <div className="profile-section-title"><Calendar size={14} />Preferred days</div>
                  <div className="profile-tags">
                    {selected.preferredDays.map(d => <span key={d} className="profile-tag teal">{d}</span>)}
                  </div>
                </div>
              )}

              {selected.goals && (
                <div className="profile-section">
                  <div className="profile-section-title"><Target size={14} />Learning goals</div>
                  <p className="profile-text">{selected.goals}</p>
                </div>
              )}

              {selected.notes && (
                <div className="profile-section">
                  <div className="profile-section-title"><MessageSquare size={14} />About this student</div>
                  <p className="profile-text">{selected.notes}</p>
                </div>
              )}

              {selected.preferredTutor && (
                <div className="profile-section">
                  <div className="profile-section-title"><User size={14} />Preferences</div>
                  <div className="profile-pref-row"><span>Preferred tutor</span><strong>{selected.preferredTutor}</strong></div>
                  {selected.sessions && <div className="profile-pref-row"><span>Sessions per week</span><strong>{selected.sessions}</strong></div>}
                </div>
              )}

              {!selected.goals && !selected.notes && !selected.subjects?.length && (
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>No profile details on file yet. These are filled in during enrolment.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
