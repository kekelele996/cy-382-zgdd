import React from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntdApp } from 'antd';
import App from './App';
import './styles.css';

function Inner() {
  const { message } = AntdApp.useApp();
  const notify = (type: 'success' | 'error', text: string) => {
    message.open({ type, content: text, duration: 3 });
  };
  return <App notify={notify} />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AntdApp>
      <Inner />
    </AntdApp>
  </React.StrictMode>
);
