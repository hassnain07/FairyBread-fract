import { ArrowRight, BarChart3, Bell, CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, FileText, GraduationCap, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';

function Stat({ label, value, accent, icon: Icon }: { label: string; value: string | number; accent: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <strong>{value}</strong><span>{label}</span><div className="stat-line" />
    </div>
  );
}

export function AdminHomePage() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: qk.adminStats,
    queryFn: () => dataClient.getAdminStats(),
  });

  const today = new Date();
  const from = new Date(today); from.setHours(0, 0, 0, 0);
  const to = new Date(today); to.setHours(23, 59, 59, 999);

  const { data: todaySessions = [] } = useQuery({
    queryKey: qk.sessions({ from: from.toISOString(), to: to.toISOString() }),
    queryFn: () => dataClient.getUpcomingSessions({ from: from.toISOString(), to: to.toISOString() }),
  });

  const dayLabel = today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page-stack">
      <div className="admin-stats">
        <Stat label="Active students" value={stats?.active_students ?? '—'} accent="pink" icon={GraduationCap} />
        <Stat label="Upcoming assessments" value={stats?.upcoming_assessments ?? '—'} accent="yellow" icon={ClipboardList} />
        <Stat label="Classes today" value={stats?.classes_today ?? '—'} accent="teal" icon={CalendarDays} />
        <Stat label="Pending payments" value={stats?.pending_payments ?? '—'} accent="orange" icon={CircleDollarSign} />
        <Stat label="Reports due" value={stats?.reports_due ?? '—'} accent="green" icon={FileText} />
      </div>
      <div className="admin-grid">
        <div className="card admin-chart">
          <div className="card-heading">
            <div><span className="label">Term at a glance</span><h3>Learning momentum</h3></div>
            <button className="select-btn">This term <ChevronRight size={14} /></button>
          </div>
          <div className="chart">
            <div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
            <div className="chart-area">
              <div className="chart-line" />
              <div className="chart-bars">{[50,62,55,72,64,80,75,88,78,94,84,90].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
              <div className="chart-x">{['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'].map(x => <span key={x}>{x}</span>)}</div>
            </div>
          </div>
        </div>
        <div className="card admin-today">
          <div className="card-heading">
            <div><span className="label">{dayLabel}</span><h3>Today's rhythm</h3></div>
            <button className="text-link" onClick={() => navigate('/admin/classes')}>View timetable <ArrowRight size={14} /></button>
          </div>
          {todaySessions.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>No sessions scheduled today.</p>
          )}
          {todaySessions.slice(0, 5).map(s => (
            <div className="today-row" key={s.id}>
              <strong>{new Date(s.starts_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</strong>
              <span className={`today-dot ${s.teacher_color}`} />
              <div><b>{s.subject}</b><small>{s.teacher_name} · {s.booked_count}/{s.capacity}</small></div>
              <span className="today-status">{s.status === 'scheduled' ? 'Upcoming' : s.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-grid">
        <div className="card admin-list">
          <div className="card-heading"><div><span className="label">Needs your attention</span><h3>Little nudges</h3></div></div>
          {stats && stats.pending_payments > 0 && (
            <button className="nudge" onClick={() => navigate('/admin/payments')}>
              <span className="nudge-icon orange"><Bell size={16} /></span>
              <div><strong>{stats.pending_payments} payment{stats.pending_payments !== 1 ? 's' : ''} to review</strong><small>A friendly reminder may help</small></div>
              <ChevronRight size={16} />
            </button>
          )}
          {stats && stats.reports_due > 0 && (
            <button className="nudge" onClick={() => navigate('/admin/reports')}>
              <span className="nudge-icon green"><Bell size={16} /></span>
              <div><strong>{stats.reports_due} report{stats.reports_due !== 1 ? 's' : ''} due this week</strong><small>Prepare and share progress updates</small></div>
              <ChevronRight size={16} />
            </button>
          )}
          {(!stats || (stats.pending_payments === 0 && stats.reports_due === 0)) && (
            <p style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>All caught up!</p>
          )}
        </div>
        <div className="card admin-quote">
          <Sparkles size={22} />
          <span className="label">A lovely little reminder</span>
          <h3>Small steps<br /><em>add up.</em></h3>
          <p>Every session is a win worth celebrating.</p>
        </div>
      </div>
    </div>
  );
}
