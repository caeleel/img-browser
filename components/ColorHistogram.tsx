import { useEffect, useRef } from 'react';

interface HistogramData {
  red: number[];
  green: number[];
  blue: number[];
}

interface ColorHistogramProps {
  imageUrl: string;
}

export function ColorHistogram({ imageUrl }: ColorHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const generateHistogram = async () => {
      if (!canvasRef.current) return;

      // Load image
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Create temporary canvas to read pixel data
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      tempCtx.drawImage(img, 0, 0);

      const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      // Initialize histogram data
      const histogram: HistogramData = {
        red: new Array(256).fill(0),
        green: new Array(256).fill(0),
        blue: new Array(256).fill(0)
      };

      // Count pixel values
      for (let i = 0; i < data.length; i += 4) {
        histogram.red[data[i]]++;
        histogram.green[data[i + 1]]++;
        histogram.blue[data[i + 2]]++;
      }

      // Normalize values
      const maxCount = Math.max(
        ...histogram.red,
        ...histogram.green,
        ...histogram.blue
      );

      histogram.red = histogram.red.map(v => v / maxCount);
      histogram.green = histogram.green.map(v => v / maxCount);
      histogram.blue = histogram.blue.map(v => v / maxCount);

      // Draw histogram
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Set blend mode for colors
      ctx.globalCompositeOperation = 'screen';

      // Draw each channel
      ['red', 'green', 'blue'].forEach((channel) => {
        ctx.beginPath();
        ctx.moveTo(0, height);

        // Draw histogram line
        histogram[channel as keyof HistogramData].forEach((value, i) => {
          ctx.rect(i * (width / 255), height - (value * height), width / 255, (value * height))
        });

        ctx.lineTo(width, height);
        ctx.closePath();

        // Set colors with opacity
        ctx.fillStyle = `${channel}`;
        ctx.fill();
      });
    };

    generateHistogram();
  }, [imageUrl]);

  return (
    <div className="mt-4">
      <canvas
        ref={canvasRef}
        width={256}
        height={100}
        className="w-full bg-white/10"
      />
    </div>
  );
} 