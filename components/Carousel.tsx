import { BucketItemWithBlob } from "@/lib/types";

export default function Carousel({ images, shown, onSelectImage }: {
  images: (BucketItemWithBlob | null)[],
  shown: boolean,
  onSelectImage: (image: BucketItemWithBlob) => void
}) {
  return (
    <div
      className={`bg-black bg-opacity-80 transform transition-all duration-300 ${shown ? 'h-32' : 'h-0'
        }`}
    >
      <div className="h-full w-full flex justify-center px-4 py-4 space-x-4 overflow-x-hidden relative">
        <div className="absolute inset-0 z-10 pointer-events-none" style={{
          background: "linear-gradient(90deg, rgba(0,0,0,1) 8%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 65%, rgba(0,0,0,1) 92%)"
        }} />
        {images.map((img, i) => {
          const blobUrl = img?.thumbnailBlobUrl || img?.blobUrl;
          let rotation = '';
          if (img?.thumbnailBlobUrl && img?.metadata?.orientation) {
            rotation = img.metadata.orientation === 6 ? 'rotate-90' : img.metadata.orientation === 8 ? '-rotate-90' : '';
          }

          return (
            <button
              key={img?.path || i}
              onClick={() => img ? onSelectImage(img) : null}
              className={`h-24 w-24 flex-shrink-0 box-border bg-white/5 transition-none flex justify-center duration-200  ${i === 4 ? 'ring-2 ring-white' : ''
                } ${rotation}`}
            >
              {blobUrl ? (
                <img
                  src={blobUrl}
                  alt={img.name}
                  className="h-full w-auto object-cover"
                />
              ) : (
                <div className="h-full w-24 bg-black flex items-center justify-center">
                  {img && <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-500 border-t-transparent" />}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  )
}