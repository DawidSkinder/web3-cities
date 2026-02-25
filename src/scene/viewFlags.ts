function hasFlag(name: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get(name);
  return value === '1' || value === 'true';
}

export const DEBUG_VIEW_ENABLED = hasFlag('debugView');

