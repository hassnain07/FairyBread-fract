import { ArrowRight, Bell, Check, Mail, MoreHorizontal, Plus, Sparkles, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import type { Conversation } from '../../../types/message';

function timeLabel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso).getDay()];
}

export function AdminMessagesPage() {
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeMsg, setComposeMsg] = useState('');
  const [composeFamilyId, setComposeFamilyId] = useState('');
  const [composeTeacherId, setComposeTeacherId] = useState('');
  const [composeError, setComposeError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: qk.conversations,
    queryFn: () => dataClient.getConversations!(),
  });

  const { data: families = [] } = useQuery({
    queryKey: qk.families,
    queryFn: () => dataClient.getAllFamilies!(),
    enabled: showCompose,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: qk.teachers,
    queryFn: () => dataClient.getTeachers!(),
    enabled: showCompose,
  });

  const convId = activeConvId ?? conversations[0]?.id ?? null;
  const activeConv: Conversation | undefined = conversations.find(c => c.id === convId);

  const { data: messages = [] } = useQuery({
    queryKey: qk.messages(convId ?? ''),
    queryFn: () => convId ? dataClient.getMessages!(convId) : Promise.resolve([]),
    enabled: !!convId,
  });

  useEffect(() => {
    if (convId) {
      dataClient.markConversationRead!(convId).then(() =>
        qc.invalidateQueries({ queryKey: qk.conversations })
      );
    }
  }, [convId, qc]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: () => dataClient.sendMessage!(convId!, draft.trim()),
    onSuccess: () => {
      setDraft('');
      setError('');
      qc.invalidateQueries({ queryKey: qk.messages(convId!) });
      qc.invalidateQueries({ queryKey: qk.conversations });
    },
    onError: (e: Error) => setError(toAppError(e).message),
  });

  const compose = useMutation({
    mutationFn: async () => {
      const kind = composeTeacherId ? 'teacher_staff' : 'parent_staff';
      const target = composeTeacherId
        ? { teacherId: composeTeacherId }
        : { familyId: composeFamilyId };
      const cid = await dataClient.startConversation!(kind as any, target);
      await dataClient.sendMessage!(cid, composeMsg.trim());
      return cid;
    },
    onSuccess: (cid) => {
      setShowCompose(false);
      setComposeMsg('');
      setComposeFamilyId('');
      setComposeTeacherId('');
      setComposeError('');
      qc.invalidateQueries({ queryKey: qk.conversations });
      setActiveConvId(cid);
    },
    onError: (e: Error) => setComposeError(toAppError(e).message),
  });

  function handleSend() {
    if (!draft.trim() || !convId) return;
    send.mutate();
  }

  const otherInitials = activeConv?.title.split(' ').map(x => x[0]).join('').slice(0, 2) ?? '';
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Communication centre</h2><p>A warm, helpful touchpoint for every family.</p></div>
        <Button icon={Plus} onClick={() => setShowCompose(true)}>New message</Button>
      </div>

      <div className="admin-message-actions">
        {([
          ['Send message', 'To one family', 'pink', false],
          ['Announcement', 'To all families', 'yellow', true],
          ['Payment reminder', 'Friendly nudge', 'teal', true],
          ['Booking reminder', 'Coming up soon', 'orange', true],
        ] as const).map(([x, y, c, reminder]) => (
          <button className="card" key={x} onClick={() => setShowCompose(true)}>
            <span className={`${c}-bg`}>{reminder ? <Bell size={18} /> : <Sparkles size={18} />}</span>
            <div><strong>{x}</strong><small>{y}</small></div>
            <ArrowRight size={17} />
          </button>
        ))}
      </div>

      <div className="messages-layout" style={{ display: 'grid' }}>
        <div className="card conversation-list">
          <div className="card-heading">
            <div>
              <span className="label">All conversations</span>
              <h3>{totalUnread > 0 ? `${totalUnread} unread` : 'Inbox'}</h3>
            </div>
          </div>
          <div className="conversation-scroll">
            {conversations.map(conv => {
              const initials = conv.title.split(' ').map(x => x[0]).join('').slice(0, 2);
              return (
                <button
                  key={conv.id}
                  className={`conversation ${conv.id === convId ? 'active' : ''}`}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  <div className={`mini-avatar ${conv.avatar_color}-bg`}>{initials}</div>
                  <div>
                    <strong>{conv.title}</strong>
                    <span>{conv.last_message}</span>
                    {conv.unread_count > 0 && (
                      <span className="reminder-pill"><Bell size={11} />{conv.unread_count} new</span>
                    )}
                  </div>
                  <small>{timeLabel(conv.last_message_at)}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card chat-window">
          {activeConv ? (
            <>
              <div className="chat-head">
                <div className={`mini-avatar ${activeConv.avatar_color}-bg`}>{otherInitials}</div>
                <div>
                  <strong>{activeConv.title}</strong>
                  <span>Replying as Fairybread &amp; Fractions</span>
                </div>
                <MoreHorizontal size={18} />
              </div>
              <div className="chat-body" ref={bodyRef}>
                {messages.map(msg => {
                  const isMine = msg.sender_role === 'admin';
                  return (
                    <div key={msg.id}>
                      {msg.is_reminder && (
                        <div className="chat-reminder-label"><Bell size={12} />Reminder</div>
                      )}
                      <div className={`chat-bubble ${isMine ? 'sent' : 'received'}`}>
                        {msg.body}
                        <small>{timeLabel(msg.created_at)}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
              {error && <p className="auth-error" style={{ margin: '0 12px' }}>{error}</p>}
              <div className="chat-input">
                <input
                  placeholder="Write a message..."
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                />
                <button onClick={handleSend} disabled={!draft.trim() || send.isPending}>
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <Mail size={32} />
              <p>Select a conversation to reply.</p>
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <div className="modal-backdrop" onClick={() => setShowCompose(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCompose(false)}><X size={18} /></button>
            <div className="modal-icon"><Mail size={22} /></div>
            <h2>New message</h2>
            <div className="add-modal-form">
              <label>Family
                <select value={composeFamilyId} onChange={e => { setComposeFamilyId(e.target.value); setComposeTeacherId(''); }}>
                  <option value="">— select family —</option>
                  {families.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.parent_name}</option>
                  ))}
                </select>
              </label>
              <label>Or teacher
                <select value={composeTeacherId} onChange={e => { setComposeTeacherId(e.target.value); setComposeFamilyId(''); }}>
                  <option value="">— select teacher —</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label>Message
                <textarea
                  value={composeMsg}
                  onChange={e => setComposeMsg(e.target.value)}
                  placeholder="Type your message here..."
                  rows={4}
                />
              </label>
              {composeError && <p className="auth-error">{composeError}</p>}
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowCompose(false)} icon={X}>Cancel</Button>
              <Button
                icon={Check}
                onClick={() => compose.mutate()}
                disabled={(!composeFamilyId && !composeTeacherId) || !composeMsg.trim() || compose.isPending}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
