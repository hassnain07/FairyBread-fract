import { ArrowRight, BarChart3, BookOpen, CalendarDays, CircleDollarSign, Menu, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { SprinkleField } from '../../../components/ui/Sprinkles';
import { Progress } from '../../../components/ui/Progress';
import { ChevronRight } from 'lucide-react';

const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <img src="/assets/image.png" alt="Fairybread & Fractions" />
      <div><strong>fairybread</strong><span>& fractions</span></div>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="site landing">
      <header className="topbar">
        <Logo />
        <nav>
          <a href="#how">How it works</a>
          <a href="#why">Why fairybread?</a>
          <a href="/shop" style={{ color: 'var(--pink)', fontWeight: 700 }}>Shop</a>
        </nav>
        <div className="top-actions">
          <Button variant="ghost" onClick={() => navigate('/login')}>
            Sign in <ArrowRight size={15} />
          </Button>
          <Button onClick={() => navigate('/signup')}>Get started</Button>
          <button className="mobile-menu"><Menu size={22} /></button>
        </div>
      </header>
      <main>
        <section className="hero">
          <SprinkleField count={26} />
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> Tutoring with a sprinkle of fun</div>
            <h1>Make maths feel<br /><em>magical.</em></h1>
            <p>Supportive tutoring for curious minds, with a little more colour, confidence and joy in every session.</p>
            <div className="hero-actions">
              <Button onClick={() => navigate('/signup')} icon={ArrowRight}>Create your account</Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>Sign in</Button>
            </div>
            <div className="trust-row">
              <div className="avatar-stack"><span>SJ</span><span>OW</span><span>+48</span></div>
              <div><strong>Loved by local families</strong><small>Personalised learning that sticks.</small></div>
            </div>
          </div>
          <div className="hero-device">
            <div className="device-glow" />
            <div className="device">
              <div className="device-notch" />
              <div className="device-screen">
                <div className="device-head">
                  <div><small>Good afternoon,</small><strong>Sarah <span>&#10022;</span></strong></div>
                  <div className="mini-avatar">SJ</div>
                </div>
                <div className="device-welcome">
                  <span>Emma is doing great!</span>
                  <strong>1 session remaining<br />this week</strong>
                  <Progress value={74} color="yellow" />
                </div>
                <div className="mini-heading"><strong>Quick actions</strong><span>View all</span></div>
                <div className="mini-actions">
                  <span><CalendarDays size={14} />Book class</span>
                  <span><BarChart3 size={14} />Reports</span>
                  <span><CircleDollarSign size={14} />Payment</span>
                </div>
                <div className="mini-heading"><strong>Upcoming classes</strong><span>See all</span></div>
                <div className="mini-class">
                  <b>MON<br /><strong>14</strong></b>
                  <div><strong>Mathematics</strong><small>3:30 PM · Jessica Taylor</small></div>
                  <ChevronRight size={15} />
                </div>
                <div className="mini-class">
                  <b className="teal-text">WED<br /><strong>16</strong></b>
                  <div><strong>English</strong><small>4:30 PM · Sarah Wilson</small></div>
                  <ChevronRight size={15} />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="how" className="section how">
          <div className="section-intro">
            <div className="eyebrow">A little magic goes a long way</div>
            <h2>Learning, made <em>lovely.</em></h2>
            <p>From the first hello to the proudest high-five, we make the whole tutoring journey feel simple.</p>
          </div>
          <div className="steps">
            {[
              ['01', 'Create your account', 'Tell us a little about your family.'],
              ['02', 'Book an assessment', 'We get to know how your child learns best.'],
              ['03', 'Choose your classes', 'Pick a rhythm that works for your week.'],
              ['04', 'Watch them grow', 'Celebrate progress, big and small.'],
            ].map(([n, t, d], i) => (
              <div className="step" key={n}>
                <span className={`step-number ${colours[i]}`}>{n}</span>
                <h3>{t}</h3><p>{d}</p>
                <span className="step-arrow">&#8599;</span>
              </div>
            ))}
          </div>
        </section>
        <section id="why" className="section feature-section">
          <div className="section-intro">
            <div className="eyebrow">Everything in one happy place</div>
            <h2>Less admin.<br /><em>More aha moments.</em></h2>
          </div>
          <div className="feature-grid">
            {[
              [BookOpen, 'Personalised learning', 'Lessons shaped around how your child thinks.', 'pink'],
              [CalendarDays, 'Simple class booking', 'A clear, calm way to plan your week.', 'yellow'],
              [CircleDollarSign, 'Simple, transparent payments', 'Invoices and receipts, without the paper chase.', 'teal'],
              [BarChart3, 'Progress & reports', 'See the wins and know what comes next.', 'orange'],
            ].map(([I, t, d, c]) => (
              <div className={`feature-card ${c}`} key={t as string}>
                <I size={24} /><h3>{t as string}</h3><p>{d as string}</p><ArrowRight size={18} />
              </div>
            ))}
          </div>
        </section>
        <section className="landing-cta">
          <SprinkleField count={12} />
          <div>
            <div className="eyebrow">Ready when you are</div>
            <h2>Make learning a little<br /><em>more fun.</em></h2>
          </div>
          <Button onClick={() => navigate('/signup')} variant="secondary" icon={ArrowRight}>Create your account</Button>
        </section>
      </main>
      <footer>
        <Logo compact />
        <span>Made with care for curious minds.</span>
        <button onClick={() => navigate('/admin')}>Admin demo <ArrowRight size={14} /></button>
      </footer>
      <DemoBar />
    </div>
  );
}

function DemoBar() {
  const navigate = useNavigate();
  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, background: '#23312f', borderRadius: 999, padding: '8px 16px', zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,.3)' }}>
      <span style={{ color: '#75817d', fontSize: 12, alignSelf: 'center', marginRight: 4 }}>Demo</span>
      {[
        { label: 'Website', path: '/' },
        { label: 'Parent', path: '/parent' },
        { label: 'Admin', path: '/admin' },
        { label: 'Teacher', path: '/teacher' },
      ].map(({ label, path }) => (
        <button key={path} onClick={() => navigate(path)} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
          {label}
        </button>
      ))}
    </div>
  );
}
