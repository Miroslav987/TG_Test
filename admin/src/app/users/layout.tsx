export const metadata = {
  title: 'Standup Admin',
  description: 'Панель управления сотрудниками',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}