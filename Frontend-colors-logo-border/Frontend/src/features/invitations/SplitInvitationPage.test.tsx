import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
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
    expect(decide).toHaveBeenCalledExactlyOnceWith('invite', 'private-link', 'accept', session);
    expect(await screen.findByText('Accepted')).toBeVisible();
  });
});
