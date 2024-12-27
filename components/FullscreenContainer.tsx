export default function FullscreenContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center">
      {children}
    </div>
  );
}