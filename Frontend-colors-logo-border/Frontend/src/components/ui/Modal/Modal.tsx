import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { X } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import './Modal.css';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const { t } = useLanguage();

  const dialog = useDialogFocus<HTMLDivElement>(isOpen, onClose);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="zibi-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialog} className="zibi-modal zibi-view-enter" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="zibi-modal__header">
          <h2 className="zibi-modal__title">{title}</h2>
          <button
            type="button"
            data-dialog-initial
            className="zibi-modal__close"
            onClick={onClose}
            aria-label={t.common.close}
          >
            <X size={20} />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
