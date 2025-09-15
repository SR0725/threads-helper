import React, { useState } from 'react';
import browser from 'webextension-polyfill';

interface ScraperProps {
  onBack: () => void;
}

interface ScrapeSettings {
  maxPosts: number;
  maxScrolls: number;
  minLikes: number;
  minReposts: number;
  minShares: number;
  minReplies: number;
}

interface PresetConfig {
  name: string;
  description: string;
  settings: ScrapeSettings;
}

const Scraper: React.FC<ScraperProps> = ({ onBack }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<string>('standard');
  const [customSettings, setCustomSettings] = useState<ScrapeSettings>({
    maxPosts: 100,
    maxScrolls: 20,
    minLikes: 0,
    minReposts: 0,
    minShares: 0,
    minReplies: 0
  });

  const presets: PresetConfig[] = [
    {
      name: 'quick',
      description: '快速爬取 (50篇)',
      settings: { maxPosts: 50, maxScrolls: 10, minLikes: 0, minReposts: 0, minShares: 0, minReplies: 0 }
    },
    {
      name: 'standard',
      description: '標準爬取 (100篇)',
      settings: { maxPosts: 100, maxScrolls: 20, minLikes: 0, minReposts: 0, minShares: 0, minReplies: 0 }
    },
    {
      name: 'deep',
      description: '深度爬取 (200篇)',
      settings: { maxPosts: 200, maxScrolls: 40, minLikes: 0, minReposts: 0, minShares: 0, minReplies: 0 }
    },
    {
      name: 'popular',
      description: '熱門文章 (讚數≥10)',
      settings: { maxPosts: 100, maxScrolls: 20, minLikes: 10, minReposts: 0, minShares: 0, minReplies: 0 }
    },
    {
      name: 'custom',
      description: '自訂設定',
      settings: customSettings
    }
  ];

  const getCurrentSettings = (): ScrapeSettings => {
    const preset = presets.find(p => p.name === selectedPreset);
    return preset ? preset.settings : customSettings;
  };

  const startScraping = async () => {
    setIsRunning(true);
    setProgress('正在準備爬取...');
    setResults('');

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('無法找到當前分頁');
      }

      const currentSettings = getCurrentSettings();
      setProgress(`使用 ${presets.find(p => p.name === selectedPreset)?.description} 開始爬取...`);

      const results = await browser.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: createScrapingFunction(currentSettings)
      });

      setResults(results[0]?.result || '爬取完成，但沒有結果');
      setProgress('爬取完成！');
    } catch (error) {
      console.error('Scraping failed:', error);
      setProgress(`錯誤: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const createScrapingFunction = (settings: ScrapeSettings) => {
    return async () => {
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
      const id = [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find((t) => /^[a-zA-Z0-9._]+$/.test(t)) || "unknown_id";

      // 取得簡介
      const bio = [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find((txt) => txt.split("\n").length > 1) || "";

      const followerRaw = [...document.querySelectorAll("span")]
        .map((el) => el.textContent?.trim() || "")
        .find((t) => /粉絲|Followers/i.test(t) || /^[\d,.]+\s*(萬|k|m)?/.test(t)) || "";

      const profile = `# @${id}\n\n**追蹤者**：${followerRaw}\n\n簡介：\n${bio.replace(/\n/g, "  \n")}\n`;

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
            const span = svg.closest('div[role="button"]')?.querySelector("span span, span");
            return span ? digits(span.textContent || "0") : 0;
          }
        }
        return 0;
      };

      const isRootPost = (post: Element) => post.querySelector(
        'svg[aria-label="轉發"], svg[aria-label="Repost"], svg[aria-label="Share"]'
      );

      let flat = 0;
      let index = 0;
      
      while (flat < 最大滾動次數 && cache.size < 最大貼文數) {
        index++;
        
        document.querySelectorAll('div[data-pressable-container="true"]').forEach((p) => {
          if (!isRootPost(p)) return;
          
          const t = p.querySelector("time")?.getAttribute("datetime");
          if (!t) return;

          const postId = p.querySelector('a[href*="/post/"]')?.getAttribute("href") ?? t;
          if (cache.has(postId)) return;

          const captionBox = p.querySelector("div.x1a6qonq");
          let content = captionBox ? (captionBox.textContent?.trim() || "") : "";
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
        .filter((p: any) => 
          p.likeCount >= 篩選最低讚數 &&
          p.commentCount >= 篩選最低回覆數 &&
          p.repostCount >= 篩選最低轉發數 &&
          p.shareCount >= 篩選最低分享數
        )
        .sort((a: any, b: any) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());

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
    };
  };

  const copyResults = () => {
    navigator.clipboard.writeText(results);
  };

  const downloadResults = () => {
    const blob = new Blob([results], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threads-scrape-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ 
      padding: '32px', 
      minWidth: '400px',
      maxWidth: '500px',
      backgroundColor: '#ffffff',
      color: '#000000'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={onBack}
          style={{
            padding: '12px 20px',
            backgroundColor: '#000000',
            color: '#ffffff',
            border: 'none',
            borderRadius: '50px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '16px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
        >
          ← 返回設定
        </button>
        <h1 style={{ 
          margin: '0', 
          fontSize: '32px', 
          fontWeight: '900',
          color: '#000000',
          letterSpacing: '-0.02em'
        }}>
          自動爬文
        </h1>
        <p style={{ 
          margin: '8px 0 0 0', 
          fontSize: '18px', 
          color: '#666666',
          lineHeight: '1.5'
        }}>
          智慧爬取 Threads 文章內容
        </p>
      </div>

      {/* Preset Selection */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ 
          margin: '0 0 16px 0', 
          fontSize: '20px', 
          fontWeight: '700',
          color: '#000000'
        }}>
          爬取模式
        </h3>
        
        <div style={{ display: 'grid', gap: '12px' }}>
          {presets.filter(p => p.name !== 'custom').map((preset) => (
            <div
              key={preset.name}
              onClick={() => setSelectedPreset(preset.name)}
              style={{
                padding: '16px 20px',
                backgroundColor: selectedPreset === preset.name ? '#000000' : '#ffffff',
                color: selectedPreset === preset.name ? '#ffffff' : '#000000',
                border: selectedPreset === preset.name ? '2px solid #000000' : '2px solid #e5e5e5',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: selectedPreset === preset.name ? 'scale(1.02)' : 'scale(1)'
              }}
              onMouseEnter={(e) => {
                if (selectedPreset !== preset.name) {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = '#000000';
                  target.style.transform = 'scale(1.01)';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPreset !== preset.name) {
                  const target = e.target as HTMLElement;
                  target.style.borderColor = '#e5e5e5';
                  target.style.transform = 'scale(1)';
                }
              }}
            >
              <div style={{ 
                fontWeight: '600', 
                fontSize: '16px', 
                marginBottom: '4px' 
              }}>
                {preset.description}
              </div>
              <div style={{ 
                fontSize: '14px', 
                opacity: 0.8,
                display: 'flex',
                gap: '16px',
                marginTop: '8px'
              }}>
                <span>文章: {preset.settings.maxPosts}</span>
                <span>滾動: {preset.settings.maxScrolls}</span>
                {preset.settings.minLikes > 0 && <span>讚數≥{preset.settings.minLikes}</span>}
              </div>
            </div>
          ))}
          
          <div
            onClick={() => setSelectedPreset('custom')}
            style={{
              padding: '16px 20px',
              backgroundColor: selectedPreset === 'custom' ? '#000000' : '#f8f9fa',
              color: selectedPreset === 'custom' ? '#ffffff' : '#000000',
              border: selectedPreset === 'custom' ? '2px solid #000000' : '2px dashed #cccccc',
              borderRadius: '16px',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (selectedPreset !== 'custom') {
                const target = e.target as HTMLElement;
                target.style.borderColor = '#000000';
                target.style.transform = 'scale(1.01)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedPreset !== 'custom') {
                const target = e.target as HTMLElement;
                target.style.borderColor = '#cccccc';
                target.style.transform = 'scale(1)';
              }
            }}
          >
            <div style={{ fontWeight: '600', fontSize: '16px' }}>
              自訂設定
            </div>
            <div style={{ fontSize: '14px', opacity: 0.8, marginTop: '4px' }}>
              完全客製化的爬取參數
            </div>
          </div>
        </div>
      </div>

      {/* Custom Settings */}
      {selectedPreset === 'custom' && (
        <div style={{ 
          marginBottom: '32px',
          padding: '24px',
          backgroundColor: '#f8f9fa',
          borderRadius: '16px',
          border: '1px solid #e5e5e5'
        }}>
          <h4 style={{ 
            margin: '0 0 20px 0', 
            fontSize: '18px', 
            fontWeight: '700',
            color: '#000000'
          }}>
            自訂參數
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ 
                fontSize: '14px', 
                color: '#666666', 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '600'
              }}>
                最大貼文數
              </label>
              <input
                type="number"
                value={customSettings.maxPosts}
                onChange={(e) => setCustomSettings(prev => ({ ...prev, maxPosts: parseInt(e.target.value) || 100 }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#000000'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>
            <div>
              <label style={{ 
                fontSize: '14px', 
                color: '#666666', 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '600'
              }}>
                最大滾動次數
              </label>
              <input
                type="number"
                value={customSettings.maxScrolls}
                onChange={(e) => setCustomSettings(prev => ({ ...prev, maxScrolls: parseInt(e.target.value) || 20 }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#000000'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ 
                fontSize: '14px', 
                color: '#666666', 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '600'
              }}>
                最低讚數
              </label>
              <input
                type="number"
                value={customSettings.minLikes}
                onChange={(e) => setCustomSettings(prev => ({ ...prev, minLikes: parseInt(e.target.value) || 0 }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#000000'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>
            <div>
              <label style={{ 
                fontSize: '14px', 
                color: '#666666', 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: '600'
              }}>
                最低回覆數
              </label>
              <input
                type="number"
                value={customSettings.minReplies}
                onChange={(e) => setCustomSettings(prev => ({ ...prev, minReplies: parseInt(e.target.value) || 0 }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#000000'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={startScraping}
        disabled={isRunning}
        style={{
          width: '100%',
          padding: '16px 32px',
          backgroundColor: isRunning ? '#666666' : '#000000',
          color: '#ffffff',
          border: 'none',
          borderRadius: '50px',
          cursor: isRunning ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: '700',
          transition: 'all 0.2s ease',
          marginBottom: '24px'
        }}
        onMouseEnter={(e) => {
          if (!isRunning) {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(-2px)';
            target.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isRunning) {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(0)';
            target.style.boxShadow = 'none';
          }
        }}
      >
        {isRunning ? '爬取中...' : '🚀 開始爬取'}
      </button>

      {/* Progress */}
      {progress && (
        <div style={{ 
          marginBottom: '24px', 
          padding: '16px 20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '1px solid #e5e5e5',
          fontSize: '14px',
          fontWeight: '500',
          color: '#333333'
        }}>
          {progress}
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: '32px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '16px' 
          }}>
            <h4 style={{ 
              margin: '0', 
              fontSize: '20px',
              fontWeight: '700',
              color: '#000000'
            }}>
              爬取結果
            </h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={copyResults}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
              >
                📋 複製
              </button>
              <button
                onClick={downloadResults}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#666666',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => (e.target as HTMLElement).style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
              >
                📥 下載
              </button>
            </div>
          </div>
          <textarea
            value={results}
            readOnly
            style={{
              width: '100%',
              height: '300px',
              padding: '16px',
              border: '2px solid #e5e5e5',
              borderRadius: '12px',
              fontSize: '12px',
              fontFamily: 'SF Mono, Consolas, monospace',
              resize: 'vertical',
              lineHeight: '1.5',
              backgroundColor: '#fafafa',
              outline: 'none'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Scraper;