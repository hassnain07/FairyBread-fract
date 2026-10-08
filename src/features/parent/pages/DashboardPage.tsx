import { ArrowRight, BarChart3, CalendarDays, Check, CircleDollarSign, ClipboardList, Heart } from 'lucide-react';
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

function ClassRow({ day, date, subject, tutor, time, color }: { day: string; date: string; subject: string; tutor: string; time: string; color: string }) {
  return (
    <div className="class-row">
      <div className={`date-block ${color}`}><b>{day}</b><strong>{date}</strong></div>
      <div className="class-detail"><strong>{subject}</strong><span>{time} · {tutor}</span></div>
      <span className="class-status">Confirmed</span>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { familyId } = useAuth();
  const [selectedIdx, setSelectedIdx] = useState(0);

  const { data: children = [] } = useQuery({
    queryKey: ['children', familyId],
    queryFn: () => dataClient.getChildren(familyId),
  });

  const { activeTerm } = useBookingEligibility(familyId);

  const child = children[selectedIdx];

  // Static enrichment data keyed by child index — mirrors prototype display
  const enrichment = [
    { maths: 80, english: 72, progress: 74, sessionsBooked: 3, sessionsTotal: 4, trend: '+12%', tutorNote: 'Emma did a brilliant job explaining equivalent fractions today. What a star!', tutorName: 'Jessica Taylor', tutorInitials: 'JT', tutorColor: 'pink', classes: [{ day: 'MON', date: '14', subject: 'Mathematics', tutor: 'Jessica Taylor', time: '3:30 PM', color: 'pink' }, { day: 'WED', date: '16', subject: 'English', tutor: 'Sarah Wilson', time: '4:30 PM', color: 'teal' }] },
    { maths: 64, english: 78, progress: 61, sessionsBooked: 2, sessionsTotal: 4, trend: '+8%', tutorNote: 'Oliver is really finding his feet with addition strategies. Lovely effort!', tutorName: 'Sarah Wilson', tutorInitials: 'SW', tutorColor: 'teal', classes: [{ day: 'TUE', date: '15', subject: 'English', tutor: 'Sarah Wilson', time: '4:00 PM', color: 'teal' }] },
  ];
  const e = enrichment[selectedIdx] ?? enrichment[0];

  if (!child) return <div className="page-stack"><p>Loading...</p></div>;

  const firstName = child.name.split(' ')[0];

  return (
    <div className="page-stack">
      {/* Child switcher */}
      <div className="child-switcher">
        {children.map((c, i) => (
          <button key={c.id} className={selectedIdx === i ? 'active' : ''} onClick={() => setSelectedIdx(i)}>
            <span className="switcher-avatar">{c.initials}</span>
            <span className="switcher-name">{c.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="welcome-card">
        <SprinkleField count={14} />
        <div>
          <div className="eyebrow">Your family dashboard</div>
          <h2>A little progress<br /><em>goes a long way.</em></h2>
          <p>{firstName} has been showing up and shining this week.</p>
          <Button onClick={() => navigate('/parent/children')} variant="secondary" icon={ArrowRight}>View {firstName}'s progress</Button>
        </div>
        <div className="welcome-art">
          <div className="sun-shape" /><div className="trophy">★</div>
          <div className="art-note">{e.trend}<small>this term</small></div>
        </div>
      </div>

      {/* Term credit meter — visible on dashboard per spec Section 7 */}
      {activeTerm && <TermCreditMeter term={activeTerm} />}

      <div className="grid-2">
        <div className="card progress-card">
          <div className="card-heading">
            <div><span className="label">{child.name} · {child.year}</span><h3>{firstName} is doing great!</h3></div>
            <div className="round-check"><Check size={17} /></div>
          </div>
          <p>{e.sessionsTotal - e.sessionsBooked} session{e.sessionsTotal - e.sessionsBooked === 1 ? '' : 's'} remaining this week</p>
          {activeTerm && (
            <div className="credit-inline-summary">
              <span className="credit-inline-used">{activeTerm.classes_included - activeTerm.classes_remaining} credits used</span>
              <span className="credit-inline-sep">·</span>
              <span className="credit-inline-remaining">{activeTerm.classes_remaining} remaining</span>
            </div>
          )}
          <div className="big-progress">
            <div className="ring"><strong>{e.progress}</strong><span>%</span></div>
            <div>
              <strong>Weekly rhythm</strong>
              <small>{e.sessionsBooked} of {e.sessionsTotal} sessions attended</small>
              <Progress value={e.progress} color="pink" />
              <a onClick={() => navigate('/parent/bookings')}>View bookings <ArrowRight size={14} /></a>
            </div>
          </div>
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

      <div className="section-row">
        <div className="card flex-2">
          <div className="card-heading">
            <div><span className="label">This week</span><h3>Upcoming classes</h3></div>
            <button className="text-link" onClick={() => navigate('/parent/bookings')}>See all <ArrowRight size={14} /></button>
          </div>
          {e.classes.map((cl, i) => <ClassRow key={i} {...cl} />)}
        </div>
        <div className="card notice-card">
          <div className="notice-icon"><span>✦</span></div>
          <span className="label">A note from {e.tutorName.split(' ')[0]}</span>
          <p>"{e.tutorNote}"</p>
          <div className="tutor-mini">
            <div className={`mini-avatar ${e.tutorColor}-bg`}>{e.tutorInitials}</div>
            <small>{e.tutorName}<br /><b>{firstName}'s tutor</b></small>
          </div>
        </div>
      </div>

      <div className="section-row">
        <div className="card child-summary">
          <div className="card-heading">
            <div><span className="label">Your children</span><h3>Growing every day</h3></div>
            <button className="text-link" onClick={() => navigate('/parent/children')}>View all <ArrowRight size={14} /></button>
          </div>
          <div className="child-inline">
            <div className="child-avatar">{child.initials}</div>
            <div><strong>{child.name}</strong><span>{child.year} · {child.school}</span></div>
            <div className="child-metric"><b>{e.maths}%</b><span>Maths</span></div>
            <div className="child-metric teal-text"><b>{e.english}%</b><span>English</span></div>
          </div>
        </div>
        <div className="card next-card">
          <div className="next-icon"><Heart size={18} /></div>
          <div><span className="label">Next up</span><h3>End of Term Report</h3><p>Available in 12 days</p></div>
          <ArrowRight size={18} />
        </div>
      </div>
    </div>
  );
}
