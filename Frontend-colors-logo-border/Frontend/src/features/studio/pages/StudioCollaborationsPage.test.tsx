import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { apiClient } from '@/services/api';
import type { SplitCreateResponse } from '@/types/models';
import type { StudioWorkspace } from '../workspace';
import { StudioCollaborationsPage } from './StudioCollaborationsPage';

const productId = '11111111-1111-1111-1111-111111111111';
const phone = '+237677000001';

afterEach(() => vi.restoreAllMocks());

it('requires review before creating invitations and refreshes actual server decisions', async () => {
  const user = userEvent.setup();
  const workspace: StudioWorkspace = {
    storefront: null,
    isRestoringStorefront: false,
    products: [],
    setStorefront: vi.fn(),
    updateProfileImage: vi.fn(),
    recordProduct: vi.fn(),
  };
  const saved: SplitCreateResponse = {
    productId, splitId: 'sheet', groupId: null, completed: false,
    invitations: [{ inviteId: 'invite', phone, shareBps: 10000, status: 'PENDING', collaboratorId: null }],
  };
  const create = vi.spyOn(apiClient, 'createSplit').mockResolvedValue(saved);
  const current = vi.spyOn(apiClient, 'getActiveSplit').mockResolvedValue({
    ...saved, invitations: saved.invitations.map((invite) => ({ ...invite, status: 'REJECTED' })),
  });
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/studio/collaborations?product=${productId}`]}>
        <Routes>
          <Route path="/studio" element={<Outlet context={workspace} />}>
            <Route path="collaborations" element={<StudioCollaborationsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

  expect(screen.getByLabelText('Product ID')).toHaveValue(productId);
  await user.clear(screen.getByLabelText('Collaborator phone 1'));
  await user.type(screen.getByLabelText('Collaborator phone 1'), phone);
  const share = screen.getByLabelText('Basis points');
  await user.type(share, '9999');
  expect(screen.getByRole('button', { name: 'Review allocation' })).toBeDisabled();
  await user.clear(share);
  await user.type(share, '10000');
  expect(share).toHaveAccessibleDescription('100.00%');

  await user.click(screen.getByRole('button', { name: 'Review allocation' }));
  expect(create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save split sheet and queue invitations' }));
  expect(create).toHaveBeenCalledWith(productId, { splits: [{ phone, shareBps: 10000 }] }, expect.any(String));
  expect(await screen.findByText('Awaiting decision')).toBeVisible();
  expect(screen.queryByText('All shares accepted')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review allocation' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Check agreement status' }));
  expect(current).toHaveBeenCalledWith(productId);
  expect(await screen.findByText('Declined')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Review allocation' }));
  await user.click(screen.getByRole('button', { name: 'Save split sheet and queue invitations' }));
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][2]).not.toBe(create.mock.calls[0][2]);
});
