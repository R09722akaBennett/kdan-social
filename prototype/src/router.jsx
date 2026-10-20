import { useEffect, useState } from 'react';

// A tiny history router: the prototype has eight flat pages and no params,
// which is not worth a router dependency and its advisories.
const listeners = new Set();

export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  listeners.forEach((fn) => fn(to));
  window.scrollTo(0, 0);
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    listeners.add(setPath);
    window.addEventListener('popstate', onPop);
    return () => {
      listeners.delete(setPath);
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return path;
}

export function Link({ to, onClick, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onClick?.(e);
        navigate(to);
      }}
      {...rest}
    />
  );
}
