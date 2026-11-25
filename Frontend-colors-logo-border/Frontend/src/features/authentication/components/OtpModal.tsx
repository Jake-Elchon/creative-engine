import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Modal } from '@/components/ui/Modal/Modal';
import { useOtpAuth } from '../hooks/useOtpAuth';
import { OtpForm } from './OtpForm';

export function OtpModal() {
  const { isAuthModalOpen, closeAuthModal } = useAuth();
  const { t } = useLanguage();

  return isAuthModalOpen ? <ReauthenticationDialog close={closeAuthModal} title={t.auth.modalTitle} /> : null;
}

function ReauthenticationDialog({ close, title }: { close: () => void; title: string }) {
  const auth = useOtpAuth(close);
  return (
    <Modal isOpen onClose={() => { if (!auth.pending) close(); }} title={title}>
      <OtpForm auth={auth} />
    </Modal>
  );
}
