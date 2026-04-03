import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span style={{ fontWeight: 700, color: '#9ece6a' }}>
          gnata-sqlite
        </span>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: 'Documentation',
        url: '/docs',
      },
      {
        text: 'Playground',
        url: 'https://rbby.dev/gnata-sqlite/playground',
        external: true,
      },
    ],
  };
}
