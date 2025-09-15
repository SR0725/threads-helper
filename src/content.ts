import browser from "webextension-polyfill";
import { LikeThreshold, DEFAULT_THRESHOLDS } from "./types";

class ThreadsHelper {
  private thresholds: LikeThreshold[] = DEFAULT_THRESHOLDS;
  private observer: MutationObserver | null = null;
  private logoElement: HTMLElement | null = null;
  private modalElement: HTMLElement | null = null;
  private exportButtonElement: HTMLElement | null = null;
  private scraperModalElement: HTMLElement | null = null;
  private resultsModalElement: HTMLElement | null = null;
  private lastScrapedResults: string = "";
  private hasNewResults: boolean = false;
  private customSettings = {
    maxPosts: 100,
    maxScrolls: 20,
    minLikes: 0,
    minReposts: 0,
    minShares: 0,
    minReplies: 0
  };

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadSettings();
    await this.checkPaymentStatus();
    this.createObserver();
    this.processExistingPosts();
    this.createLogo();
    this.checkAndCreateExportButton();
    this.setupUrlChangeListener();
  }

  private async loadSettings() {
    try {
      const result = await browser.storage.sync.get(["thresholds"]);
      if (result.thresholds) {
        this.thresholds = result.thresholds;
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  private async checkPaymentStatus() {
    try {
      const result = await browser.storage.local.get([
        "isPaidUser",
        "logoRemoved",
      ]);
      // 如果已經是付費用戶或者Logo被移除了，就不創建Logo
      if (result.isPaidUser || result.logoRemoved) {
        return;
      }
    } catch (error) {
      console.error("Failed to check payment status:", error);
    }
  }

  private createObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let shouldCheckExportButton = false;

      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.querySelector?.('div[data-pressable-container="true"]')
              ) {
                shouldProcess = true;
              }
              // 檢查是否有頁面結構變化，可能是路由變更
              if (
                element.tagName === "DIV" ||
                element.tagName === "MAIN" ||
                element.tagName === "SECTION"
              ) {
                shouldCheckExportButton = true;
              }
            }
          });
        }
      });

      if (shouldProcess) {
        setTimeout(() => this.processExistingPosts(), 100);
      }

      if (shouldCheckExportButton) {
        // 延遲檢查，給頁面時間完全加載
        setTimeout(() => this.checkAndCreateExportButton(), 500);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 也監聽 popstate 事件（瀏覽器前進/後退）
    window.addEventListener("popstate", () => {
      setTimeout(() => this.checkAndCreateExportButton(), 300);
    });

    // 監聽 pushstate/replacestate（SPA 路由變更）
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      setTimeout(() => threadsHelperInstance.checkAndCreateExportButton(), 300);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      setTimeout(() => threadsHelperInstance.checkAndCreateExportButton(), 300);
    };
  }

  private setupUrlChangeListener() {
    let currentUrl = window.location.href;

    // 定期檢查 URL 變化 (作為備用方案)
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(() => this.checkAndCreateExportButton(), 300);
      }
    }, 1000);
  }

  private getPostTime(post: HTMLElement): Date | null {
    const timeElement = post.querySelector("time");
    if (timeElement) {
      const datetime = timeElement.getAttribute("datetime");
      return datetime ? new Date(datetime) : null;
    }
    return null;
  }

  private calculateHourlyGrowth(post: HTMLElement): number | string | null {
    const likeCount = this.getLikeCount(post);
    const postTime = this.getPostTime(post);

    if (!postTime || likeCount === 0) return null;

    const now = new Date();
    const hoursElapsed =
      (now.getTime() - postTime.getTime()) / (1000 * 60 * 60);

    // 如果文章太新（少於30分鐘），不顯示增長率
    if (hoursElapsed < 0.5) return null;

    // 如果超過24小時，顯示 "大於一天"
    if (hoursElapsed > 24) return ">1天";

    return Math.round(likeCount / hoursElapsed);
  }

  private processExistingPosts() {
    const posts = document.querySelectorAll(
      'div[data-pressable-container="true"]'
    );
    posts.forEach((post) => this.processPost(post as HTMLElement));
  }

  private processPost(post: HTMLElement) {
    if (post.dataset.threadsHelperProcessed) {
      return;
    }

    if (!this.isRootPost(post)) {
      return;
    }

    const likeCount = this.getLikeCount(post);
    const threshold = this.getThresholdForLikes(likeCount);
    const viralPrediction = this.checkViralPotential(post);

    if (threshold || viralPrediction) {
      this.addBookmarkButton(post, threshold, viralPrediction);
    }

    post.dataset.threadsHelperProcessed = "true";
  }

  private isRootPost(post: HTMLElement): boolean {
    return !!post.querySelector(
      'svg[aria-label="轉發"], svg[aria-label="Repost"], svg[aria-label="Share"]'
    );
  }

  private getLikeCount(post: HTMLElement): number {
    const labels = ["讚", "Like"];
    for (const label of labels) {
      const selectors = [
        `svg[aria-label="${label}"]`,
        `svg[aria-label="收回${label}"]`,
        `svg[aria-label="Un${label}"]`,
        `svg[aria-label="取消${label}"]`,
      ];

      const svg = post.querySelector(selectors.join(", "));
      if (svg) {
        const span = svg
          .closest('div[role="button"]')
          ?.querySelector("span span, span");
        if (span) {
          const text = span.textContent || "0";
          return parseInt(text.replace(/\D/g, ""), 10) || 0;
        }
      }
    }
    return 0;
  }

  private getThresholdForLikes(likeCount: number): LikeThreshold | null {
    for (const threshold of this.thresholds) {
      if (likeCount >= threshold.min && likeCount <= threshold.max) {
        return threshold;
      }
    }
    return null;
  }

  private checkViralPotential(post: HTMLElement): boolean {
    const likeCount = this.getLikeCount(post);
    const postTime = this.getPostTime(post);

    if (!postTime || likeCount >= 100) return false;

    const now = new Date();
    const minutesElapsed = (now.getTime() - postTime.getTime()) / (1000 * 60);

    // 檢查發文時間是否在 3 分鐘到 1 小時之間
    if (minutesElapsed < 3 || minutesElapsed > 60) return false;

    const hoursElapsed = minutesElapsed / 60;
    const hourlyGrowthRate = likeCount / hoursElapsed;

    // 每小時讚數增長率超過 60
    return hourlyGrowthRate >= 60;
  }

  private isDarkMode(): boolean {
    return document.documentElement.classList.contains("__fb-dark-mode");
  }

  private getThemeAdjustedColor(color: string): string {
    const isDark = this.isDarkMode();

    // 為深色模式調整顏色，使其更亮一些
    if (isDark) {
      const colorMap: { [key: string]: string } = {
        "#22C55E": "#34D399", // 更亮的綠色
        "#EAB308": "#FCD34D", // 更亮的黃色
        "#F97316": "#FB923C", // 更亮的橙色
        "#EF4444": "#F87171", // 更亮的紅色
      };
      return colorMap[color] || color;
    }

    return color;
  }

  private addBookmarkButton(
    post: HTMLElement,
    threshold: LikeThreshold | null,
    isViralPrediction: boolean = false
  ) {
    const existing = post.querySelector(".threads-helper-bookmark");
    if (existing) {
      existing.remove();
    }

    const hourlyGrowth = this.calculateHourlyGrowth(post);
    const hasGrowthData = hourlyGrowth !== null && hourlyGrowth !== 0;

    // 決定顏色和標記類型
    let buttonColor: string;
    let buttonText: string;

    if (isViralPrediction) {
      // 爆文預警：綠色
      const isDark = this.isDarkMode();
      buttonColor = isDark ? "#34D399" : "#22C55E";
      buttonText = "🚀";
    } else if (threshold) {
      // 一般門檻：使用設定的顏色
      buttonColor = this.getThemeAdjustedColor(threshold.color);
      buttonText = "";
    } else {
      return; // 沒有門檻也不是爆文預警，不顯示
    }

    const bookmarkBtn = document.createElement("div");
    bookmarkBtn.className = "threads-helper-bookmark";
    bookmarkBtn.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 24px;
      background: ${buttonColor};
      color: white;
      border-radius: 8px;
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding-left: 8px;
      padding-right: 8px;
      padding-top: 4px;
      padding-bottom: 4px;
      min-width: 24px;
      height: auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: all 0.2s ease;
      line-height: 1;
      text-align: center;
    `;

    const growthDisplay = hasGrowthData
      ? `<div style="font-size: 8px; opacity: 0.9; margin-top: 2px;">+${hourlyGrowth}${
          typeof hourlyGrowth === "number" ? "/h" : ""
        }</div>`
      : "";

    bookmarkBtn.innerHTML = `
      <div>${buttonText}</div>
      ${growthDisplay}
    `;

    // 為爆文預警添加額外的視覺效果
    if (isViralPrediction) {
      bookmarkBtn.style.animation = "pulse 2s infinite";
      bookmarkBtn.style.border = "2px solid rgba(255,255,255,0.3)";

      // 添加 CSS 動畫
      if (!document.querySelector("#threads-helper-style")) {
        const style = document.createElement("style");
        style.id = "threads-helper-style";
        style.textContent = `
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    post.style.position = "relative";
    post.appendChild(bookmarkBtn);
  }

  private async createLogo() {
    if (this.logoElement) return;

    // 檢查付費狀態
    const result = await browser.storage.local.get([
      "isPaidUser",
      "logoRemoved",
    ]);
    if (result.isPaidUser || result.logoRemoved) {
      return; // 不創建Logo
    }

    const logo = document.createElement("div");
    logo.className = "threads-helper-logo";
    logo.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          width: 24px;
          height: 24px;
          background: linear-gradient(45deg, #22C55E, #3B82F6);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        ">⚡</div>
        <span style="
          font-size: 13px;
          font-weight: 600;
          color: inherit;
        ">Threads 爆文偵測器</span>
      </div>
    `;

    const isDark = this.isDarkMode();
    logo.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${
        isDark ? "rgba(38, 38, 38, 0.95)" : "rgba(255, 255, 255, 0.95)"
      };
      color: ${isDark ? "#ffffff" : "#000000"};
      border-radius: 12px;
      box-shadow: 0 4px 20px ${
        isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"
      };
      backdrop-filter: blur(10px);
      border: 1px solid ${
        isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
      };
      z-index: 10000;
      cursor: pointer;
      transition: all 0.3s ease;
      user-select: none;
    `;

    // 整個 Logo 點擊就開啟 Modal
    logo.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showSponsorModal();
    });

    document.body.appendChild(logo);
    this.logoElement = logo;

    // 添加懸停效果
    logo.addEventListener("mouseenter", () => {
      logo.style.transform = "translateY(-2px)";
      logo.style.boxShadow = `0 8px 30px ${
        isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.15)"
      }`;
    });

    logo.addEventListener("mouseleave", () => {
      logo.style.transform = "translateY(0)";
      logo.style.boxShadow = `0 4px 20px ${
        isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"
      }`;
    });
  }

  private showSponsorModal() {
    if (this.modalElement) {
      // 如果 modal 已存在，先移除再重新創建
      this.modalElement.remove();
      this.modalElement = null;
    }

    const modal = document.createElement("div");
    modal.className = "threads-helper-modal";

    const isDark = this.isDarkMode();
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      backdrop-filter: blur(5px);
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: ${isDark ? "#262626" : "#ffffff"};
        color: ${isDark ? "#ffffff" : "#000000"};
        border-radius: 20px;
        padding: 32px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
      ">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="
            width: 60px;
            height: 60px;
            background: linear-gradient(45deg, #22C55E, #3B82F6);
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin: 0 auto 16px;
          ">⚡</div>
          <h2 style="
            margin: 0 0 8px 0;
            font-size: 24px;
            font-weight: 700;
            background: linear-gradient(45deg, #22C55E, #3B82F6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          ">Threads 爆文偵測器</h2>
          <p style="
            margin: 0;
            font-size: 16px;
            opacity: 0.8;
            line-height: 1.5;
          ">感謝使用我們的擴充功能！</p>
        </div>


        <div style="
          background: ${
            isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"
          };
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        ">
          <h3 style="
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            color: white;
          ">
            <span style="font-size: 20px;">🧵</span>
            追蹤我的 Threads
          </h3>
          <p style="
            margin: 0 0 16px 0;
            font-size: 14px;
            line-height: 1.5;
            opacity: 0.8;
          ">獲取最新功能更新和開發進度！</p>
          <a href="https://www.threads.net/@ray.realms" target="_blank" class="threads-link" style="
            display: block;
            width: 100%;
            padding: 12px;
            background: ${isDark ? "#ffffff" : "#000000"};
            color: ${isDark ? "#000000" : "#ffffff"};
            text-decoration: none;
            border-radius: 12px;
            text-align: center;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            🧵 追蹤 @ray.realms
          </a>
        </div>

        <!-- Verification Code Input (hidden by default) -->
        <div class="verification-section" style="
          display: none;
          background: ${
            isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"
          };
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        ">
          <h3 style="
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
          ">
            <span style="font-size: 20px;">🔐</span>
            驗證付款
          </h3>
          <p style="
            margin: 0 0 16px 0;
            font-size: 14px;
            line-height: 1.5;
            opacity: 0.8;
          ">請輸入付款後獲得的 6 位數字驗證碼：</p>
          
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            ${Array.from(
              { length: 6 },
              (_, i) => `
              <input 
                type="text" 
                class="verification-digit" 
                data-index="${i}"
                maxlength="1" 
                style="
                  width: 40px;
                  height: 40px;
                  text-align: center;
                  font-size: 18px;
                  font-weight: 700;
                  border: 2px solid ${
                    isDark ? "rgba(255, 255, 255, 0.2)" : "#e5e5e5"
                  };
                  border-radius: 8px;
                  background: ${
                    isDark ? "rgba(255, 255, 255, 0.1)" : "#ffffff"
                  };
                  color: inherit;
                  outline: none;
                  transition: all 0.2s ease;
                "
              />
            `
            ).join("")}
          </div>
          
          <div class="verification-status" style="
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            font-size: 14px;
            font-weight: 600;
            display: none;
          "></div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button class="modal-later-btn" style="
            flex: 1;
            padding: 12px;
            background: ${
              isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
            };
            color: inherit;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            之後再說
          </button>
          <button class="modal-close-btn" style="
            flex: 1;
            padding: 12px;
            background: #EF4444;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            移除右上角 Logo
          </button>
        </div>
        
        <div style="text-align: center; margin-top: 16px;">
          <button class="show-verification-btn" style="
            background: none;
            border: none;
            color: ${
              isDark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"
            };
            cursor: pointer;
            font-size: 12px;
            text-decoration: underline;
            transition: opacity 0.2s ease;
          ">
            已付款？輸入驗證碼
          </button>
        </div>
      </div>
    `;

    // 添加 CSS 動畫
    if (!document.querySelector("#threads-helper-modal-style")) {
      const style = document.createElement("style");
      style.id = "threads-helper-modal-style";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { 
            opacity: 0; 
            transform: translateY(-20px) scale(0.95); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0) scale(1); 
          }
        }
      `;
      document.head.appendChild(style);
    }

    // 點擊背景關閉
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        this.modalElement = null;
      }
    });

    document.body.appendChild(modal);
    this.modalElement = modal;

    // 添加事件監聽器
    const coffeeLink = modal.querySelector(".coffee-link") as HTMLElement;
    if (coffeeLink) {
      coffeeLink.addEventListener("mouseenter", () => {
        coffeeLink.style.transform = "translateY(-2px)";
        coffeeLink.style.boxShadow = "0 8px 20px rgba(255,221,0,0.3)";
      });
      coffeeLink.addEventListener("mouseleave", () => {
        coffeeLink.style.transform = "translateY(0)";
        coffeeLink.style.boxShadow = "none";
      });
    }

    const threadsLink = modal.querySelector(".threads-link") as HTMLElement;
    if (threadsLink) {
      threadsLink.addEventListener("mouseenter", () => {
        threadsLink.style.transform = "translateY(-2px)";
        threadsLink.style.boxShadow = "0 8px 20px rgba(0,0,0,0.2)";
      });
      threadsLink.addEventListener("mouseleave", () => {
        threadsLink.style.transform = "translateY(0)";
        threadsLink.style.boxShadow = "none";
      });
    }

    const laterBtn = modal.querySelector(".modal-later-btn") as HTMLElement;
    if (laterBtn) {
      laterBtn.addEventListener("click", () => {
        modal.remove();
        this.modalElement = null;
      });
      laterBtn.addEventListener("mouseenter", () => {
        laterBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(0, 0, 0, 0.2)";
      });
      laterBtn.addEventListener("mouseleave", () => {
        laterBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.1)";
      });
    }

    const closeBtn = modal.querySelector(".modal-close-btn") as HTMLElement;
    if (closeBtn) {
      closeBtn.addEventListener("click", async () => {
        // 只跳轉到贊助頁面，不刪除 Logo
        window.open("https://buymeacoffee.com/ray948787o/e/456549", "_blank");

        modal.remove();
        this.modalElement = null;
      });
      closeBtn.addEventListener("mouseenter", () => {
        closeBtn.style.background = "#DC2626";
        closeBtn.style.transform = "translateY(-1px)";
      });
      closeBtn.addEventListener("mouseleave", () => {
        closeBtn.style.background = "#EF4444";
        closeBtn.style.transform = "translateY(0)";
      });
    }

    // 顯示驗證碼輸入區域
    const showVerificationBtn = modal.querySelector(".show-verification-btn") as HTMLElement;
    if (showVerificationBtn) {
      showVerificationBtn.addEventListener("click", () => {
        const verificationSection = modal.querySelector(
          ".verification-section"
        ) as HTMLElement;
        if (verificationSection) {
          verificationSection.style.display = "block";
          showVerificationBtn.style.display = "none";
          // 焦點到第一個輸入框
          const firstInput = modal.querySelector(
            ".verification-digit"
          ) as HTMLInputElement;
          if (firstInput) firstInput.focus();
        }
      });
    }

    // 驗證碼輸入邏輯
    const digitInputs = modal.querySelectorAll(
      ".verification-digit"
    ) as NodeListOf<HTMLInputElement>;
    digitInputs.forEach((input, index) => {
      input.addEventListener("input", (e) => {
        const target = e.target as HTMLInputElement;
        const value = target.value.replace(/[^0-9]/g, "");
        target.value = value;

        // 自動跳到下一個輸入框
        if (value && index < digitInputs.length - 1) {
          digitInputs[index + 1].focus();
        }

        // 檢查是否輸入完成
        this.checkVerificationCode(modal, digitInputs);
      });

      input.addEventListener("keydown", (e) => {
        // 退格鍵跳到上一個輸入框
        if (e.key === "Backspace" && !input.value && index > 0) {
          digitInputs[index - 1].focus();
        }
      });

      input.addEventListener("focus", () => {
        input.style.borderColor = "#22C55E";
      });

      input.addEventListener("blur", () => {
        input.style.borderColor = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "#e5e5e5";
      });
    });
  }

  private async checkVerificationCode(
    modal: HTMLElement,
    inputs: NodeListOf<HTMLInputElement>
  ) {
    const code = Array.from(inputs)
      .map((input) => input.value)
      .join("");
    const statusDiv = modal.querySelector(
      ".verification-status"
    ) as HTMLElement;

    if (code.length === 6) {
      // 向 background script 發送驗證請求
      const response = await browser.runtime.sendMessage({
        action: "verifyCode",
        code: code,
      });

      statusDiv.style.display = "block";

      if (response.success) {
        statusDiv.style.background = "rgba(34, 197, 94, 0.2)";
        statusDiv.style.color = "#22C55E";
        statusDiv.textContent = "✅ 驗證成功！Logo 已永久移除";

        // 移除 Logo 並關閉 Modal
        setTimeout(() => {
          modal.remove();
          this.modalElement = null;
          if (this.logoElement) {
            this.logoElement.remove();
            this.logoElement = null;
            // 更新輸出按鈕位置到 Logo 原位置
            this.updateExportButtonPosition();
          }
        }, 2000);
      } else {
        statusDiv.style.background = "rgba(239, 68, 68, 0.2)";
        statusDiv.style.color = "#EF4444";
        statusDiv.textContent = "❌ 驗證碼錯誤，請重新輸入";

        // 清空輸入框
        inputs.forEach((input) => {
          input.value = "";
          input.style.borderColor = "#EF4444";
        });
        inputs[0].focus();

        setTimeout(() => {
          statusDiv.style.display = "none";
          inputs.forEach((input) => {
            input.style.borderColor = modal.classList.contains("__fb-dark-mode")
              ? "rgba(255, 255, 255, 0.2)"
              : "#e5e5e5";
          });
        }, 3000);
      }
    } else if (code.length > 0) {
      statusDiv.style.display = "none";
    }
  }

  private isOnProfilePage(): boolean {
    const currentUrl = window.location.href;
    return (
      currentUrl.includes("threads.com") &&
      !!currentUrl.match(/threads\.com\/[^\/]+$/) &&
      !currentUrl.includes("/post/")
    );
  }

  private async checkAndCreateExportButton() {
    const isOnProfile = this.isOnProfilePage();

    if (isOnProfile && !this.exportButtonElement) {
      // 在個人檔案頁面且還沒有按鈕 - 創建按鈕
      await this.createExportButton();
    } else if (!isOnProfile && this.exportButtonElement) {
      // 不在個人檔案頁面但有按鈕 - 移除按鈕
      this.exportButtonElement.remove();
      this.exportButtonElement = null;
    } else if (isOnProfile && this.exportButtonElement) {
      // 在個人檔案頁面且已有按鈕 - 確保位置正確
      this.updateExportButtonPosition();
    }
  }

  private async createExportButton() {
    if (this.exportButtonElement) return;

    const exportBtn = document.createElement("div");
    exportBtn.className = "threads-helper-export-btn";

    const isDark = this.isDarkMode();

    // 如果沒有 Logo（付款後），則頂替其位置；否則在其下方
    const topPosition = this.logoElement ? "80px" : "20px";

    exportBtn.style.cssText = `
      position: fixed;
      top: ${topPosition};
      right: 20px;
      background: ${
        isDark ? "rgba(38, 38, 38, 0.95)" : "rgba(255, 255, 255, 0.95)"
      };
      color: ${isDark ? "#ffffff" : "#000000"};
      border-radius: 12px;
      box-shadow: 0 4px 20px ${
        isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"
      };
      backdrop-filter: blur(10px);
      border: 1px solid ${
        isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
      };
      z-index: 10000;
      cursor: pointer;
      transition: all 0.3s ease;
      user-select: none;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
    `;

    exportBtn.innerHTML = `
      <div class="notification-dot" style="
        position: absolute;
        top: -4px;
        right: -4px;
        width: 8px;
        height: 8px;
        background: #EF4444;
        border-radius: 50%;
        border: 2px solid ${isDark ? "#262626" : "#ffffff"};
        display: ${this.hasNewResults ? "block" : "none"};
        animation: pulse 1.5s infinite;
      "></div>
      <span>輸出文章</span>
    `;

    exportBtn.addEventListener("click", () => {
      if (this.hasNewResults && this.lastScrapedResults) {
        this.showResultsModal();
      } else {
        this.showScraperModal();
      }
    });

    exportBtn.addEventListener("mouseenter", () => {
      exportBtn.style.transform = "translateY(-2px)";
      exportBtn.style.boxShadow = `0 8px 30px ${
        isDark ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.15)"
      }`;
    });

    exportBtn.addEventListener("mouseleave", () => {
      exportBtn.style.transform = "translateY(0)";
      exportBtn.style.boxShadow = `0 4px 20px ${
        isDark ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.1)"
      }`;
    });

    document.body.appendChild(exportBtn);
    this.exportButtonElement = exportBtn;
  }

  private updateExportButtonPosition() {
    if (this.exportButtonElement) {
      const topPosition = this.logoElement ? "80px" : "20px";
      this.exportButtonElement.style.top = topPosition;
    }
  }

  private updateExportButtonNotification() {
    if (this.exportButtonElement) {
      const notificationDot = this.exportButtonElement.querySelector(
        ".notification-dot"
      ) as HTMLElement;
      if (notificationDot) {
        notificationDot.style.display = this.hasNewResults ? "block" : "none";
      }

      if (this.hasNewResults) {
        this.exportButtonElement.style.animation = "bounce 0.5s ease-in-out 3";
      }
    }
  }

  private showResultsModal() {
    if (this.resultsModalElement) return;
    
    // 確保其他 modal 已關閉
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }
    if (this.scraperModalElement) {
      this.scraperModalElement.remove();
      this.scraperModalElement = null;
    }

    const modal = document.createElement("div");
    modal.className = "threads-helper-results-modal";

    const isDark = this.isDarkMode();
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10003;
      backdrop-filter: blur(5px);
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: ${isDark ? "#262626" : "#ffffff"};
        color: ${isDark ? "#ffffff" : "#000000"};
        border-radius: 20px;
        padding: 32px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
      ">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="
            width: 60px;
            height: 60px;
            background: linear-gradient(45deg, #22C55E, #3B82F6);
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin: 0 auto 16px;
          ">📁</div>
          <h2 style="
            margin: 0 0 8px 0;
            font-size: 24px;
            font-weight: 700;
            color: inherit;
          ">爬取結果</h2>
          <p style="
            margin: 0;
            font-size: 16px;
            opacity: 0.8;
            line-height: 1.5;
          ">爬取完成！選擇您想要的操作</p>
        </div>

        <div style="
          flex: 1;
          overflow-y: auto;
          margin-bottom: 24px;
          max-height: 300px;
        ">
          <textarea
            readonly
            style="
              width: 100%;
              height: 100%;
              min-height: 200px;
              padding: 16px;
              border: 2px solid ${
                isDark ? "rgba(255, 255, 255, 0.2)" : "#e5e5e5"
              };
              border-radius: 12px;
              font-size: 12px;
              font-family: 'SF Mono', Consolas, monospace;
              resize: vertical;
              line-height: 1.5;
              background: ${isDark ? "rgba(255, 255, 255, 0.05)" : "#fafafa"};
              color: inherit;
              outline: none;
            "
          >${this.lastScrapedResults}</textarea>
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="results-copy-btn" style="
            flex: 1;
            min-width: 120px;
            padding: 12px 16px;
            background: #22C55E;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            📋 複製
          </button>
          <button class="results-download-btn" style="
            flex: 1;
            min-width: 120px;
            padding: 12px 16px;
            background: #3B82F6;
            color: #ffffff;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            📥 下載
          </button>
          <button class="results-rescrape-btn" style="
            flex: 1;
            min-width: 120px;
            padding: 12px 16px;
            background: ${
              isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
            };
            color: inherit;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            🔄 重新爬取
          </button>
        </div>
      </div>
    `;

    // 點擊背景關閉
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        this.resultsModalElement = null;
        this.hasNewResults = false;
        this.updateExportButtonNotification();
      }
    });

    document.body.appendChild(modal);
    this.resultsModalElement = modal;

    // 添加事件監聽器
    const copyBtn = modal.querySelector(".results-copy-btn") as HTMLElement;
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(this.lastScrapedResults);
        copyBtn.textContent = "✅ 已複製";
        setTimeout(() => {
          copyBtn.textContent = "📋 複製";
        }, 2000);
      });

      copyBtn.addEventListener("mouseenter", () => {
        copyBtn.style.transform = "translateY(-2px)";
        copyBtn.style.boxShadow = "0 4px 12px rgba(34, 197, 94, 0.3)";
      });

      copyBtn.addEventListener("mouseleave", () => {
        copyBtn.style.transform = "translateY(0)";
        copyBtn.style.boxShadow = "none";
      });
    }

    const downloadBtn = modal.querySelector(
      ".results-download-btn"
    ) as HTMLElement;
    if (downloadBtn) {
      downloadBtn.addEventListener("click", () => {
        this.downloadResult(this.lastScrapedResults);
        downloadBtn.textContent = "✅ 已下載";
        setTimeout(() => {
          downloadBtn.textContent = "📥 下載";
        }, 2000);
      });

      downloadBtn.addEventListener("mouseenter", () => {
        downloadBtn.style.transform = "translateY(-2px)";
        downloadBtn.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.3)";
      });

      downloadBtn.addEventListener("mouseleave", () => {
        downloadBtn.style.transform = "translateY(0)";
        downloadBtn.style.boxShadow = "none";
      });
    }

    const rescrapeBtn = modal.querySelector(
      ".results-rescrape-btn"
    ) as HTMLElement;
    if (rescrapeBtn) {
      rescrapeBtn.addEventListener("click", () => {
        modal.remove();
        this.resultsModalElement = null;
        this.hasNewResults = false;
        this.updateExportButtonNotification();
        this.showScraperModal();
      });

      rescrapeBtn.addEventListener("mouseenter", () => {
        rescrapeBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(0, 0, 0, 0.2)";
        rescrapeBtn.style.transform = "translateY(-2px)";
      });

      rescrapeBtn.addEventListener("mouseleave", () => {
        rescrapeBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.1)";
        rescrapeBtn.style.transform = "translateY(0)";
      });
    }
  }

  private showScraperModal() {
    if (this.scraperModalElement) return;
    
    // 確保其他 modal 已關閉
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }
    if (this.resultsModalElement) {
      this.resultsModalElement.remove();
      this.resultsModalElement = null;
    }

    const modal = document.createElement("div");
    modal.className = "threads-helper-scraper-modal";

    const isDark = this.isDarkMode();
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      backdrop-filter: blur(5px);
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: ${isDark ? "#262626" : "#ffffff"};
        color: ${isDark ? "#ffffff" : "#000000"};
        border-radius: 20px;
        padding: 32px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
      ">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="
            width: 60px;
            height: 60px;
            background: linear-gradient(45deg, #22C55E, #3B82F6);
            border-radius: 15px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin: 0 auto 16px;
          ">📁</div>
          <h2 style="
            margin: 0 0 8px 0;
            font-size: 24px;
            font-weight: 700;
            color: inherit;
          ">文章輸出設定</h2>
          <p style="
            margin: 0;
            font-size: 16px;
            opacity: 0.8;
            line-height: 1.5;
          ">選擇輸出模式並開始爬取</p>
        </div>

        <!-- Preset Selection -->
        <div style="margin-bottom: 24px;">
          <h3 style="
            margin: 0 0 16px 0;
            font-size: 18px;
            font-weight: 700;
            color: inherit;
          ">爬取模式</h3>
          
          <div class="preset-options" style="display: grid; gap: 12px;">
            <div class="preset-option" data-preset="quick" style="
              padding: 16px 20px;
              background: ${
                isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)"
              };
              border: 2px solid ${
                isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"
              };
              border-radius: 16px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">快速爬取 (50篇)</div>
              <div style="font-size: 14px; opacity: 0.8;">文章: 50　滾動: 10</div>
            </div>
            
            <div class="preset-option selected" data-preset="standard" style="
              padding: 16px 20px;
              background: ${isDark ? "#ffffff" : "#000000"};
              color: ${isDark ? "#000000" : "#ffffff"};
              border: 2px solid ${isDark ? "#ffffff" : "#000000"};
              border-radius: 16px;
              cursor: pointer;
              transition: all 0.2s ease;
              transform: scale(1.02);
            ">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">標準爬取 (100篇)</div>
              <div style="font-size: 14px; opacity: 0.8;">文章: 100　滾動: 20</div>
            </div>
            
            <div class="preset-option" data-preset="deep" style="
              padding: 16px 20px;
              background: ${
                isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)"
              };
              border: 2px solid ${
                isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"
              };
              border-radius: 16px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">深度爬取 (無限制)</div>
              <div style="font-size: 14px; opacity: 0.8;">直接爬取所有文章（這是一項危險的操作）</div>
            </div>
            
            <div class="preset-option" data-preset="popular" style="
              padding: 16px 20px;
              background: ${
                isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)"
              };
              border: 2px solid ${
                isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"
              };
              border-radius: 16px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">熱門文章 (讚數≥10)</div>
              <div style="font-size: 14px; opacity: 0.8;">文章: 100　滾動: 20　讚數≥10</div>
            </div>
            
            <div class="preset-option" data-preset="custom" style="
              padding: 16px 20px;
              background: ${
                isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"
              };
              border: 2px dashed ${
                isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)"
              };
              border-radius: 16px;
              cursor: pointer;
              transition: all 0.2s ease;
            ">
              <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">自訂設定</div>
              <div style="font-size: 14px; opacity: 0.8;">完全客製化的爬取參數</div>
            </div>
          </div>
        </div>

        <!-- Custom Settings (hidden by default) -->
        <div class="custom-settings-section" style="
          display: none;
          background: ${
            isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"
          };
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 24px;
        ">
          <h4 style="
            margin: 0 0 20px 0;
            font-size: 18px;
            font-weight: 700;
            color: inherit;
          ">自訂參數</h4>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label style="
                font-size: 14px;
                color: ${isDark ? 'rgba(255, 255, 255, 0.8)' : '#666666'};
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
              ">最大貼文數</label>
              <input
                type="number"
                class="custom-max-posts"
                value="${this.customSettings.maxPosts}"
                style="
                  width: 100%;
                  padding: 12px;
                  border: 2px solid ${isDark ? 'rgba(255, 255, 255, 0.2)' : '#e5e5e5'};
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  outline: none;
                  transition: all 0.2s ease;
                  background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff'};
                  color: inherit;
                "
              />
            </div>
            <div>
              <label style="
                font-size: 14px;
                color: ${isDark ? 'rgba(255, 255, 255, 0.8)' : '#666666'};
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
              ">最大滾動次數</label>
              <input
                type="number"
                class="custom-max-scrolls"
                value="${this.customSettings.maxScrolls}"
                style="
                  width: 100%;
                  padding: 12px;
                  border: 2px solid ${isDark ? 'rgba(255, 255, 255, 0.2)' : '#e5e5e5'};
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  outline: none;
                  transition: all 0.2s ease;
                  background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff'};
                  color: inherit;
                "
              />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <label style="
                font-size: 14px;
                color: ${isDark ? 'rgba(255, 255, 255, 0.8)' : '#666666'};
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
              ">最低讚數</label>
              <input
                type="number"
                class="custom-min-likes"
                value="${this.customSettings.minLikes}"
                style="
                  width: 100%;
                  padding: 12px;
                  border: 2px solid ${isDark ? 'rgba(255, 255, 255, 0.2)' : '#e5e5e5'};
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  outline: none;
                  transition: all 0.2s ease;
                  background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff'};
                  color: inherit;
                "
              />
            </div>
            <div>
              <label style="
                font-size: 14px;
                color: ${isDark ? 'rgba(255, 255, 255, 0.8)' : '#666666'};
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
              ">最低回覆數</label>
              <input
                type="number"
                class="custom-min-replies"
                value="${this.customSettings.minReplies}"
                style="
                  width: 100%;
                  padding: 12px;
                  border: 2px solid ${isDark ? 'rgba(255, 255, 255, 0.2)' : '#e5e5e5'};
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  outline: none;
                  transition: all 0.2s ease;
                  background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#ffffff'};
                  color: inherit;
                "
              />
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 12px;">
          <button class="scraper-cancel-btn" style="
            flex: 1;
            padding: 16px;
            background: ${
              isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
            };
            color: inherit;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            取消
          </button>
          <button class="scraper-start-btn" style="
            flex: 1;
            padding: 16px;
            background: #22C55E;
            color: #ffffff;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 700;
            transition: all 0.2s ease;
          ">
            🚀 開始爬取
          </button>
        </div>
      </div>
    `;

    // 點擊背景關閉
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
        this.scraperModalElement = null;
      }
    });

    document.body.appendChild(modal);
    this.scraperModalElement = modal;

    // 添加事件監聽器
    let selectedPreset = "standard";

    // 預設選項事件
    const presetOptions = modal.querySelectorAll(".preset-option");
    presetOptions.forEach((option) => {
      option.addEventListener("click", () => {
        // 移除其他選中狀態
        presetOptions.forEach((opt) => {
          opt.classList.remove("selected");
          (opt as HTMLElement).style.background = isDark
            ? "rgba(255, 255, 255, 0.1)"
            : "rgba(0, 0, 0, 0.05)";
          (opt as HTMLElement).style.color = isDark ? "#ffffff" : "#000000";
          (opt as HTMLElement).style.border = `2px solid ${
            isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"
          }`;
          (opt as HTMLElement).style.transform = "scale(1)";
        });

        // 添加選中狀態
        option.classList.add("selected");
        (option as HTMLElement).style.background = isDark
          ? "#ffffff"
          : "#000000";
        (option as HTMLElement).style.color = isDark ? "#000000" : "#ffffff";
        (option as HTMLElement).style.border = `2px solid ${
          isDark ? "#ffffff" : "#000000"
        }`;
        (option as HTMLElement).style.transform = "scale(1.02)";

        selectedPreset = option.getAttribute("data-preset") || "standard";
        
        // 顯示/隱藏自訂設定區域
        const customSection = modal.querySelector('.custom-settings-section') as HTMLElement;
        if (customSection) {
          customSection.style.display = selectedPreset === 'custom' ? 'block' : 'none';
        }
      });

      option.addEventListener("mouseenter", () => {
        if (!option.classList.contains("selected")) {
          (option as HTMLElement).style.borderColor = isDark
            ? "#ffffff"
            : "#000000";
          (option as HTMLElement).style.transform = "scale(1.01)";
        }
      });

      option.addEventListener("mouseleave", () => {
        if (!option.classList.contains("selected")) {
          (option as HTMLElement).style.borderColor = isDark
            ? "rgba(255, 255, 255, 0.2)"
            : "rgba(0, 0, 0, 0.1)";
          (option as HTMLElement).style.transform = "scale(1)";
        }
      });
    });

    // 自訂設定輸入框事件
    const customInputs = {
      maxPosts: modal.querySelector('.custom-max-posts') as HTMLInputElement,
      maxScrolls: modal.querySelector('.custom-max-scrolls') as HTMLInputElement,
      minLikes: modal.querySelector('.custom-min-likes') as HTMLInputElement,
      minReplies: modal.querySelector('.custom-min-replies') as HTMLInputElement,
    };

    Object.entries(customInputs).forEach(([key, input]) => {
      if (input) {
        input.addEventListener('input', (e) => {
          const value = parseInt((e.target as HTMLInputElement).value) || 0;
          this.customSettings[key as keyof typeof this.customSettings] = value;
        });

        input.addEventListener('focus', () => {
          input.style.borderColor = '#22C55E';
        });

        input.addEventListener('blur', () => {
          input.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.2)' : '#e5e5e5';
        });
      }
    });

    // 取消按鈕
    const cancelBtn = modal.querySelector(".scraper-cancel-btn") as HTMLElement;
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        modal.remove();
        this.scraperModalElement = null;
      });

      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(0, 0, 0, 0.2)";
      });

      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.1)";
      });
    }

    // 開始按鈕
    const startBtn = modal.querySelector(".scraper-start-btn") as HTMLElement;
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        modal.remove();
        this.scraperModalElement = null;
        this.showWarningModal(selectedPreset);
      });

      startBtn.addEventListener("mouseenter", () => {
        startBtn.style.transform = "translateY(-2px)";
        startBtn.style.boxShadow = "0 8px 20px rgba(34, 197, 94, 0.3)";
      });

      startBtn.addEventListener("mouseleave", () => {
        startBtn.style.transform = "translateY(0)";
        startBtn.style.boxShadow = "none";
      });
    }
  }

  private showWarningModal(preset: string) {
    const modal = document.createElement("div");
    modal.className = "threads-helper-warning-modal";

    const isDark = this.isDarkMode();
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10002;
      backdrop-filter: blur(5px);
      animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
      <div style="
        background: ${isDark ? "#262626" : "#ffffff"};
        color: ${isDark ? "#ffffff" : "#000000"};
        border-radius: 20px;
        padding: 32px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
      ">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="
            font-size: 48px;
            margin-bottom: 16px;
          ">
            ⚠️
          </div>
          <h3 style="
            margin: 0 0 16px 0;
            font-size: 20px;
            font-weight: 700;
            color: inherit;
          ">
            重要提醒
          </h3>
        </div>
        
        <div style="
          background: ${isDark ? "rgba(255, 196, 77, 0.2)" : "#fff3cd"};
          border: 2px solid ${isDark ? "rgba(255, 196, 77, 0.4)" : "#ffeaa7"};
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        ">
          <p style="
            margin: 0 0 12px 0;
            font-size: 14px;
            color: ${isDark ? "#FCD34D" : "#856404"};
            font-weight: 600;
            line-height: 1.4;
          ">
            此功能屬於一種被 Threads 可能禁止的行為
          </p>
          <p style="
            margin: 0;
            font-size: 14px;
            color: ${isDark ? "#FCD34D" : "#856404"};
            line-height: 1.4;
          ">
            • 請勿使用於其他人身上<br/>
            • 該功能只建議用來小量的爬取自己的文章<br/>
            • 過度使用可能導致帳號被限制
          </p>
        </div>
        
        <div style="display: flex; gap: 12px;">
          <button class="warning-cancel-btn" style="
            flex: 1;
            padding: 12px 20px;
            background: ${
              isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"
            };
            color: inherit;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            取消
          </button>
          <button class="warning-confirm-btn" style="
            flex: 1;
            padding: 12px 20px;
            background: #DC2626;
            color: #ffffff;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
          ">
            我了解，繼續
          </button>
        </div>
      </div>
    `;

    // 點擊背景關閉
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);

    // 取消按鈕
    const cancelBtn = modal.querySelector(".warning-cancel-btn") as HTMLElement;
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        modal.remove();
      });

      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.2)"
          : "rgba(0, 0, 0, 0.2)";
      });

      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.background = isDark
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.1)";
      });
    }

    // 確認按鈕
    const confirmBtn = modal.querySelector(
      ".warning-confirm-btn"
    ) as HTMLElement;
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        modal.remove();
        this.startScraping(preset);
      });

      confirmBtn.addEventListener("mouseenter", () => {
        confirmBtn.style.background = "#B91C1C";
        confirmBtn.style.transform = "translateY(-1px)";
      });

      confirmBtn.addEventListener("mouseleave", () => {
        confirmBtn.style.background = "#DC2626";
        confirmBtn.style.transform = "translateY(0)";
      });
    }
  }

  private async startScraping(preset: string = "standard") {
    // 根據預設選項設定參數
    const presetSettings = {
      quick: {
        maxPosts: 50,
        maxScrolls: 10,
        minLikes: 0,
        minReposts: 0,
        minShares: 0,
        minReplies: 0,
      },
      standard: {
        maxPosts: 100,
        maxScrolls: 20,
        minLikes: 0,
        minReposts: 0,
        minShares: 0,
        minReplies: 0,
      },
      deep: {
        maxPosts: 999999,
        maxScrolls: 999999,
        minLikes: 0,
        minReposts: 0,
        minShares: 0,
        minReplies: 0,
      },
      popular: {
        maxPosts: 100,
        maxScrolls: 20,
        minLikes: 10,
        minReposts: 0,
        minShares: 0,
        minReplies: 0,
      },
      custom: this.customSettings,
    };

    const settings =
      presetSettings[preset as keyof typeof presetSettings] ||
      presetSettings.standard;

    try {
      const result = await this.performScraping(settings);
      // 保存結果並顯示通知
      this.lastScrapedResults = result;
      this.hasNewResults = true;
      this.updateExportButtonNotification();
      this.showResultsModal();
    } catch (error) {
      console.error("Scraping failed:", error);
    }
  }

  private async performScraping(settings: {
    maxPosts: number;
    maxScrolls: number;
    minLikes: number;
    minReposts: number;
    minShares: number;
    minReplies: number;
  }): Promise<string> {
    const 最大貼文數 = settings.maxPosts;
    const 最大滾動次數 = settings.maxScrolls;
    const 篩選最低讚數 = settings.minLikes;
    const 篩選最低轉發數 = settings.minReposts;
    const 篩選最低分享數 = settings.minShares;
    const 篩選最低回覆數 = settings.minReplies;

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const cache = new Map();
    const digits = (txt: string) => parseInt(txt.replace(/\D/g, ""), 10) || 0;

    // 取得用戶 ID
    const id =
      [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find((t) => /^[a-zA-Z0-9._]+$/.test(t)) || "unknown_id";

    // 取得簡介
    const bio =
      [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find((txt) => txt.split("\n").length > 1) || "";

    const followerRaw =
      [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find(
          (t) => /粉絲|Followers/i.test(t) || /^[\d,.]+\s*(萬|k|m)?/.test(t)
        ) || "";

    const profile = `# @${id}\n\n**追蹤者**：${followerRaw}\n\n簡介：\n${bio.replace(
      /\n/g,
      "  \n"
    )}\n`;

    const getNum = (post: Element, labels: string | string[]) => {
      const labelArray = Array.isArray(labels) ? labels : [labels];
      for (const label of labelArray) {
        const selectors = [
          `svg[aria-label="${label}"]`,
          `svg[aria-label="收回${label}"]`,
          `svg[aria-label="Un${label}"]`,
          `svg[aria-label="取消${label}"]`,
        ];
        const svg = post.querySelector(selectors.join(", "));
        if (svg) {
          const span = svg
            .closest('div[role="button"]')
            ?.querySelector("span span, span");
          return span ? digits(span.textContent || "0") : 0;
        }
      }
      return 0;
    };

    const isRootPost = (post: Element) =>
      post.querySelector(
        'svg[aria-label="轉發"], svg[aria-label="Repost"], svg[aria-label="Share"]'
      );

    let flat = 0;
    let index = 0;

    while (flat < 最大滾動次數 && cache.size < 最大貼文數) {
      index++;

      document
        .querySelectorAll('div[data-pressable-container="true"]')
        .forEach((p) => {
          if (!isRootPost(p)) return;

          const t = p.querySelector("time")?.getAttribute("datetime");
          if (!t) return;

          const postId =
            p.querySelector('a[href*="/post/"]')?.getAttribute("href") ?? t;
          if (cache.has(postId)) return;

          const captionBox = p.querySelector("div.x1a6qonq");
          let content = captionBox ? captionBox.textContent?.trim() || "" : "";
          content = content.replace(/\n(翻譯|Translate)$/, "");
          content = content.replace(/(翻譯|Translate)$/, "");

          cache.set(postId, {
            id: postId,
            publishedAt: t,
            content,
            likeCount: getNum(p, ["讚", "Like"]),
            commentCount: getNum(p, ["回覆", "Reply", "Comment"]),
            repostCount: getNum(p, ["轉發", "Repost"]),
            shareCount: getNum(p, ["分享", "Share"]),
          });
        });

      const h = document.body.scrollHeight;
      window.scrollTo(0, h);
      await sleep(800);
      flat = document.body.scrollHeight === h ? flat + 1 : 0;
    }

    const result = [...cache.values()]
      .filter(
        (p: any) =>
          p.likeCount >= 篩選最低讚數 &&
          p.commentCount >= 篩選最低回覆數 &&
          p.repostCount >= 篩選最低轉發數 &&
          p.shareCount >= 篩選最低分享數
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      );

    const md1 = result
      .reverse()
      .map((p: any) => {
        const body = (p.content || "").replace(/\n/g, "  \n");
        return (
          `### ${p.publishedAt}\n\n` +
          `* 👍 ${p.likeCount}　💬 ${p.commentCount}　🔃 ${p.repostCount}　📤 ${p.shareCount}\n\n` +
          `${body}\n`
        );
      })
      .join("\n");

    const md = `${profile}\n\n# 所有貼文\n` + md1;
    return md;
  }

  private downloadResult(content: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `threads-scrape-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public async updateThresholds(newThresholds: LikeThreshold[]) {
    this.thresholds = newThresholds;
    const posts = document.querySelectorAll(
      'div[data-pressable-container="true"]'
    );
    posts.forEach((post) => {
      const existing = (post as HTMLElement).querySelector(
        ".threads-helper-bookmark"
      );
      if (existing) {
        existing.remove();
        (post as HTMLElement).dataset.threadsHelperProcessed = "";
      }
    });
    this.processExistingPosts();
  }

  public cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.logoElement) {
      this.logoElement.remove();
      this.logoElement = null;
    }
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = null;
    }
    if (this.exportButtonElement) {
      this.exportButtonElement.remove();
      this.exportButtonElement = null;
    }
    if (this.scraperModalElement) {
      this.scraperModalElement.remove();
      this.scraperModalElement = null;
    }
    if (this.resultsModalElement) {
      this.resultsModalElement.remove();
      this.resultsModalElement = null;
    }
  }
}

// 全域實例引用
let threadsHelperInstance: ThreadsHelper;

if (typeof window !== "undefined") {
  threadsHelperInstance = new ThreadsHelper();

  browser.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
    if (request.action === "updateThresholds") {
      threadsHelperInstance.updateThresholds(request.thresholds);
    }
  });

  // 頁面卸載時清理
  window.addEventListener("beforeunload", () => {
    threadsHelperInstance.cleanup();
  });
}

export { ThreadsHelper };
