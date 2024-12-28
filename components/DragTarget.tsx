export default function DragTarget() {
  return (
    <div className="fixed top-12 left-0 right-0 bottom-0 bg-white/90 z-40 p-4">
      <div className="w-full h-full border-4 border-dashed border-black/10 rounded-lg flex items-center justify-center">
        <p className="text-lg text-black/30">
          Drop images here
        </p>
      </div>
    </div>
  );
} 