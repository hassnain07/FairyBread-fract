import { ArrowRight, Bell, MoreHorizontal, Plus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { dataClient } from '../../../lib/data/client';
import { qk } from '../../../lib/data/queryKeys';
import { useAuth } from '../../../app/providers';
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
  const d = Math.floor(h / 24);
  if (d < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso).getDay()];
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function MessagesPage() {
  const { familyId } = useAuth();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-create support thread on first visit
  useEffect(() => {
    if (!familyId) return;
    dataClient.startConversation!('parent_staff', { familyId })
      .then(() => qc.invalidateQueries({ queryKey: qk.conversations }))
      .catch(() => {});
  }, [familyId, qc]);

  const { data: conversations = [] } = useQuery({
    queryKey: qk.conversations,
    queryFn: () => dataClient.getConversations!(),
    enabled: !!familyId,
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

  const otherInitials = activeConv?.title.split(' ').map(x => x[0]).join('').slice(0, 2) ?? '';

  return (
    <div className="page-stack messages-layout">
      <div className="card conversation-list">
        <div className="card-heading">
          <div><span className="label">Inbox</span><h3>Messages</h3></div>
          <Button variant="soft" icon={Plus} onClick={() => familyId && dataClient.startConversation!('parent_staff', { familyId }).then(() => qc.invalidateQueries({ queryKey: qk.conversations }))}>New</Button>
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
                <span>Typically replies within a day</span>
              </div>
              <MoreHorizontal size={18} />
            </div>
            <div className="chat-body" ref={bodyRef}>
              {messages.map(msg => {
                const isMine = msg.sender_role === 'parent';
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
            <Bell size={32} />
            <p>Select a conversation to start messaging.</p>
          </div>
        )}
      </div>
    </div>
  );
}
