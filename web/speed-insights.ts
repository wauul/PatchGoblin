import type {BeforeSendMiddleware} from '@vercel/speed-insights';

const routes = new Set([
  '/', '/docs', '/faq', '/support', '/privacy', '/terms', '/extension',
  '/dashboard', '/onboarding', '/workbench', '/history', '/repositories', '/account',
]);

export const sanitizeSpeedInsight: BeforeSendMiddleware = (event) => {
  try {
    const url = new URL(event.url);
    // Repository/run context and OAuth values must never enter performance events.
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    const route = routes.has(url.pathname) ? url.pathname : '/not-found';
    url.pathname = route;
    return {...event, url: url.href, route};
  } catch {
    return null;
  }
};
