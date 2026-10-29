import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LENGTH, type ChatMessage } from '../shared/protocol';
import { socket } from '../lib/socket';

const MAX_KEPT = 100;

/** Room chat history, kept only in memory while the player is in the room. */
export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const add = (m: ChatMessage) => setMessages((ms) => [...ms, m].slice(-MAX_KEPT));
    const reveal = (revealed: { id: number; text: string }[]) => {
      const texts = new Map(revealed.map((r) => [r.id, r.text]));
      setMessages((ms) => ms.map((m) => (texts.has(m.id) ? { ...m, text: texts.get(m.id)!, spoiler: false } : m)));
    };
    socket.on('chat:message', add);
    socket.on('chat:reveal', reveal);
    return () => {
      socket.off('chat:message', add);
      socket.off('chat:reveal', reveal);
    };
  }, []);

  return { messages, clear: () => setMessages([]) };
}

/**
 * Sidebar panel on desktop; on phones a 💬 button that opens it as a bottom sheet,
 * so the keyboard only covers the game when the player chooses to chat.
 */
export function Chat({ messages, me }: { messages: ChatMessage[]; me: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [seen, setSeen] = useState(messages.length);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (open) setSeen(messages.length);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const unread = Math.max(0, messages.length - seen);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    socket.emit('chat:send', text);
    setText('');
  }

  return (
    <>
      <button className="chat-toggle" onClick={() => setOpen(true)} aria-label="Abrir chat">
        💬{unread > 0 && <span className="badge">{unread}</span>}
      </button>

      <section className={`panel chat ${open ? 'open' : ''}`}>
        <header>
          <h3>Chat</h3>
          <button className="secondary small chat-close" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </header>
        <ol ref={listRef}>
          {messages.length === 0 && <li className="muted">Nadie ha escrito todavía.</li>}
          {messages.map((m) => (
            <li key={m.id} className={m.playerId === me ? 'me' : ''}>
              <strong>{m.name}:</strong>{' '}
              {m.spoiler ? (
                m.text ? (
                  <>
                    {m.text} <span className="muted">(🤐 oculto para el resto hasta el final de la ronda)</span>
                  </>
                ) : (
                  <span className="muted">🤐 mensaje oculto hasta el final de la ronda</span>
                )
              ) : (
                m.text
              )}
            </li>
          ))}
        </ol>
        <form onSubmit={send}>
          <input
            value={text}
            maxLength={CHAT_MAX_LENGTH}
            placeholder="Escribe un mensaje…"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={!text.trim()}>
            Enviar
          </button>
        </form>
      </section>
    </>
  );
}
