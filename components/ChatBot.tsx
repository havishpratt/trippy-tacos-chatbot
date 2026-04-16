"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
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

const SUGGESTED_QUESTIONS = [
  "What are the most popular menu items?",
  "What do customers complain about?",
  "Tell me about the birria tacos",
  "How is the service overall?",
];

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

  async function sendChat(userMessage: string) {
    const trimmed = userMessage.trim();
    if (!trimmed || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
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
      const assistantText = data.text;
      const sources = parseMessageSources(data.sources);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText, sources },
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendChat(input);
  }

  return (
    <div className="chat-container">
      <header className="chat-header">
        <div className="header-brand">
          <div className="header-logo-wrap">
            <Image
              src="/trippy-tacos-logo.png"
              alt="Trippy Tacos"
              width={160}
              height={48}
              className="header-logo-img"
              priority
            />
          </div>
          <div>
            <h1 className="header-title">Trippy Tacos</h1>
            <p className="header-subtitle">Review Insights</p>
          </div>
        </div>
      </header>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-logo-wrap">
              <Image
                src="/trippy-tacos-logo.png"
                alt="Trippy Tacos"
                width={240}
                height={96}
                className="empty-state-logo-img"
                priority
              />
            </div>
            <p className="empty-title">What would you like to know?</p>
            <div className="suggestion-pills">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="suggestion-pill"
                  onClick={() => void sendChat(q)}
                >
                  {q}
                </button>
              ))}
            </div>
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
                <div className="assistant-avatar">
                  <img
                    src="/trippy-tacos-logo.png"
                    alt="Trippy Tacos"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      objectFit: "contain",
                    }}
                  />
                </div>
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
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            className="md-a"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
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
            <div className="assistant-avatar">
              <img
                src="/trippy-tacos-logo.png"
                alt="Trippy Tacos"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  objectFit: "contain",
                }}
              />
            </div>
            <div className="bubble-assistant">
              <div
                className="typing-indicator"
                role="status"
                aria-live="polite"
                aria-label="Assistant is typing"
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Trippy Tacos reviews..."
          disabled={isLoading}
          className="chat-input"
        />
        <button
          type="submit"
          aria-label="Send"
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
