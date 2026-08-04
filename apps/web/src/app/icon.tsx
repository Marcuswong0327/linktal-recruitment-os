import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Matches the "L" mark used in the sidebar logo and command palette footer.
// #4327cc is an sRGB approximation of --primary (oklch(0.438 0.234 278)) —
// ImageResponse/Satori doesn't support the oklch() color function.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#4327cc',
          borderRadius: 8,
          color: '#ffffff',
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
