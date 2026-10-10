import { Bell, MessageCircle, Send } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { useAuth } from '../../../app/providers';
import { toAppError } from '../../../lib/data/errors';
import { inboxTime, bubbleTime, dayDivider, dayKey } from '../../../lib/utils/chatTime';
import type { Conversation } from '../../../types/message';

export function TeacherMessagesPage() {
  const { teacherId } = useAuth();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!teacherId) return;
    dataClient.startConversation!('teacher_staff', { teacherId })
      .then(() => qc.invalidateQueries({ queryKey: qk.conversations }))
      .catch(() => {});
  }, [teacherId, qc]);

  const { data: conversations = [] } = useQuery({
    queryKey: qk.conversations,
    queryFn: () => dataClient.getConversations!(),
    enabled: !!teacherId,
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

  function handleSend() {
    if (!draft.trim() || !convId) return;
    send.mutate();
  }

  return (
    <div className={`page-stack messages-layout${activeConvId ? ' chat-open' : ''}`}>
      {/* ── Inbox sidebar ── */}
      <div className="card conversation-list">
        <div className="card-heading">
          <div><span className="label">Inbox</span><h3>Messages</h3></div>
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
                <span>Typically replies within a day</span>
              </div>
              <button className="btn-ghost chat-back-btn" onClick={() => setActiveConvId(null)} title="Back" style={{ marginLeft: 'auto' }}>
                ✕
              </button>
            </div>

            <div className="chat-body" ref={bodyRef}>
              {messages.map((msg, i) => {
                const isMine = msg.sender_role === 'teacher';
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
            <p>No conversations yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
