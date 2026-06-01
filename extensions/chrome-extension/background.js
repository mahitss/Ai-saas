const MENU_ID = "myai-send-selection";
const DEFAULT_APP_URL = "https://myai-phi.vercel.app";
const MAX_SELECTION_LENGTH = 4000;

function normalizeAppUrl(value) {
  try {
    const url = new URL(value || DEFAULT_APP_URL);
    if (!["https:", "http:"].includes(url.protocol)) return DEFAULT_APP_URL;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_APP_URL;
  }
}

function sanitizeSelection(value) {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, MAX_SELECTION_LENGTH);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Send to MyAI",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;

  const { appUrl } = await chrome.storage.sync.get(["appUrl"]);
  const baseUrl = normalizeAppUrl(appUrl);
  const selectedText = sanitizeSelection(info.selectionText);
  if (!selectedText) return;

  const target = new URL("/dashboard", baseUrl);
  target.searchParams.set("quickText", selectedText);
  await chrome.tabs.create({ url: target.toString() });
});
