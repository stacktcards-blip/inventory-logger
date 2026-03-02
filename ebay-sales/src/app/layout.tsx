import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'eBay Sales API',
  description: 'eBay Sales Intake backend – sync, packing, match',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
