import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ApiClientError } from '@/types/api';
import { apiClient } from '@/services/api';
import { CollaboratorIdentityContext, type CollaboratorIdentity } from './collaboratorIdentity';
import { SplitInvitationPage } from './pages/SplitInvitationPage';

const invitation = { inviteId: 'invite', productId: 'product', splitId: 'split', shareBps: 2500, status: 'PENDING' as const };

function renderInvitation(identity: CollaboratorIdentity) {
  return render(
    <LanguageProvider>
      <CollaboratorIdentityContext value={identity}>
        <MemoryRouter initialEntries={['/invites/invite#token=private-link']}>
          <Routes><Route path="/invites/:inviteId" element={<SplitInvitationPage />} /></Routes>
        </MemoryRouter>
      </CollaboratorIdentityContext>
    </LanguageProvider>,
  );
}

describe('split invitation decisions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the proposed share without offering decisions when verified identity is unavailable', async () => {
    vi.spyOn(apiClient, 'getSplitInvitation').mockResolvedValue(invitation);
    const decide = vi.spyOn(apiClient, 'respondToSplitInvitation');
    renderInvitation({ status: 'unavailable' });
    expect(await screen.findByText('25.00%')).toBeVisible();
    expect(screen.getByText(/verified collaborator sign-in is unavailable/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /accept split/i })).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });

  it('submits a decision only with the supplied confirmed collaborator identity', async () => {
    vi.spyOn(apiClient, 'getSplitInvitation').mockResolvedValue(invitation);
    const decide = vi.spyOn(apiClient, 'respondToSplitInvitation').mockResolvedValue({ ...invitation, status: 'ACCEPTED' });
    const session = { accessToken: 'supabase-session', phoneConfirmed: true as const };
    renderInvitation({ status: 'verified', session });

    await userEvent.click(await screen.findByRole('button', { name: /accept split/i }));
    expect(decide).toHaveBeenCalledExactlyOnceWith('invite', 'private-link', 'accept', session, expect.any(AbortSignal));
    expect(await screen.findByText('Accepted')).toBeVisible();
  });
  it('explains phone mismatch and renders the recorded decision after a conflict', async () => {
    const read = vi.spyOn(apiClient, 'getSplitInvitation').mockResolvedValueOnce(invitation)
      .mockResolvedValueOnce({ ...invitation, status: 'REJECTED' });
    vi.spyOn(apiClient, 'respondToSplitInvitation')
      .mockRejectedValueOnce(new ApiClientError({ code: 'PHONE_MISMATCH', kind: 'FORBIDDEN', status: 403, message: '' }))
      .mockRejectedValueOnce(new ApiClientError({ code: 'DECISION_ALREADY_RECORDED', kind: 'CONFLICT', status: 409, message: '' }));
    renderInvitation({ status: 'verified', session: { accessToken: 'verified', phoneConfirmed: true } });
    await userEvent.click(await screen.findByRole('button', { name: /accept split/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match the number/i);
    await userEvent.click(screen.getByRole('button', { name: /accept split/i }));
    expect(await screen.findByText('Declined')).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
