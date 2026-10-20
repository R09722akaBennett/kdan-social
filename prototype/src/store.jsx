import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { APPROVAL_ITEMS } from './data.js';

const Ctx = createContext(null);

const INITIAL = {
  expired: { tw_ig: true },
  decisions: { p1: { tw: 'ok', us: 'wait', jp: 'chg' }, p2: { jp: 'wait' } },
  aiDrafts: false,
  comments: {},
  watched: [],
  toast: null,
};

export function StoreProvider({ children }) {
  const [state, setState] = useState(INITIAL);

  const toast = useCallback((msg) => setState((s) => ({ ...s, toast: { msg, at: Date.now() } })), []);

  useEffect(() => {
    if (!state.toast) return undefined;
    const t = setTimeout(() => setState((s) => ({ ...s, toast: null })), 2800);
    return () => clearTimeout(t);
  }, [state.toast]);

  const actions = useMemo(() => ({
    toast,
    reconnect: (id) => {
      setState((s) => ({ ...s, expired: { ...s.expired, [id]: false } }));
      toast('已重新連結，受影響的排程貼文會照原時間發布');
    },
    decide: (item, market, value) => setState((s) => ({
      ...s,
      decisions: { ...s.decisions, [item]: { ...s.decisions[item], [market]: value } },
    })),
    addAiDrafts: () => {
      setState((s) => ({ ...s, aiDrafts: true }));
      toast('已加入 24 篇草稿到行事曆');
    },
    addComment: (key, comment) => setState((s) => ({
      ...s,
      comments: { ...s.comments, [key]: [...(s.comments[key] || []), comment] },
    })),
    watch: (handle) => {
      setState((s) => ({ ...s, watched: [...s.watched, handle] }));
      toast(`開始追蹤 ${handle}，明天起每天記錄一次`);
    },
    reset: () => {
      setState(INITIAL);
      toast('已重設為初始狀態');
    },
  }), [toast]);

  const derived = useMemo(() => {
    const pendingItems = Object.keys(APPROVAL_ITEMS).filter((k) => Object.values(state.decisions[k]).some((d) => d !== 'ok'));
    const expiredIds = Object.keys(state.expired).filter((k) => state.expired[k]);
    return { pendingItems, expiredIds, igTwExpired: !!state.expired.tw_ig };
  }, [state]);

  return <Ctx.Provider value={{ state, ...actions, ...derived }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
