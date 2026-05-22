# Customer Service Chatbot

這是一個簡潔的客服機器人前端範例，提供常見問題快捷按鈕、聊天紀錄與本地規則式回覆。

## 執行方式

```
npm install
npm start
```

開啟 `http://localhost:3000` 即可使用。

## 使用免費本機模型

預設使用 `Ollama` 本機模型，不需要 OpenAI 付費 API。

先建立 `.env`：

```powershell
Copy-Item .env.example .env
```

`.env` 預設已經是：

```env
MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
PORT=3000
```

安裝並啟動 Ollama 後，先拉模型：

```powershell
ollama pull llama3.2:3b
```

然後啟動網頁：

```powershell
npm install
npm run build
npm run serve:api
```

開啟 `http://localhost:3000`。

## 改回 OpenAI

如果你之後想改回 OpenAI，可以把 `.env` 改成：

```env
MODEL_PROVIDER=openai
OPENAI_API_KEY=你的 OpenAI API Key
```

## Docker

```
docker build -t customer-service-chatbot .
docker run -d -p 8088:3000 --name customer-service-chatbot customer-service-chatbot
```

開啟 `http://localhost:8088`。
