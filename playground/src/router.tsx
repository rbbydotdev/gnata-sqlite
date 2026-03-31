import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from './RootLayout';
import { SqliteMode } from './sqlite/SqliteMode';
import { GnataMode } from './gnata/GnataMode';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/sqlite' });
  },
});

const sqliteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sqlite',
  component: function SqlitePage() {
    return <SqliteMode />;
  },
});

const gnataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gnata',
  component: function GnataPage() {
    return <GnataMode />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, sqliteRoute, gnataRoute]);

const basepath = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createRouter({ routeTree, basepath });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
