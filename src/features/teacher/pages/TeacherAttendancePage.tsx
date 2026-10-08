import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';

// NOTE: TeacherAttendancePage passes 'tch1' as the default teacher.
// When auth is implemented, replace with the logged-in teacher's ID from context.
const ALL_FAMILY_IDS = ['f1', 'f2', 'f3', 'f4'];

type Status = 'Present' | 'Absent' | 'No-show';
const STATUS_OPTS: Status[] = ['Present', 'Absent', 'No-show'];

const colours: Record<string, string> = { c1: 'pink', c2: 'teal', c3: 'orange', c4: 'yellow', c5: 'magenta', c6: 'green' };

export function TeacherAttendancePage() {
  return <TeacherAttendanceView teacherId="tch1" />;
}

export function TeacherAttendanceView({ teacherId }: { teacherId: string }) {
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [saved, setSaved] = useState(false);

  const { data: allClasses = [] } = useQuery({
    queryKey: ['classInstances'],
    queryFn: () => dataClient.getClassInstances(),
  });

  const { data: allBookings = [] } = useQuery({
    queryKey: ['allBookings'],
    queryFn: async () => {
      const results = await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getBookings(id)));
      return results.flat();
    },
  });

  const { data: allChildren = [] } = useQuery({
    queryKey: ['allChildren'],
    queryFn: async () => {
      const results = await Promise.all(ALL_FAMILY_IDS.map(id => dataClient.getChildren(id)));
      return results.flat();
    },
  });

  const myClasses = allClasses.filter(c => c.teacher_id === teacherId);
  const activeClassId = selectedClassId || myClasses[0]?.id || '';
  const activeClass = myClasses.find(c => c.id === activeClassId);

  // Students enrolled in the selected class
  const classBookings = allBookings.filter(b => b.class_instance_id === activeClassId && b.status === 'confirmed');
  const enrolledChildren = allChildren.filter(c => classBookings.some(b => b.child_id === c.id));

  const handleSave = () => setSaved(true);
  const handleReset = () => { setStatuses({}); setSaved(false); };

  return (
    <div className="page-stack narrow-page">
      <div className="page-toolbar">
        <div><h2>Take attendance</h2><p>Mark who attended this session.</p></div>
      </div>

      {/* Class selector */}
      {myClasses.length > 1 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Select class</label>
          <select
            value={activeClassId}
            onChange={e => { setSelectedClassId(e.target.value); setStatuses({}); setSaved(false); }}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}
          >
            {myClasses.map(c => (
              <option key={c.id} value={c.id}>{c.subject} · {c.day_of_week} {c.time}</option>
            ))}
          </select>
        </div>
      )}

      {saved ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div className="success-mark"><Check size={27} /></div>
          <h3>Attendance saved</h3>
          <p>Attendance for {activeClass?.subject} · {activeClass?.day_of_week} {activeClass?.time} has been recorded.</p>
          <Button onClick={handleReset}>Mark another session</Button>
        </div>
      ) : (
        <div className="card">
          {activeClass && (
            <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
              <span className="label">{activeClass.subject}</span>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>{activeClass.day_of_week} · {activeClass.time} · {enrolledChildren.length} students</p>
            </div>
          )}
          {enrolledChildren.length === 0 && (
            <p className="empty-state-text">No confirmed bookings for this class yet.</p>
          )}
          <div className="attendance-modal-list">
            {enrolledChildren.map(s => (
              <div className="attendance-modal-row" key={s.id}>
                <div className={`mini-avatar ${colours[s.id] ?? 'pink'}-bg`}>{s.initials}</div>
                <strong>{s.name}</strong>
                <div className="attendance-status-control">
                  {STATUS_OPTS.map(opt => (
                    <button
                      key={opt}
                      className={`attendance-status-btn ${opt.toLowerCase().replace('-', '')} ${statuses[s.id] === opt ? 'active' : ''}`}
                      onClick={() => setStatuses({ ...statuses, [s.id]: opt })}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {enrolledChildren.length > 0 && (
            <div className="review-actions">
              <Button variant="ghost" onClick={handleReset} icon={X}>Reset</Button>
              <Button onClick={handleSave} icon={Check}>Save Attendance</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
