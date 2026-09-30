// Runs before styles paint. Only an appearance preference is stored.
(() => {
  const key = 'patchgoblin-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (['light', 'dark', 'system'].includes(saved)) preference = saved; } catch {}
  const apply = () => {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
    window.dispatchEvent(new Event('patchgoblin:theme'));
  };
  window.PatchGoblinTheme = {
    get: () => preference,
    set: value => {
      if (!['light', 'dark', 'system'].includes(value)) return;
      preference = value;
      try { localStorage.setItem(key, value); } catch {}
      apply();
    }
  };
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    preference = ['light', 'dark', 'system'].includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  apply();
})();
