"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
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

      const text = await res.text();
      setMessages((prev) => [...prev, { role: "assistant", content: text }]);
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

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}
          >
            {msg.role === "assistant" && (
              <div className="assistant-avatar">🌮</div>
            )}
            <div
              className={`message-bubble ${msg.role === "user" ? "bubble-user" : "bubble-assistant"}`}
            >
              {msg.role === "assistant" ? (
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
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

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
