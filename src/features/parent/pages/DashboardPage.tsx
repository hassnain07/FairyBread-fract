import { ArrowRight, BarChart3, CalendarDays, Check, CircleDollarSign, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Progress } from '../../../components/ui/Progress';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { TermCreditMeter } from '../../../components/domain/TermCreditMeter';
import { useBookingEligibility } from '../hooks/useBookingEligibility';
import { dataClient } from '../../../lib/data/client';
import { useAuth } from '../../../app/providers';
import { qk } from '../../../lib/data/queryKeys';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const COLORS: Record<string, string> = { Mathematics: 'pink', English: 'teal', Reading: 'orange' };

export function DashboardPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: qk.children(familyId),
    queryFn: () => dataClient.getChildren(familyId),
    enabled: !!familyId,
  });

  const { activeTerm, isLoading: loadingTerm } = useBookingEligibility(familyId);
  const child = children[selectedIdx];

  const { data: bookings = [] } = useQuery({
    queryKey: qk.bookings(familyId),
    queryFn: () => dataClient.getBookings(familyId),
    enabled: !!familyId,
  });

  const { data: reports = [] } = useQuery({
    queryKey: qk.reports(child?.id ?? ''),
    queryFn: () => dataClient.getReports(child?.id ?? ''),
    enabled: !!child?.id,
  });

  if (loadingChildren || loadingTerm) return <div className="page-stack"><p>Loading…</p></div>;
  if (!child) return (
    <div className="page-stack">
      <p>No children found. <button className="text-link" onClick={() => navigate('/parent/children')}>Add a child</button></p>
    </div>
  );

  const firstName = child.givenName || child.name.split(' ')[0];
  const now = new Date();

  const upcomingBookings = bookings
    .filter(b => b.child_id === child.id && b.status === 'confirmed' && b.session && new Date(b.session.starts_at) > now)
    .sort((a, b) => new Date(a.session!.starts_at).getTime() - new Date(b.session!.starts_at).getTime())
    .slice(0, 3);

  const termBookings = bookings.filter(b => b.child_id === child.id && b.status === 'confirmed').length;
  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  return (
    <div className="page-stack">
      <div className="child-switcher">
        {children.map((c, i) => (
          <button key={c.id} className={selectedIdx === i ? 'active' : ''} onClick={() => setSelectedIdx(i)}>
            <span className="switcher-avatar">{c.initials}</span>
            <span className="switcher-name">{c.givenName || c.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="welcome-card">
        <SprinkleField count={14} />
        <div>
          <div className="eyebrow">Your family dashboard</div>
          <h2>A little progress<br /><em>goes a long way.</em></h2>
          <p>{firstName} is on a great learning journey.</p>
          <Button onClick={() => navigate('/parent/children')} variant="secondary" icon={ArrowRight}>View {firstName}'s progress</Button>
        </div>
        <div className="welcome-art">
          <div className="sun-shape" /><div className="trophy">★</div>
        </div>
      </div>

      {activeTerm && <TermCreditMeter term={activeTerm} />}

      <div className="grid-2">
        <div className="card progress-card">
          <div className="card-heading">
            <div><span className="label">{child.name} · {child.year}</span><h3>{firstName} is doing great!</h3></div>
            <div className="round-check"><Check size={17} /></div>
          </div>
          {activeTerm && (
            <div className="credit-inline-summary">
              <span className="credit-inline-used">{activeTerm.classes_included - activeTerm.classes_remaining} credits used</span>
              <span className="credit-inline-sep">·</span>
              <span className="credit-inline-remaining">{activeTerm.classes_remaining} remaining</span>
            </div>
          )}
          {termBookings > 0 ? (
            <div className="big-progress">
              <div className="ring"><strong>{termBookings}</strong></div>
              <div>
                <strong>Sessions this term</strong>
                <small>{termBookings} class{termBookings !== 1 ? 'es' : ''} booked</small>
                <Progress value={Math.min(100, (termBookings / (activeTerm?.classes_included ?? 10)) * 100)} color="pink" />
                <a onClick={() => navigate('/parent/bookings')}>View bookings <ArrowRight size={14} /></a>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No classes booked yet this term.</p>
          )}
        </div>
        <div className="card">
          <div className="card-heading"><div><span className="label">Quick actions</span><h3>What would you like to do?</h3></div></div>
          <div className="quick-grid">
            <button onClick={() => navigate('/parent/book-assessment')}><span className="q-pink"><ClipboardList size={18} /></span>Book assessment</button>
            <button onClick={() => navigate('/parent/book-class')}><span className="q-yellow"><CalendarDays size={18} /></span>Book a class</button>
            <button onClick={() => navigate('/parent/reports')}><span className="q-teal"><BarChart3 size={18} /></span>View reports</button>
            <button onClick={() => navigate('/parent/payments')}><span className="q-orange"><CircleDollarSign size={18} /></span>Make payment</button>
          </div>
        </div>
      </div>

      {upcomingBookings.length > 0 && (
        <div className="section-row">
          <div className="card flex-2">
            <div className="card-heading">
              <div><span className="label">This week</span><h3>Upcoming classes</h3></div>
              <button className="text-link" onClick={() => navigate('/parent/bookings')}>See all <ArrowRight size={14} /></button>
            </div>
            {upcomingBookings.map(b => {
              const d = new Date(b.session!.starts_at);
              const color = COLORS[b.session!.subject] ?? 'yellow';
              return (
                <div className="class-row" key={b.id}>
                  <div className={`date-block ${color}`}><b>{DAYS[d.getDay()]}</b><strong>{d.getDate()}</strong></div>
                  <div className="class-detail">
                    <strong>{b.session!.subject}</strong>
                    <span>{d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · {b.session!.teacher_name}</span>
                  </div>
                  <span className="class-status">Confirmed</span>
                </div>
              );
            })}
          </div>
          {latestReport && (
            <div className="card notice-card">
              <div className="notice-icon"><span>✦</span></div>
              <span className="label">Latest report note</span>
              <p>"{latestReport.note}"</p>
            </div>
          )}
        </div>
      )}

      <div className="section-row">
        <div className="card child-summary">
          <div className="card-heading">
            <div><span className="label">Your children</span><h3>Growing every day</h3></div>
            <button className="text-link" onClick={() => navigate('/parent/children')}>View all <ArrowRight size={14} /></button>
          </div>
          <div className="child-inline">
            <div className="child-avatar">{child.initials}</div>
            <div><strong>{child.name}</strong><span>{child.year} · {child.school}</span></div>
            {latestReport && latestReport.subjects.slice(0, 2).map(s => (
              <div key={s.subject} className="child-metric"><b>{s.rating * 20}%</b><span>{s.subject}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
