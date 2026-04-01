"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

type MessageSource = {
  index: number;
  reviewer: string;
  date: string | null;
  source: string;
  rating: number | null;
};

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[];
}

function parseMessageSources(raw: unknown): MessageSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: MessageSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.index !== "number") continue;
    out.push({
      index: s.index,
      reviewer: typeof s.reviewer === "string" ? s.reviewer : "Anonymous",
      date:
        s.date === null
          ? null
          : typeof s.date === "string"
            ? s.date
            : null,
      source: typeof s.source === "string" ? s.source : "unknown",
      rating: typeof s.rating === "number" ? s.rating : null,
    });
  }
  return out.length > 0 ? out : undefined;
}

function getReferencedSourceIndices(text: string): Set<number> {
  const indices = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    indices.add(Number(m[1]));
  }
  return indices;
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    console.log('All Messages: ' + JSON.stringify(messages));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("Chat API error:", res.status, errBody);
        throw new Error("Chat request failed");
      }

      const data = (await res.json()) as { text?: string; sources?: unknown };
      if (typeof data.text !== "string") {
        throw new Error("Invalid chat response");
      }
      const sources = parseMessageSources(data.sources);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text, sources },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="chat-container">
      {/* Header */}
      <header className="chat-header">
        <div className="header-icon">🌮</div>
        <div>
          <h1 className="header-title">Trippy Tacos</h1>
          <p className="header-subtitle">Review Insights</p>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <p className="empty-title">What do your customers think?</p>
            <p className="empty-hint">
              Ask about reviews, sentiment, menu items, or feedback trends.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const refIndices =
            msg.role === "assistant"
              ? getReferencedSourceIndices(msg.content)
              : new Set<number>();
          const citedSources =
            msg.role === "assistant" && msg.sources
              ? msg.sources
                  .filter((s) => refIndices.has(s.index))
                  .sort((a, b) => a.index - b.index)
              : [];
          const showCitationFooter = citedSources.length > 0;

          return (
            <div
              key={i}
              className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}
            >
              {msg.role === "assistant" && (
                <div className="assistant-avatar">🌮</div>
              )}
              <div
                className={`message-bubble ${msg.role === "user" ? "bubble-user" : "bubble-assistant"}${
                  showCitationFooter ? " bubble-assistant--with-citations" : ""
                }`}
              >
                {msg.role === "assistant" ? (
                  <>
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => (
                          <p className="md-p">{children}</p>
                        ),
                        strong: ({ children }) => (
                          <strong className="md-strong">{children}</strong>
                        ),
                        ul: ({ children }) => (
                          <ul className="md-ul">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="md-ol">{children}</ol>
                        ),
                        li: ({ children }) => (
                          <li className="md-li">{children}</li>
                        ),
                        h1: ({ children }) => (
                          <h3 className="md-heading">{children}</h3>
                        ),
                        h2: ({ children }) => (
                          <h3 className="md-heading">{children}</h3>
                        ),
                        h3: ({ children }) => (
                          <h3 className="md-heading">{children}</h3>
                        ),
                        code: ({ children }) => (
                          <code className="md-code">{children}</code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="md-blockquote">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    {showCitationFooter && (
                      <div className="citations-footer" aria-label="Sources">
                        <ul className="citations-footer-list">
                          {citedSources.map((s) => (
                            <li key={s.index} className="citation-line">
                              <span className="citation-line-index">
                                [{s.index}]
                              </span>{" "}
                              <span className="citation-line-body">
                                {s.reviewer}
                                {s.date != null ? ` — ${s.date}` : ""} (via{" "}
                                {s.source})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="message message-assistant">
            <div className="assistant-avatar">🌮</div>
            <div className="bubble-assistant loading-bubble">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What do customers say about..."
          disabled={isLoading}
          className="chat-input"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="chat-send"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
