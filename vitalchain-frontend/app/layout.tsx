import './globals.css';

export const metadata = {
  title: "VitalChain Dashboard",
  description: "VitalChain - Privacy-First Health Records Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
      </body>
    </html>
  );
}


