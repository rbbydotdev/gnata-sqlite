import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { Zap } from 'lucide-react';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  const { links, ...options } = baseOptions();
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...options}
      links={links?.filter((link) => 'url' in link && link.url !== '/docs' && link.url !== 'https://rbby.dev')}
      sidebar={{
        defaultOpenLevel: 1,
        footer: (
          <div className="-mx-2 mb-2 mt-2 rounded-lg bg-fd-accent/50 px-2 py-1.5">
            <a
              href="https://rbby.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-sm text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            >
              by <Zap className="size-3.5" /> rbby.dev
            </a>
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
