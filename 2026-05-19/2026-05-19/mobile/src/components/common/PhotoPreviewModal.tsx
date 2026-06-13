import { useEffect, useRef } from 'react';

interface Props {
  visible: boolean;
  photoUri: string | null;
  timestamp?: number;
  latitude?: number | null;
  longitude?: number | null;
  onAccept: () => void;
  onRetake: () => void;
  title?: string;
  customerCode?: string;
  customerName?: string;
}

// Per UX requirement, the "Use Photo / Retake" intermediate step has been
// removed across the app. When this modal would normally appear after a
// camera capture, we now immediately invoke onAccept so the captured photo
// flows straight into the form's accepted state. The user can re-take by
// tapping the delete icon on the resulting thumbnail.
//
// Keeping the component as a thin shim instead of removing it across every
// caller avoids touching CustomerVisitScreen / CustomerDashboardScreen /
// StartDayScreen — they continue to set their preview-visible flag, the
// shim auto-accepts the moment that flag flips true.
export default function PhotoPreviewModal({ visible, photoUri, onAccept }: Props) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (visible && photoUri && !firedRef.current) {
      firedRef.current = true;
      onAccept();
    }
    if (!visible) firedRef.current = false;
  }, [visible, photoUri, onAccept]);

  return null;
}
