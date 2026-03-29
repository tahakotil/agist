export default function StatusLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Status board is fullscreen — no sidebar, no header
  return <>{children}</>
}
