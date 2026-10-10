import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, BookOpen, Calendar, Target, MessageSquare, User } from 'lucide-react';
import { TableControls } from '../../../components/ui/TableControls';
import { usePagination, useSearch } from '../../../hooks/usePagination';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';
import type { Child } from '../../../types/family';

export function TeacherStudentsPage() {
  return <TeacherStudentsView />;
}

export function TeacherStudentsView({ teacherIdOverride }: { teacherIdOverride?: string }) {
  const { teacherId: authTeacherId } = useAuth();
  const teacherId = teacherIdOverride ?? authTeacherId;
  const [selected, setSelected] = useState<Child | null>(null);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: qk.teacherBookings,
    queryFn: () => dataClient.getBookingsForTeacher(),
    enabled: !!teacherId,
  });

  const { data: slots = [] } = useQuery({
    queryKey: qk.classSlots,
    queryFn: () => dataClient.getClassSlots(),
  });

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');

  // Build rows from embedded child data on bookings
  const rows = confirmedBookings
    .filter(b => b.child)
    .map(b => {
      const slot = slots.find(s => s.id === b.session?.class_id);
      return {
        child: b.child as Pick<Child, 'id' | 'name' | 'initials'> & Partial<Child>,
        subject: b.session?.subject ?? slot?.subject ?? '—',
        day: b.session ? new Date(b.session.starts_at).toLocaleDateString('en-AU', { weekday: 'long' }) : '—',
        source: b.source === 'term_credit' ? 'Term credit' : 'Individual',
        bookingId: b.id,
      };
    });

  // Deduplicate by child id (show each child once)
  const seen = new Set<string>();
  const uniqueRows = rows.filter(r => { if (seen.has(r.child.id)) return false; seen.add(r.child.id); return true; });

  const selectedBooking = selected ? confirmedBookings.find(b => b.child?.id === selected.id) : null;

  const { search, onSearch } = useSearch(() => onPage(1));
  const searchFiltered = uniqueRows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.child.name.toLowerCase().includes(q) || r.subject.toLowerCase().includes(q);
  });
  const { page, totalPages, paged, onPage, total } = usePagination(searchFiltered);

  if (isLoading) return <div className="page-stack"><p>Loading…</p></div>;

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>My students</h2><p>Students enrolled across your classes.</p></div>
      </div>

      <div className="card table-card">
          <TableControls search={search} onSearch={onSearch} page={page} totalPages={totalPages} total={total} onPage={onPage} placeholder="Search student or subject…" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{['Student', 'Class', 'Day', 'Booking type', ''].map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>No students found.</td></tr>
                )}
                {paged.map(({ child, subject, day, source }) => (
                  <tr key={child.id}>
                    <td><strong className="table-name">{child.name}</strong></td>
                    <td>{subject}</td>
                    <td>{day}</td>
                    <td><span className={`table-status ${source === 'Term credit' ? 'confirmed' : 'view'}`}>{source}</span></td>
                    <td>
                      <button className="btn-view-profile" onClick={() => setSelected(child as Child)}>View profile</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {selected && (
        <div className="profile-drawer-overlay" onClick={() => setSelected(null)}>
          <div className="profile-drawer" onClick={e => e.stopPropagation()}>
            <div className="profile-drawer-header">
              <div className="profile-drawer-avatar">{selected.initials}</div>
              <div>
                <h3>{selected.name}</h3>
                {selectedBooking?.session && (
                  <span>{selectedBooking.session.subject} · {new Date(selectedBooking.session.starts_at).toLocaleDateString('en-AU', { weekday: 'long' })}</span>
                )}
              </div>
              <button className="drawer-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="profile-drawer-body">
              {(selected as Child).subjects && (selected as Child).subjects!.length > 0 && (
                <div className="profile-section">
                  <div className="profile-section-title"><BookOpen size={14} />Learning areas</div>
                  <div className="profile-tags">
                    {(selected as Child).subjects!.map(s => <span key={s} className="profile-tag">{s}</span>)}
                  </div>
                </div>
              )}
              {(selected as Child).preferredDays && (selected as Child).preferredDays!.length > 0 && (
                <div className="profile-section">
                  <div className="profile-section-title"><Calendar size={14} />Preferred days</div>
                  <div className="profile-tags">
                    {(selected as Child).preferredDays!.map(d => <span key={d} className="profile-tag teal">{d}</span>)}
                  </div>
                </div>
              )}
              {(selected as Child).goals && (
                <div className="profile-section">
                  <div className="profile-section-title"><Target size={14} />Learning goals</div>
                  <p className="profile-text">{(selected as Child).goals}</p>
                </div>
              )}
              {(selected as Child).notes && (
                <div className="profile-section">
                  <div className="profile-section-title"><MessageSquare size={14} />About this student</div>
                  <p className="profile-text">{(selected as Child).notes}</p>
                </div>
              )}
              {(selected as Child).preferredTutor && (
                <div className="profile-section">
                  <div className="profile-section-title"><User size={14} />Preferences</div>
                  <div className="profile-pref-row"><span>Preferred tutor</span><strong>{(selected as Child).preferredTutor}</strong></div>
                </div>
              )}
              {!(selected as Child).goals && !(selected as Child).notes && !(selected as Child).subjects?.length && (
                <p style={{ color: 'var(--muted)', fontSize: 14 }}>No profile details on file yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
