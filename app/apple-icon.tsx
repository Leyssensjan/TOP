import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The thread motif, so the home screen icon matches the app. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0e1621',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 22, background: '#e9a648' }} />
          <div style={{ width: 6, height: 20, background: '#e9a648' }} />
          <div style={{ width: 30, height: 30, borderRadius: 30, background: '#e9a648' }} />
          <div style={{ width: 6, height: 20, background: '#24324a' }} />
          <div style={{ width: 16, height: 16, borderRadius: 16, background: '#24324a' }} />
        </div>
      </div>
    ),
    size,
  );
}
