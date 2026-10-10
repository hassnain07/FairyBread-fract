import { Bell, Check, Mail, MessageCircle, Plus, Send, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { toAppError } from '../../../lib/data/errors';
import { inboxTime, bubbleTime, dayDivider, dayKey } from '../../../lib/utils/chatTime';
import type { Conversation } from '../../../types/message';

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

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="page-stack">
      <div className={`messages-layout${activeConvId ? ' chat-open' : ''}`} style={{ display: 'grid' }}>
        {/* ── Inbox sidebar ── */}
        <div className="card conversation-list">
          <div className="card-heading">
            <div>
              <span className="label">All conversations</span>
              <h3>{totalUnread > 0 ? `${totalUnread} unread` : 'Inbox'}</h3>
            </div>
            <Button variant="soft" icon={Plus} onClick={() => setShowCompose(true)}>New</Button>
          </div>
          <div className="conversation-scroll">
            {conversations.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 8px' }}>No conversations yet.</p>
            )}
            {conversations.map(conv => {
              const initials = conv.title.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
              return (
                <button
                  key={conv.id}
                  className={`conversation ${conv.id === convId ? 'active' : ''}`}
                  onClick={() => setActiveConvId(conv.id)}
                >
                  <div className={`mini-avatar ${conv.avatar_color}-bg`}>{initials}</div>
                  <div className="conv-body">
                    <div className="conv-top-row">
                      <strong className="conv-name">{conv.title}</strong>
                      <small className="conv-time">{inboxTime(conv.last_message_at)}</small>
                    </div>
                    <span className="conv-preview">{conv.last_message}</span>
                    {conv.unread_count > 0 && (
                      <span className="reminder-pill"><Bell size={11} />{conv.unread_count} new</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chat window ── */}
        <div className="card chat-window">
          {activeConv ? (
            <>
              <div className="chat-head">
                <div className={`mini-avatar ${activeConv.avatar_color}-bg`} style={{ width: 38, height: 38, fontSize: 13 }}>
                  {activeConv.title.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{activeConv.title}</strong>
                  <span>Replying as Fairybread &amp; Fractions</span>
                </div>
                <button className="btn-ghost chat-back-btn" onClick={() => setActiveConvId(null)} title="Back" style={{ marginLeft: 'auto' }}>
                  ✕
                </button>
              </div>

              <div className="chat-body" ref={bodyRef}>
                {messages.map((msg, i) => {
                  const isMine = msg.sender_role === 'admin';
                  const showDivider = i === 0 || dayKey(msg.created_at) !== dayKey(messages[i - 1].created_at);
                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="chat-day-divider"><span>{dayDivider(msg.created_at)}</span></div>
                      )}
                      <div className={`chat-msg-wrap ${isMine ? 'sent' : 'received'}`}>
                        {msg.is_reminder && (
                          <div className="chat-reminder-label"><Bell size={12} />Reminder</div>
                        )}
                        {!isMine && <div className="chat-sender-name">{msg.sender_name}</div>}
                        <div className={`chat-bubble ${isMine ? 'sent' : 'received'}`}>
                          <span className="bubble-body">{msg.body}</span>
                          <small className="bubble-time">{bubbleTime(msg.created_at)}</small>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <p className="auth-error" style={{ margin: '0 16px 8px' }}>{error}</p>}

              <div className="chat-input">
                <input
                  placeholder="Write a message…"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                />
                <button onClick={handleSend} disabled={!draft.trim() || send.isPending} title="Send">
                  <Send size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <MessageCircle size={36} />
              <p>Select a conversation to reply.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Compose modal ── */}
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
                  placeholder="Type your message here…"
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
