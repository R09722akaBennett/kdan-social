import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ACCOUNTS, APPROVAL_ITEMS, INITIAL_GROUPS } from './data.js';

const Ctx = createContext(null);

const INITIAL = {
  expired: { tw_ig: true },
  groups: INITIAL_GROUPS,
  // Per-account settings the customer can change: which group, which time zone.
  accountGroup: Object.fromEntries(ACCOUNTS.map((a) => [a.id, a.group])),
  accountTz: Object.fromEntries(ACCOUNTS.map((a) => [a.id, a.tz])),
  // One decision per post: wait (pending), ok (approved), chg (changes requested).
  decisions: { p1: 'wait', p2: 'wait' },
  aiDrafts: false,
  comments: {},
  watched: [],
  toast: null,
};

let nextGroup = 4;

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
    // An account belongs to at most one group, so saving a group moves its accounts out of any other.
    saveGroup: (id, name, accountIds) => setState((s) => {
      const gid = id ?? `g${nextGroup++}`;
      const groups = id ? s.groups.map((g) => (g.id === id ? { ...g, name } : g)) : [...s.groups, { id: gid, name }];
      const accountGroup = Object.fromEntries(Object.entries(s.accountGroup).map(([a, g]) => [a, accountIds.includes(a) ? gid : g === gid ? null : g]));
      return { ...s, groups, accountGroup, toast: { msg: id ? `已更新群組「${name}」` : `已建立群組「${name}」`, at: Date.now() } };
    }),
    deleteGroup: (id) => setState((s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== id),
      accountGroup: Object.fromEntries(Object.entries(s.accountGroup).map(([a, g]) => [a, g === id ? null : g])),
      toast: { msg: '已刪除群組，帳號本身沒有被移除', at: Date.now() },
    })),
    setAccountTz: (id, tz) => setState((s) => ({ ...s, accountTz: { ...s.accountTz, [id]: tz } })),
    decide: (item, value) => setState((s) => ({ ...s, decisions: { ...s.decisions, [item]: value } })),
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
    const pendingItems = Object.keys(APPROVAL_ITEMS).filter((k) => state.decisions[k] !== 'ok');
    const expiredIds = Object.keys(state.expired).filter((k) => state.expired[k]);
    const accounts = ACCOUNTS.map((a) => ({ ...a, group: state.accountGroup[a.id], tz: state.accountTz[a.id] }));
    const groupName = (id) => state.groups.find((g) => g.id === id)?.name ?? '未分組';
    return { pendingItems, expiredIds, igTwExpired: !!state.expired.tw_ig, accounts, groups: state.groups, groupName };
  }, [state]);

  return <Ctx.Provider value={{ state, ...actions, ...derived }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
