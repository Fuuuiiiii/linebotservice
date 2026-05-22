import { useMemo, useState } from "react";
import "./App.css";

const actionGroups = {
  訂單: ["主產品訂單", "耗材訂單", "訂單進度查詢", "申請退貨"],
  產品故障: ["床墊", "小黑盤", "itracker", "fora", "td2300"],
  品質獎勵計畫: ["詢問計畫範本", "計畫附件資格", "計畫分母"],
};

const productIssueGroups = {
  床墊: ["網路斷線", "更換住民", "通知與實際不符合", "其他問題"],
  小黑盤: ["數據未上傳", "人數未達標", "感應不良"],
  itracker: ["網頁問題", "itracker不能用了"],
  fora: ["量不出來", "數據未上傳"],
  td2300: ["量測不準", "量不出來", "數據未上傳"],
};

const primaryActions = ["訂單", "產品故障", "品質獎勵計畫"];

const orderReplies = {
  主產品訂單: "要請洽專責業務",
  耗材訂單: "您的名稱或單位名稱：\n耗材名稱：\n數量：\n我們會盡快跟您聯繫",
  訂單進度查詢: "客戶名稱：",
  申請退貨: "客戶名稱：\n產品名稱：\n數量：",
};

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
  const [selectedProduct, setSelectedProduct] = useState("");

  const latestQuestion = useMemo(
    () => messages.filter((message) => message.role === "user").at(-1)?.text,
    [messages]
  );

  const currentActions = useMemo(() => {
    if (selectedProduct) {
      return productIssueGroups[selectedProduct] || [];
    }

    if (selectedAction) {
      return actionGroups[selectedAction] || [];
    }

    return primaryActions;
  }, [selectedAction, selectedProduct]);

  const addLocalReply = (question, reply) => {
    setMessages((current) => [
      ...current,
      { role: "user", text: question },
      { role: "bot", text: reply },
    ]);
  };

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
        { role: "bot", text: data.reply || fallbackReply },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "bot", text: fallbackReply },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handlePrimaryAction = (action) => {
    if (actionGroups[action]) {
      setSelectedAction(action);
      setSelectedProduct("");
      return;
    }

    sendMessage(action);
  };

  const handleChildAction = (action) => {
    if (selectedProduct) {
      sendMessage(`${selectedAction}：${selectedProduct}：${action}`);
      return;
    }

    if (selectedAction === "訂單" && orderReplies[action]) {
      addLocalReply(`${selectedAction}：${action}`, orderReplies[action]);
      return;
    }

    if (selectedAction === "產品故障" && productIssueGroups[action]) {
      setSelectedProduct(action);
      return;
    }

    sendMessage(`${selectedAction}：${action}`);
  };

  const handleBack = () => {
    if (selectedProduct) {
      setSelectedProduct("");
      return;
    }

    setSelectedAction("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSelectedAction("");
    setSelectedProduct("");
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
                  <p style={{ whiteSpace: "pre-line" }}>{message.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="quick-actions">
            {selectedAction ? (
              <button onClick={handleBack} type="button">
                返回
              </button>
            ) : null}
            {currentActions.map((action) => (
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
