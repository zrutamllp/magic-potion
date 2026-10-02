import { lazy, Suspense } from 'react';
import { PlayerApp } from './player/PlayerApp';
import { StaffApp } from './staff/StaffApp';

// The public connection check, loaded only when opened.
const CheckPage = lazy(() => import('./check/CheckPage').then((m) => ({ default: m.CheckPage })));

// The player app at /, the staff panel, live dashboard and projector at /staff, and the public
// connection check at /check.
export function App() {
  const path = window.location.pathname;
  if (path === '/check' || path === '/check/') {
    return (
      <Suspense fallback={null}>
        <CheckPage />
      </Suspense>
    );
  }
  if (path.startsWith('/staff')) return <StaffApp />;
  return <PlayerApp />;
}
