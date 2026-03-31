import { Onest } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const onest = Onest({
  subsets: ['latin'],
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${onest.className}`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
