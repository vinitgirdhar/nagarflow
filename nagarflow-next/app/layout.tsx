import type { Metadata } from 'next';
import './globals.css';
import ApiRuntimeBridge from './components/ApiRuntimeBridge';

export const metadata: Metadata = {
  title: 'NagarFlow — The city\'s brain. Predict. Dispatch. Learn.',
  description: 'NagarFlow: Smart city platform predicting urban problems 48 hours ahead and dispatching garbage trucks, water tankers, and maintenance crews using ML, NLP, and reinforcement learning — zero hardware required.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiRuntimeBridge />
        {children}
      </body>
    </html>
  );
}
