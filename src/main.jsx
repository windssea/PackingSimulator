import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(<App />);

// PWA：生产环境注册离线缓存（开发模式不注册，免得缓存住热更新）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 注册失败也不影响使用 */
    });
  });
}
