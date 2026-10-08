import { ArrowRight, Bell, Check, Mail, MoreHorizontal, Plus, Sparkles, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
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

// Admin sees all conversations that include 'admin' as a participant
const ADMIN_ID = 'admin';

export function AdminMessagesPage() {
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [composeMsg, setComposeMsg] = useState('');
  const [composeRecipient, setComposeRecipient] = useState('Sarah Johnson');
  const bodyRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations', ADMIN_ID],
    queryFn: () => dataClient.getConversations(ADMIN_ID),
  });

  const convId = activeConvId ?? conversations[0]?.id ?? null;
  const activeConv: Conversation | undefined = conversations.find(c => c.id === convId);

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', convId],
    queryFn: () => convId ? dataClient.getMessages(convId) : Promise.resolve([]),
    enabled: !!convId,
  });

  useEffect(() => {
    if (convId) {
      dataClient.markConversationRead(convId).then(() =>
        qc.invalidateQueries({ queryKey: ['conversations', ADMIN_ID] })
      );
    }
  }, [convId, qc]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: () => dataClient.sendMessage({
      conversation_id: convId!,
      sender_role: 'admin',
      sender_name: 'Fairybread & Fractions',
      body: draft.trim(),
    }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['messages', convId] });
      qc.invalidateQueries({ queryKey: ['conversations', ADMIN_ID] });
    },
  });

  function handleSend() {
    if (!draft.trim() || !convId) return;
    send.mutate();
  }

  // Other participant name (not admin)
  const otherName = activeConv?.participant_names.find((_, i) => activeConv.participant_roles[i] !== 'admin') ?? '';
  const otherInitials = otherName.split(' ').map(x => x[0]).join('').slice(0, 2);

  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0);

  return (
    <div className="page-stack">
      <div className="page-toolbar">
        <div><h2>Communication centre</h2><p>A warm, helpful touchpoint for every family.</p></div>
        <Button icon={Plus} onClick={() => setShowCompose(true)}>New message</Button>
      </div>

      {/* Quick action tiles */}
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

      {/* Two-pane chat */}
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
            const other = conv.participant_names.find((_, i) => conv.participant_roles[i] !== 'admin') ?? conv.participant_names[0];
            const initials = other.split(' ').map(x => x[0]).join('').slice(0, 2);
            return (
              <button
                key={conv.id}
                className={`conversation ${conv.id === convId ? 'active' : ''}`}
                onClick={() => setActiveConvId(conv.id)}
              >
                <div className={`mini-avatar ${conv.avatar_color}-bg`}>{initials}</div>
                <div>
                  <strong>{other}</strong>
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
                  <strong>{otherName}</strong>
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
              <div className="chat-input">
                <input
                  placeholder="Write a message..."
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                />
                <button onClick={handleSend} disabled={!draft.trim()}>
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

      {/* Compose modal */}
      {showCompose && (
        <div className="modal-backdrop" onClick={() => setShowCompose(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCompose(false)}><X size={18} /></button>
            <div className="modal-icon"><Mail size={22} /></div>
            <h2>New message</h2>
            <div className="add-modal-form">
              <label>Recipient
                <select value={composeRecipient} onChange={e => setComposeRecipient(e.target.value)}>
                  {['Sarah Johnson', 'Claire Brown', 'James Taylor', 'Michael Chen'].map(p => (
                    <option key={p}>{p}</option>
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
            </div>
            <div className="review-actions">
              <Button variant="ghost" onClick={() => setShowCompose(false)} icon={X}>Cancel</Button>
              <Button
                icon={Check}
                onClick={() => {
                  // In a real app this would create a new conversation or find existing one
                  setShowCompose(false);
                  setComposeMsg('');
                }}
                disabled={!composeMsg.trim()}
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
