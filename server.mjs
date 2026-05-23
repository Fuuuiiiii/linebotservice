import express from "express";
import { middleware, messagingApi } from "@line/bot-sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, "build");
const port = Number(process.env.PORT || 3000);
const modelProvider = process.env.MODEL_PROVIDER || "ollama";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:3b";
const googleOrderWebhookUrl = process.env.GOOGLE_ORDER_WEBHOOK_URL || "";

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

const pendingLineOrders = new Map();

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

const quickReplyGroups = {
  primary: ["訂單", "產品故障", "品質獎勵計畫"],
  order: ["主產品訂單", "耗材訂單", "訂單進度查詢", "申請退貨"],
  product: ["床墊", "小黑盤", "itracker", "fora", "td2300"],
  reward: ["詢問計畫範本", "計畫附件資格", "計畫分母"],
  床墊: ["網路斷線", "更換住民", "通知與實際不符合", "其他問題"],
  小黑盤: ["數據未上傳", "人數未達標", "感應不良"],
  itracker: ["網頁問題", "itracker不能用了"],
  fora: ["量不出來", "數據未上傳"],
  td2300: ["量測不準", "量不出來", "數據未上傳"],
};

const orderInstructionReplies = {
  主產品訂單:
    "您的名稱或單位名稱：\n產品名稱：\n數量：\n會請負責的業務同仁盡快跟您聯繫",
  耗材訂單: "您的名稱或單位名稱：\n產品名稱：\n數量：\n我們會盡快跟您聯繫",
};

const toQuickReply = (labels) => ({
  items: labels.slice(0, 13).map((item) => {
    const option = typeof item === "string" ? { label: item, text: item } : item;

    return {
    type: "action",
    action: {
      type: "message",
      label: option.label,
      text: option.text,
    },
  };
  }),
});

const resolveQuickReplyLabels = (message = "") => {
  const normalized = String(message).trim();

  if (normalized === "訂單") {
    return quickReplyGroups.order.map((label) => ({
      label,
      text: `訂單：${label}`,
    }));
  }

  if (normalized === "產品故障") {
    return quickReplyGroups.product;
  }

  if (normalized === "品質獎勵計畫") {
    return quickReplyGroups.reward.map((label) => ({
      label,
      text: `品質獎勵計畫：${label}`,
    }));
  }

  if (quickReplyGroups[normalized]) {
    return quickReplyGroups[normalized].map((label) => ({
      label,
      text: `產品故障：${normalized}：${label}`,
    }));
  }

  return quickReplyGroups.primary;
};

const menuReplies = new Map([
  ["訂單", "請選擇：主產品訂單、耗材訂單、訂單進度查詢、申請退貨"],
  ["產品故障", "請選擇產品：床墊、小黑盤、itracker、fora、td2300"],
  ["品質獎勵計畫", "請選擇：詢問計畫範本、計畫附件資格、計畫分母"],
  ["主產品訂單", orderInstructionReplies.主產品訂單],
  ["訂單：主產品訂單", orderInstructionReplies.主產品訂單],
  [
    "耗材訂單",
    orderInstructionReplies.耗材訂單,
  ],
  [
    "訂單：耗材訂單",
    orderInstructionReplies.耗材訂單,
  ],
  ["訂單進度查詢", "客戶名稱："],
  ["訂單：訂單進度查詢", "客戶名稱："],
  ["申請退貨", "客戶名稱：\n產品名稱：\n數量："],
  ["訂單：申請退貨", "客戶名稱：\n產品名稱：\n數量："],
  ["床墊", "請選擇問題：網路斷線、更換住民、通知與實際不符合、其他問題"],
  ["產品故障：床墊", "請選擇問題：網路斷線、更換住民、通知與實際不符合、其他問題"],
  ["小黑盤", "請選擇問題：數據未上傳、人數未達標、感應不良"],
  ["產品故障：小黑盤", "請選擇問題：數據未上傳、人數未達標、感應不良"],
  ["itracker", "請選擇問題：網頁問題、itracker不能用了"],
  ["產品故障：itracker", "請選擇問題：網頁問題、itracker不能用了"],
  ["fora", "請選擇問題：量不出來、數據未上傳"],
  ["產品故障：fora", "請選擇問題：量不出來、數據未上傳"],
  ["td2300", "請選擇問題：量測不準、量不出來、數據未上傳"],
  ["產品故障：td2300", "請選擇問題：量測不準、量不出來、數據未上傳"],
]);

const productIssueReplies = {
  床墊: ["網路斷線", "更換住民", "通知與實際不符合", "其他問題"],
  小黑盤: ["數據未上傳", "人數未達標", "感應不良"],
  itracker: ["網頁問題", "itracker不能用了"],
  fora: ["量不出來", "數據未上傳"],
  td2300: ["量測不準", "量不出來", "數據未上傳"],
};

const productIssueFixedReplies = new Map([
  [
    "產品故障：小黑盤：數據未上傳",
    "先請確認\n1.app中是否為授權玩家\n2.儀表板中是否有上傳過住民名單",
  ],
]);

const rewardPlanReplies = new Map([
  ["詢問計畫範本", "請提供您的單位名稱與想確認的計畫年度，我們會協助提供品質獎勵計畫範本。"],
  ["品質獎勵計畫：詢問計畫範本", "請提供您的單位名稱與想確認的計畫年度，我們會協助提供品質獎勵計畫範本。"],
  ["計畫附件資格", "請提供您的單位名稱與附件項目，我們會協助確認是否符合計畫附件資格。"],
  ["品質獎勵計畫：計畫附件資格", "請提供您的單位名稱與附件項目，我們會協助確認是否符合計畫附件資格。"],
  ["計畫分母", "請提供您的單位名稱、計畫期間與想確認的指標，我們會協助確認計畫分母。"],
  ["品質獎勵計畫：計畫分母", "請提供您的單位名稱、計畫期間與想確認的指標，我們會協助確認計畫分母。"],
]);

const normalizeMessage = (message = "") =>
  String(message).trim().replace(/\s+/g, "").replace(/:/g, "：");

const findProductIssueReply = (message) => {
  const fixedReply = productIssueFixedReplies.get(message);

  if (fixedReply) {
    return fixedReply;
  }

  for (const [product, issues] of Object.entries(productIssueReplies)) {
    for (const issue of issues) {
      const exact = `產品故障：${product}：${issue}`;

      if (message === normalizeMessage(exact)) {
        return `已收到「${product}」的「${issue}」問題，請補充客戶名稱、單位名稱與目前狀況，我們會協助排查。`;
      }
    }
  }

  return "";
};

const resolveKeywordReply = (message) => {
  const normalized = normalizeMessage(message);
  const normalizedMenuReplies = new Map(
    [...menuReplies, ...rewardPlanReplies].map(([key, value]) => [
      normalizeMessage(key),
      value,
    ])
  );

  return normalizedMenuReplies.get(normalized) || findProductIssueReply(normalized);
};

const buildPrompt = ({ product, message }) => [
  {
    role: "system",
    content:
      "你是客服助理。請使用繁體中文回答，語氣清楚、簡潔、禮貌。若問題資訊不足，請請使用者補充客戶名稱、單位名稱、產品名稱、數量或問題狀況。不要自行編造政策或承諾。",
  },
  {
    role: "user",
    content: `產品或服務：${product || "客服系統"}\n使用者問題：${message}`,
  },
];

const askOpenAI = async ({ product, message }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: buildPrompt({ product, message }),
      temperature: 0.2,
    }),
  });

  const data = await openaiResponse.json();

  if (!openaiResponse.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  return data.choices?.[0]?.message?.content || "目前無法產生回覆，請稍後再試。";
};

const askOllama = async ({ product, message }) => {
  const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ollamaModel,
      messages: buildPrompt({ product, message }),
      stream: false,
    }),
  });

  const data = await ollamaResponse.json();

  if (!ollamaResponse.ok) {
    throw new Error(data?.error || "Ollama request failed");
  }

  return data?.message?.content || "目前無法產生回覆，請稍後再試。";
};

const askModel = async (payload) => {
  const keywordReply = resolveKeywordReply(payload.message);

  if (keywordReply) {
    return keywordReply;
  }

  if (modelProvider === "openai") {
    return askOpenAI(payload);
  }

  return askOllama(payload);
};

const pickField = (message, labels) => {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const label of labels) {
    const normalizedLabel = label.replace(/[：:]\s*$/, "");
    const match = lines.find((line) =>
      new RegExp(`^${normalizedLabel}\\s*[：:]\\s*(.+)$`).test(line)
    );

    if (match) {
      return match.replace(new RegExp(`^${normalizedLabel}\\s*[：:]\\s*`), "").trim();
    }
  }

  return "";
};

const parseOrderMessage = (message = "") => {
  const lines = String(message)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    customerName: pickField(message, ["客戶名稱", "您的名稱或單位名稱", "名稱", "單位名稱"]) || lines[0] || "",
    product: pickField(message, ["產品", "產品名稱", "耗材名稱"]) || lines[1] || "",
    quantity: pickField(message, ["數量"]) || lines[2] || "",
  };
};

const normalizeOrder = (body = {}) => {
  const parsed = parseOrderMessage(body.rawMessage || body.message || "");

  return {
    orderType: String(body.orderType || "").trim(),
    customerName: String(body.customerName || parsed.customerName || "").trim(),
    product: String(body.product || parsed.product || "").trim(),
    quantity: String(body.quantity || parsed.quantity || "").trim(),
  };
};

const getLineUserKey = (event) => {
  const source = event.source || {};

  return source.userId || source.groupId || source.roomId || "";
};

const validateOrder = (order) => {
  const missingFields = [];

  if (!["主產品訂單", "耗材訂單"].includes(order.orderType)) {
    missingFields.push("訂單類型");
  }

  if (!order.customerName) {
    missingFields.push("客戶名稱");
  }

  if (!order.product) {
    missingFields.push("產品");
  }

  if (!order.quantity) {
    missingFields.push("數量");
  }

  return missingFields;
};

const sendOrderToGoogle = async (order) => {
  if (!googleOrderWebhookUrl) {
    throw new Error("Missing GOOGLE_ORDER_WEBHOOK_URL");
  }

  const response = await fetch(googleOrderWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(order),
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Google order webhook failed (HTTP ${response.status})`);
  }

  return data;
};

const app = express();

// LINE Webhook
app.post("/webhook", middleware(lineConfig), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userMessage = event.message.text;
  const userKey = getLineUserKey(event);
  const normalizedMessage = normalizeMessage(userMessage);

  if (["訂單：主產品訂單", "主產品訂單", "訂單：耗材訂單", "耗材訂單"].includes(normalizedMessage)) {
    const orderType = normalizedMessage.includes("主產品") ? "主產品訂單" : "耗材訂單";

    if (userKey) {
      pendingLineOrders.set(userKey, orderType);
    }

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: orderInstructionReplies[orderType],
          quickReply: toQuickReply(quickReplyGroups.primary),
        },
      ],
    });
  }

  if (userKey && pendingLineOrders.has(userKey)) {
    const orderType = pendingLineOrders.get(userKey);
    const order = normalizeOrder({
      orderType,
      rawMessage: userMessage,
    });
    const missingFields = validateOrder(order);

    if (missingFields.length) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: `請補齊：${missingFields.join("、")}\n\n格式：\n客戶名稱：\n產品：\n數量：`,
          },
        ],
      });
    }

    try {
      await sendOrderToGoogle(order);
      pendingLineOrders.delete(userKey);

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: "已收到您的訂單，我們會盡快跟您聯繫。",
            quickReply: toQuickReply(quickReplyGroups.primary),
          },
        ],
      });
    } catch (error) {
      console.error(error);

      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: "訂單送出失敗，請稍後再試或聯繫客服人員。",
          },
        ],
      });
    }
  }

  const reply = await askModel({ message: userMessage });
  const quickReplyLabels = resolveQuickReplyLabels(userMessage);

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: reply,
        quickReply: toQuickReply(quickReplyLabels),
      },
    ],
  });
}

// API for web chat
app.post("/api/chat", express.json(), async (req, res) => {
  try {
    const body = req.body;
    const reply = await askModel(body);
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message || "API error" });
  }
});

app.post("/api/order", express.json(), async (req, res) => {
  try {
    const order = normalizeOrder(req.body);
    const missingFields = validateOrder(order);

    if (missingFields.length) {
      res.status(400).json({
        error: `請補齊：${missingFields.join("、")}`,
      });
      return;
    }

    const result = await sendOrderToGoogle(order);

    res.json({
      ok: true,
      reply: "已收到您的訂單，我們會盡快跟您聯繫。",
      result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Order API error" });
  }
});

// Serve static files
app.use(express.static(buildDir));

// Fallback to index.html for React Router
app.get("*", (req, res) => {
  const indexPath = path.join(buildDir, "index.html");
  res.sendFile(indexPath);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Customer service chatbot running at http://0.0.0.0:${port}`);
  console.log(`Model provider: ${modelProvider}`);

  if (modelProvider === "ollama") {
    console.log(`Ollama endpoint: ${ollamaBaseUrl}`);
    console.log(`Ollama model: ${ollamaModel}`);
  }
});
