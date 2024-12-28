type Size = 'small' | 'medium' | 'large';

interface LoadingSpinnerProps {
  size?: Size;
  light?: boolean;
  className?: string;
}

export default function LoadingSpinner({ className = '', size = 'medium', light = false }: LoadingSpinnerProps) {
  const sizeClass = size === 'small' ? 'w-3 h-3' : size === 'large' ? 'w-12 h-12' : 'w-8 h-8';
  const colorClass = light ? 'border-white/50' : 'border-black/50';

  return (
    <div className={`flex items-center justify-center ${className} w-full h-full`}>
      <div className={`animate-spin rounded-full ${sizeClass} border-b-2 ${colorClass}`}></div>
    </div>
  );
} 