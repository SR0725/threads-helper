import "./Popup.css";

export default function() {
  return (
    <div style={{ 
      padding: '32px', 
      minWidth: '400px',
      maxWidth: '500px',
      backgroundColor: '#ffffff',
      color: '#000000'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '32px', textAlign: 'center' }}>
        <div style={{
          width: '60px',
          height: '60px',
          background: 'linear-gradient(45deg, #22C55E, #3B82F6)',
          borderRadius: '15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          margin: '0 auto 16px'
        }}>⚡</div>
        <h1 style={{ 
          margin: '0 0 8px 0', 
          fontSize: '24px', 
          fontWeight: '700',
          background: 'linear-gradient(45deg, #22C55E, #3B82F6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Threads 爆文偵測器
        </h1>
        <p style={{ 
          margin: '0',
          fontSize: '16px',
          opacity: 0.8,
          lineHeight: '1.5'
        }}>
          感謝使用我們的擴充功能！
        </p>
      </div>

      {/* Coffee Section */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.05)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '18px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '20px' }}>☕</span>
          贊助開發者
        </h3>
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          lineHeight: '1.5',
          opacity: '0.8'
        }}>
          如果這個工具對您有幫助，歡迎贊助一杯咖啡支持開發！
        </p>
        
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <img 
            src="buymeacoffee.png" 
            style={{ 
              maxWidth: '200px', 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
            }} 
            alt="Buy Me a Coffee QR Code" 
          />
        </div>
        
        <a 
          href="https://buymeacoffee.com/ray948787o/e/456549" 
          target="_blank" 
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            background: '#FFDD00',
            color: '#000000',
            textDecoration: 'none',
            borderRadius: '12px',
            textAlign: 'center',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(-2px)';
            target.style.boxShadow = '0 8px 20px rgba(255,221,0,0.3)';
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(0)';
            target.style.boxShadow = 'none';
          }}
        >
          ☕ Buy Me a Coffee
        </a>
      </div>

      {/* Threads Section */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.05)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          margin: '0 0 16px 0',
          fontSize: '18px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '20px' }}>🧵</span>
          追蹤我的 Threads
        </h3>
        <p style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          lineHeight: '1.5',
          opacity: '0.8'
        }}>
          獲取最新功能更新和開發進度！
        </p>
        <a 
          href="https://www.threads.net/@ray.realms" 
          target="_blank" 
          style={{
            display: 'block',
            width: '100%',
            padding: '12px',
            background: '#000000',
            color: '#ffffff',
            textDecoration: 'none',
            borderRadius: '12px',
            textAlign: 'center',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(-2px)';
            target.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            const target = e.target as HTMLElement;
            target.style.transform = 'translateY(0)';
            target.style.boxShadow = 'none';
          }}
        >
          🧵 追蹤 @ray.realms
        </a>
      </div>

      {/* Usage Tips */}
      <div style={{
        background: 'linear-gradient(45deg, rgba(34, 197, 94, 0.1), rgba(59, 130, 246, 0.1))',
        borderRadius: '16px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <h4 style={{
          margin: '0 0 12px 0',
          fontSize: '16px',
          fontWeight: '600',
          color: '#000000'
        }}>
          💡 使用提示
        </h4>
        <p style={{
          margin: '0',
          fontSize: '13px',
          lineHeight: '1.4',
          opacity: '0.8'
        }}>
          • 在 Threads 頁面查看標記的爆文<br/>
          • 個人檔案頁面可直接輸出文章<br/>
          • 支援淺色/深色主題自動適配
        </p>
      </div>
    </div>
  );
}
