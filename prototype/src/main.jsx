import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { StoreProvider, useStore } from './store.jsx';
import { usePath } from './router.jsx';
import Layout from './components/Layout.jsx';
import Overview from './pages/Overview.jsx';
import Compose from './pages/Compose.jsx';
import Calendar from './pages/Calendar.jsx';
import Approvals from './pages/Approvals.jsx';
import Assistant from './pages/Assistant.jsx';
import BrandVoice from './pages/BrandVoice.jsx';
import Channels from './pages/Channels.jsx';
import Analytics from './pages/Analytics.jsx';

const PAGES = {
  '/': [Overview, '總覽'],
  '/calendar': [Calendar, '行事曆'],
  '/approvals': [Approvals, '待審核'],
  '/assistant': [Assistant, 'AI 助理'],
  '/voice': [BrandVoice, '品牌語氣'],
  '/channels': [Channels, '市場與帳號'],
  '/analytics': [Analytics, '成效'],
};

function App() {
  const path = usePath();
  const { state } = useStore();
  if (path === '/compose') {
    document.title = '新增貼文 · kdan-social';
    return (
      <>
        <Compose />
        {state.toast && <div className="toast" role="status">{state.toast.msg}</div>}
      </>
    );
  }
  const [Page, title] = PAGES[path] || PAGES['/'];
  document.title = `${title} · kdan-social`;
  return (
    <Layout path={PAGES[path] ? path : '/'}>
      <Page />
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
