import type { Metadata } from 'next';
import './globals.css';
import AuthBoundary from './components/AuthBoundary';

export const metadata: Metadata = {
  title: 'NagarFlow — Connected civic operations',
  description: 'Protected municipal operations: durable complaint intake, accountable fleet and field work, grounded evidence search, and inspectable forecasting.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthBoundary>{children}</AuthBoundary>
      </body>
    </html>
  );
}
