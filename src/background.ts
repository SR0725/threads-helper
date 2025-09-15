import browser from "webextension-polyfill";

console.log("Hello from the background!");

// 硬編碼驗證碼 (在實際部署時可以通過其他方式配置)
const VERIFICATION_CODE = "250912";

browser.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed:", details);
});

// 處理來自 content script 的訊息
browser.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  if (request.action === 'verifyCode') {
    const isValid = request.code === VERIFICATION_CODE;
    
    if (isValid) {
      // 驗證成功，標記為付費用戶
      browser.storage.local.set({
        isPaidUser: true,
        verifiedAt: Date.now()
      });
    }
    
    return Promise.resolve({ success: isValid });
  }
  
  return Promise.resolve({ success: false });
});
