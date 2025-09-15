import React, { useState, useEffect } from "react";
import browser from "webextension-polyfill";
import { LikeThreshold, DEFAULT_THRESHOLDS } from "../types";

interface SettingsProps {
  onScrapeRequest: () => void;
  isOnProfile: boolean;
}

const Settings: React.FC<SettingsProps> = ({
  onScrapeRequest,
  isOnProfile,
}) => {
  const [thresholds, setThresholds] =
    useState<LikeThreshold[]>(DEFAULT_THRESHOLDS);
  const [newThreshold, setNewThreshold] = useState({
    min: 0,
    color: "#FFD700",
  });
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await browser.storage.sync.get(["thresholds"]);
      if (result.thresholds) {
        setThresholds(result.thresholds);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const saveSettings = async (newThresholds: LikeThreshold[]) => {
    try {
      await browser.storage.sync.set({ thresholds: newThresholds });
      setThresholds(newThresholds);

      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.id) {
        browser.tabs.sendMessage(tabs[0].id, {
          action: "updateThresholds",
          thresholds: newThresholds,
        });
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  };

  const addThreshold = () => {
    if (newThreshold.min <= 0) return;

    const newId = `threshold_${Date.now()}`;
    const threshold: LikeThreshold = {
      id: newId,
      min: newThreshold.min,
      max: newThreshold.min + 99999,
      color: newThreshold.color,
    };

    const updatedThresholds = [...thresholds, threshold].sort(
      (a, b) => a.min - b.min
    );

    for (let i = 0; i < updatedThresholds.length; i++) {
      if (i < updatedThresholds.length - 1) {
        updatedThresholds[i].max = updatedThresholds[i + 1].min - 1;
      } else {
        updatedThresholds[i].max = 999999;
      }
    }

    saveSettings(updatedThresholds);
    setNewThreshold({ min: 0, color: "#FFD700" });
  };

  const removeThreshold = (id: string) => {
    const updated = thresholds.filter((t) => t.id !== id);
    saveSettings(updated);
  };

  const handleScrapeClick = () => {
    setShowWarning(true);
  };

  const confirmScrape = () => {
    setShowWarning(false);
    onScrapeRequest();
  };

  const updateThreshold = (
    id: string,
    field: keyof LikeThreshold,
    value: string | number
  ) => {
    const updated = thresholds.map((t) =>
      t.id === id ? { ...t, [field]: value } : t
    );
    saveSettings(updated);
  };

  return (
    <div
      style={{
        padding: "32px",
        minWidth: "400px",
        maxWidth: "500px",
        backgroundColor: "#ffffff",
        color: "#000000",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1
          style={{
            margin: "0",
            fontSize: "32px",
            fontWeight: "900",
            color: "#000000",
            letterSpacing: "-0.02em",
          }}
        >
          Threads Helper
        </h1>
        <p
          style={{
            margin: "8px 0 0 0",
            fontSize: "18px",
            color: "#666666",
            lineHeight: "1.5",
          }}
        >
          智慧標記高讚文章，自動爬取內容
        </p>
      </div>

      {/* Scraping Section */}
      {isOnProfile && (
        <div
          style={{
            marginBottom: "32px",
            padding: "24px",
            backgroundColor: "#000000",
            borderRadius: "16px",
            color: "#ffffff",
          }}
        >
          <h3
            style={{
              margin: "0 0 12px 0",
              fontSize: "20px",
              fontWeight: "700",
              color: "#ffffff",
            }}
          >
            🚀 自動爬文
          </h3>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "14px",
              color: "#cccccc",
              lineHeight: "1.4",
            }}
          >
            在個人檔案頁面爬取文章內容
          </p>
          <button
            onClick={handleScrapeClick}
            style={{
              width: "100%",
              padding: "16px",
              backgroundColor: "#ffffff",
              color: "#000000",
              border: "none",
              borderRadius: "50px",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "700",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              const target = e.target as HTMLElement;
              target.style.transform = "translateY(-2px)";
              target.style.boxShadow = "0 8px 25px rgba(255,255,255,0.3)";
            }}
            onMouseLeave={(e) => {
              const target = e.target as HTMLElement;
              target.style.transform = "translateY(0)";
              target.style.boxShadow = "none";
            }}
          >
            開始爬取文章
          </button>
        </div>
      )}

      {/* Thresholds Section */}
      <div style={{ marginBottom: "32px" }}>
        <h3
          style={{
            margin: "0 0 20px 0",
            fontSize: "20px",
            fontWeight: "700",
            color: "#000000",
          }}
        >
          📊 讚數等級設定
        </h3>

        <div style={{ marginBottom: "24px" }}>
          {thresholds.map((threshold, index) => (
            <div
              key={threshold.id}
              style={{
                marginBottom: "16px",
                padding: "20px",
                backgroundColor: "#ffffff",
                border: "2px solid #e5e5e5",
                borderRadius: "16px",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#cccccc";
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "#e5e5e5";
                (e.currentTarget as HTMLElement).style.transform =
                  "translateY(0)";
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    backgroundColor: threshold.color,
                    borderRadius: "50%",
                    flexShrink: 0,
                    border: "3px solid rgba(0,0,0,0.1)",
                  }}
                />
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#000000",
                  }}
                >
                  讚數 ≥ {threshold.min.toLocaleString()}
                </span>
              </div>

              <div
                style={{ display: "flex", gap: "12px", alignItems: "center" }}
              >
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666666",
                      marginBottom: "6px",
                    }}
                  >
                    最低讚數
                  </label>
                  <input
                    type="number"
                    value={threshold.min}
                    onChange={(e) =>
                      updateThreshold(
                        threshold.id,
                        "min",
                        parseInt(e.target.value)
                      )
                    }
                    placeholder="最低"
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "2px solid #e5e5e5",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: "500",
                      outline: "none",
                      transition: "all 0.2s ease",
                    }}
                    onFocus={(e) =>
                      ((e.target as HTMLElement).style.borderColor = "#000000")
                    }
                    onBlur={(e) =>
                      ((e.target as HTMLElement).style.borderColor = "#e5e5e5")
                    }
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#666666",
                      marginBottom: "6px",
                    }}
                  >
                    顏色
                  </label>
                  <input
                    type="color"
                    value={threshold.color}
                    onChange={(e) =>
                      updateThreshold(threshold.id, "color", e.target.value)
                    }
                    style={{
                      width: "60px",
                      height: "48px",
                      border: "2px solid #e5e5e5",
                      borderRadius: "8px",
                      cursor: "pointer",
                      padding: "0",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={() => removeThreshold(threshold.id)}
                style={{
                  marginTop: "12px",
                  padding: "8px 16px",
                  backgroundColor: "#ffffff",
                  color: "#666666",
                  border: "2px solid #e5e5e5",
                  borderRadius: "20px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "600",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = "#ff4444";
                  target.style.color = "#ff4444";
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = "#e5e5e5";
                  target.style.color = "#666666";
                }}
              >
                🗑️ 刪除等級
              </button>
            </div>
          ))}
        </div>

        {/* Add New Threshold */}
        <div
          style={{
            padding: "24px",
            backgroundColor: "#f8f9fa",
            borderRadius: "16px",
            border: "2px dashed #cccccc",
          }}
        >
          <h4
            style={{
              margin: "0 0 20px 0",
              fontSize: "18px",
              fontWeight: "700",
              color: "#000000",
            }}
          >
            ➕ 新增等級
          </h4>

          <div
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "end",
              marginBottom: "20px",
            }}
          >
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#666666",
                  marginBottom: "8px",
                }}
              >
                最低讚數
              </label>
              <input
                type="number"
                placeholder="例如: 1000"
                value={newThreshold.min || ""}
                onChange={(e) =>
                  setNewThreshold((prev) => ({
                    ...prev,
                    min: parseInt(e.target.value) || 0,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "2px solid #e5e5e5",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "500",
                  outline: "none",
                  transition: "all 0.2s ease",
                }}
                onFocus={(e) =>
                  ((e.target as HTMLElement).style.borderColor = "#000000")
                }
                onBlur={(e) =>
                  ((e.target as HTMLElement).style.borderColor = "#e5e5e5")
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#666666",
                  marginBottom: "8px",
                }}
              >
                顏色
              </label>
              <input
                type="color"
                value={newThreshold.color}
                onChange={(e) =>
                  setNewThreshold((prev) => ({
                    ...prev,
                    color: e.target.value,
                  }))
                }
                style={{
                  width: "80px",
                  height: "48px",
                  border: "2px solid #e5e5e5",
                  borderRadius: "8px",
                  cursor: "pointer",
                  padding: "0",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <button
            onClick={addThreshold}
            disabled={newThreshold.min <= 0}
            style={{
              width: "100%",
              padding: "16px",
              backgroundColor: newThreshold.min > 0 ? "#000000" : "#cccccc",
              color: "#ffffff",
              border: "none",
              borderRadius: "50px",
              cursor: newThreshold.min > 0 ? "pointer" : "not-allowed",
              fontSize: "16px",
              fontWeight: "700",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (newThreshold.min > 0) {
                const target = e.target as HTMLElement;
                target.style.transform = "translateY(-2px)";
                target.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
              }
            }}
            onMouseLeave={(e) => {
              if (newThreshold.min > 0) {
                const target = e.target as HTMLElement;
                target.style.transform = "translateY(0)";
                target.style.boxShadow = "none";
              }
            }}
          >
            {newThreshold.min > 0 ? "🎯 新增等級" : "請輸入讚數門檻"}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: "24px",
          borderTop: "2px solid #f0f0f0",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: "0",
            fontSize: "14px",
            color: "#666666",
            lineHeight: "1.5",
          }}
        >
          📌 設定完成後會自動在符合讚數的文章標記書籤按鈕
        </p>
      </div>

      {/* Warning Modal */}
      {showWarning && (
        <div
          style={{
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            bottom: "0",
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "9999",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              padding: "32px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "48px",
                  marginBottom: "16px",
                }}
              >
                ⚠️
              </div>
              <h3
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "#000000",
                }}
              >
                重要提醒
              </h3>
            </div>

            <div
              style={{
                backgroundColor: "#fff3cd",
                border: "2px solid #ffeaa7",
                borderRadius: "12px",
                padding: "20px",
                marginBottom: "24px",
              }}
            >
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "14px",
                  color: "#856404",
                  fontWeight: "600",
                  lineHeight: "1.4",
                }}
              >
                此功能屬於一種被 Threads 可能禁止的行為
              </p>
              <p
                style={{
                  margin: "0",
                  fontSize: "14px",
                  color: "#856404",
                  lineHeight: "1.4",
                }}
              >
                • 請勿使用於其他人身上
                <br />
                • 該功能只建議用來小量的爬取自己的文章
                <br />• 過度使用可能導致帳號被限制
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
              }}
            >
              <button
                onClick={() => setShowWarning(false)}
                style={{
                  flex: "1",
                  padding: "12px 20px",
                  backgroundColor: "#ffffff",
                  color: "#666666",
                  border: "2px solid #e5e5e5",
                  borderRadius: "50px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = "#cccccc";
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = "#e5e5e5";
                }}
              >
                取消
              </button>
              <button
                onClick={confirmScrape}
                style={{
                  flex: "1",
                  padding: "12px 20px",
                  backgroundColor: "#dc3545",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "50px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "600",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.backgroundColor = "#c82333";
                  target.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.backgroundColor = "#dc3545";
                  target.style.transform = "translateY(0)";
                }}
              >
                我了解，繼續
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
