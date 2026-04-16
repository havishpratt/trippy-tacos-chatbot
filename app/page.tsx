import ChatBot from "@/components/ChatBot";

export default function Home() {
  return (
    <div className="tt-page-root">
      <div className="tt-page-glow" aria-hidden />
      <div className="tt-page-inner">
        <ChatBot />
      </div>
    </div>
  );
}
