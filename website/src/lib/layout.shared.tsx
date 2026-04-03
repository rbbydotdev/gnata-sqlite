import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookOpen, SquareTerminal } from 'lucide-react';
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
        text: (
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" />
            Documentation
          </span>
        ),
        url: '/docs',
      },
      {
        text: (
          <span className="inline-flex items-center gap-1.5">
            <SquareTerminal className="size-4" />
            Playground
          </span>
        ),
        url: 'https://rbby.dev/gnata-sqlite/playground',
        external: true,
      },
    ],
  };
}
