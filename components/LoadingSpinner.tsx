type Size = 'small' | 'medium' | 'large';

interface LoadingSpinnerProps {
  size?: Size;
  light?: boolean;
  className?: string;
}

export default function LoadingSpinner({ className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center justify-center ${className} w-full h-full`}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black/50"></div>
    </div>
  );
} 