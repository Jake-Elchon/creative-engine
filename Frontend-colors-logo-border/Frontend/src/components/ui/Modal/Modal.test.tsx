import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { Modal } from './Modal';

function DialogExample() {
  const [open, setOpen] = useState(false);
  return <LanguageProvider>
    <button type="button" onClick={() => setOpen(true)}>Open example</button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Example">
      <button type="button">Final option</button>
    </Modal>
  </LanguageProvider>;
}

describe('Modal keyboard navigation', () => {
  it('portals into the viewport, traps focus and restores it on Escape', async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    const trigger = screen.getByRole('button', { name: 'Open example' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Example' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Final option' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
