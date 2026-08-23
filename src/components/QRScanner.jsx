import { useState, useEffect, useRef } from 'react';
import { Camera, X, CheckCircle, AlertCircle } from 'lucide-react';

export default function QRScanner({ onScan, onClose }) {
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    let html5QrCode = null;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        html5QrCode = new Html5Qrcode('qr-reader');
        scannerRef.current = html5QrCode;
        setScanning(true);

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          async (decodedText) => {
            // Stop scanning on success
            await html5QrCode.stop();
            setScanning(false);

            if (decodedText.startsWith('42bus:')) {
              try {
                const result = await onScan(decodedText);
                setSuccess(result?.message || 'Attendance confirmed.');
              } catch (err) {
                setError(err.message || 'Failed to confirm attendance.');
              }
            } else {
              setError('Invalid QR code. Please scan the driver\'s QR code.');
            }
          },
          () => {} // ignore scan errors
        );
      } catch (err) {
        setError('Camera access denied. Please enable camera permissions.');
        setScanning(false);
      }
    }

    startScanner();

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="glass-panel" style={{ position: 'relative' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2">
          <Camera size={20} /> Scan QR Code
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          <X size={16} /> Close
        </button>
      </div>

      {error && (
        <div className="alert alert-error mb-3">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success mb-3">
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {!success && (
        <>
          <div className="qr-scanner-container" ref={containerRef}>
            <div id="qr-reader" style={{ width: '100%' }}></div>
          </div>
          <p className="text-center text-muted mt-4" style={{ fontSize: '0.85rem' }}>
            Point your camera at the driver's QR code to confirm your attendance.
          </p>
        </>
      )}
    </div>
  );
}
