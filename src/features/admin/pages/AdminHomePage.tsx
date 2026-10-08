import { ArrowRight, BarChart3, Bell, CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, FileText, GraduationCap, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Stat({ label, value, accent, icon: Icon }: { label: string; value: string; accent: string; icon: React.ElementType }) {
  return (
    <div className={`stat-card accent-${accent}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <strong>{value}</strong><span>{label}</span><div className="stat-line" />
    </div>
  );
}

function TodayRow({ time, subject, student, color }: { time: string; subject: string; student: string; color: string }) {
  return (
    <div className="today-row">
      <strong>{time}<small>PM</small></strong>
      <span className={`today-dot ${color}`} />
      <div><b>{subject}</b><small>{student}</small></div>
      <span className="today-status">Upcoming</span>
    </div>
  );
}

const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

export function AdminHomePage() {
  const navigate = useNavigate();
  return (
    <div className="page-stack">
      <div className="admin-stats">
        <Stat label="Active students" value="48" accent="pink" icon={GraduationCap} />
        <Stat label="Upcoming assessments" value="6" accent="yellow" icon={ClipboardList} />
        <Stat label="Classes today" value="12" accent="teal" icon={CalendarDays} />
        <Stat label="Pending payments" value="3" accent="orange" icon={CircleDollarSign} />
        <Stat label="Reports due" value="8" accent="green" icon={FileText} />
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
            <div><span className="label">Tuesday, 14 October</span><h3>Today's rhythm</h3></div>
            <button className="text-link" onClick={() => navigate('/admin/classes')}>View timetable <ArrowRight size={14} /></button>
          </div>
          <TodayRow time="3:30" subject="Mathematics" student="Emma Johnson" color="pink" />
          <TodayRow time="4:00" subject="Reading" student="Oliver Williams" color="teal" />
          <TodayRow time="4:30" subject="English" student="Sophie Brown" color="yellow" />
        </div>
      </div>
      <div className="admin-grid">
        <div className="card admin-list">
          <div className="card-heading"><div><span className="label">Needs your attention</span><h3>Little nudges</h3></div></div>
          {[['8 reports due this week', 'Prepare and share progress updates', '/admin/reports'], ['3 payments to follow up', 'A friendly reminder may help', '/admin/payments']].map(([x, y, p], i) => (
            <button className="nudge" key={x} onClick={() => navigate(p)}>
              <span className={`nudge-icon ${colours[i]}`}><Bell size={16} /></span>
              <div><strong>{x}</strong><small>{y}</small></div>
              <ChevronRight size={16} />
            </button>
          ))}
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
