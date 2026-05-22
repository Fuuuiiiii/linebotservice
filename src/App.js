import { useMemo, useState } from "react";
import "./App.css";

const actionGroups = {
  訂單: ["主產品訂單", "耗材訂單", "訂單進度查詢", "申請退貨"],
  產品故障: ["床墊", "小黑盤", "itracer", "fora", "td2300"],
  品質獎勵計畫: ["詢問計畫範本", "計畫附件資格", "計畫分母"],
};

const primaryActions = ["訂單", "產品故障", "品質獎勵計畫"];

const supportDocs = [
  {
    title: "2025 小黑盤數據",
    type: "PDF",
    href: "/support-docs/2025小黑盤數據.pdf",
  },
  {
    title: "批次新增住民",
    type: "PDF",
    href: "/support-docs/批次新增住民.pdf",
  },
  {
    title: "燈號顯示",
    type: "GIF",
    href: "/support-docs/燈號顯示.gif",
  },
];

const fallbackReply =
  "我目前可以先協助整理常見客服資料。若要串接模型回覆，請確認後端服務與 .env 設定已啟動。";

const App = () => {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "您好，我是客服助理。請先選擇問題類型，或直接輸入您遇到的狀況。",
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");

  const latestQuestion = useMemo(
    () => messages.filter((message) => message.role === "user").at(-1)?.text,
    [messages]
  );

  const childActions = selectedAction ? actionGroups[selectedAction] || [] : [];

  const sendMessage = async (text) => {
    const question = text.trim();

    if (!question || isSending) {
      return;
    }

    setInput("");
    setIsSending(true);
    setMessages((current) => [...current, { role: "user", text: question }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: "customer-service-chatbot",
          message: question,
        }),
      });

      if (!response.ok) {
        throw new Error("API unavailable");
      }

      const data = await response.json();
      setMessages((current) => [
        ...current,
        { role: "bot", text: data.reply || fallbackReply, attachments: supportDocs },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "bot", text: fallbackReply, attachments: supportDocs },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handlePrimaryAction = (action) => {
    if (actionGroups[action]) {
      setSelectedAction(action);
      return;
    }

    setSelectedAction("");
    sendMessage(action);
  };

  const handleChildAction = (action) => {
    sendMessage(`${selectedAction}：${action}`);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSelectedAction("");
    sendMessage(input);
  };

  return (
    <main className="app">
      <div className="chat-shell">
        <section className="support-panel" aria-label="Support overview">
          <p className="eyebrow">Customer Support</p>
          <h1>客服知識助理</h1>
          <p>
            輸入設備狀態、操作問題或錯誤情境，系統會協助整理可參考的處理方向與文件。
          </p>
          <div className="status-list" aria-label="System status">
            <span>訂單服務</span>
            <span>產品故障</span>
            <span>品質獎勵計畫</span>
          </div>
        </section>

        <section className="chat-panel" aria-label="Chat">
          <header className="chat-header">
            <div>
              <p>線上客服</p>
              <span>{latestQuestion ? "已收到您的問題" : "準備協助"}</span>
            </div>
            <span className="online-dot" aria-label="Online" />
          </header>

          <div className="message-list">
            {messages.map((message, index) => (
              <div
                className={`message-row message-row-${message.role}`}
                key={`${message.role}-${index}`}
              >
                <div className={`message-bubble ${message.role}`}>
                  <p>{message.text}</p>
                  {message.attachments ? (
                    <div className="attachment-list">
                      {message.attachments.map((attachment) => (
                        <a
                          className="attachment-card"
                          href={attachment.href}
                          key={attachment.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span className="attachment-label">{attachment.type}</span>
                          <strong>{attachment.title}</strong>
                          <span>開啟相關支援文件</span>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="quick-actions">
            {selectedAction ? (
              <button onClick={() => setSelectedAction("")} type="button">
                返回
              </button>
            ) : null}
            {(selectedAction ? childActions : primaryActions).map((action) => (
              <button
                disabled={isSending}
                key={action}
                onClick={() =>
                  selectedAction ? handleChildAction(action) : handlePrimaryAction(action)
                }
                type="button"
              >
                {action}
              </button>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <input
              aria-label="Message"
              onChange={(event) => setInput(event.target.value)}
              placeholder="請輸入問題..."
              value={input}
            />
            <button disabled={isSending || !input.trim()} type="submit">
              {isSending ? "送出中" : "送出"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
};

export default App;
