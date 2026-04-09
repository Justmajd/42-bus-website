import QRCode from 'qrcode';

export async function generateQRDataUrl(token) {
  try {
    return await QRCode.toDataURL(token, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR generation error:', err);
    return null;
  }
}
