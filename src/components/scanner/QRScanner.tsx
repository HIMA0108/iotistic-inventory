import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onResult: (text: string) => void;
  onClose?: () => void;
}

export default function QRScanner({ onResult, onClose }: Props) {
  const containerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(containerId, { verbose: false });
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((cameras) => {
        if (cancelled || cameras.length === 0) return;
        const cam = cameras.find((c) => /back|rear|environment/i.test(c.label)) ?? cameras[cameras.length - 1];
        return scanner.start(
          cam.id,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!startedRef.current) return;
            onResult(decoded);
          },
          () => {
            /* ignore decode errors */
          }
        ).then(() => {
          startedRef.current = true;
        });
      })
      .catch(() => {
        /* camera unavailable */
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s && startedRef.current) {
        s.stop().then(() => s.clear()).catch(() => {
          /* ignore */
        });
        startedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div id={containerId} className="overflow-hidden rounded-2xl border border-border bg-black/90" />
      <p className="text-center text-xs text-muted-foreground">
        Point camera at a barcode or QR code containing the SKU.
      </p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-border bg-secondary py-2 text-sm font-medium"
        >
          Close scanner
        </button>
      )}
    </div>
  );
}
