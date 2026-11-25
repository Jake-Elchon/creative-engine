import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { OwnedProduct, SplitCreateResponse } from '@/types/models';
import type { StudioWorkspace } from '../workspace';
import { StudioCollaborationsPage } from './StudioCollaborationsPage';

const productId = '11111111-1111-1111-1111-111111111111';
const otherId = '22222222-2222-2222-2222-222222222222';
const phone = '+237677000001';
const saved: SplitCreateResponse = {
  productId, splitId: 'sheet', groupId: null, completed: false,
  invitations: [{ inviteId: 'invite', phone, shareBps: 10000, status: 'PENDING', collaboratorId: null }],
};

function open() {
  const product: OwnedProduct = {
    productId, storefrontId: 'store', description: 'My recording',
    type: { id: 'video', code: 'video', name: 'Video' }, prices: [], videoUrl: null, audioUrl: null,
  };
  const workspace: StudioWorkspace = {
    storefront: null, storefronts: [], setStorefront: vi.fn(),
    inventory: { storefronts: [], products: [product, { ...product, productId: otherId, description: 'Other work' }], nextCursor: null },
    inventoryError: null, inventoryLoading: false, loadInventory: vi.fn(),
    recordProduct: vi.fn(), recordPrices: vi.fn(),
  };
  render(<LanguageProvider>
    <MemoryRouter initialEntries={[`/studio/collaborations?product=${productId}`]}>
      <Routes><Route path="/studio" element={<Outlet context={workspace} />}>
        <Route path="collaborations" element={<StudioCollaborationsPage />} />
      </Route></Routes>
    </MemoryRouter>
  </LanguageProvider>);
}

afterEach(() => vi.restoreAllMocks());

it('checks the active sheet, shows the remainder, and requires review before sending', async () => {
  const user = userEvent.setup();
  const create = vi.spyOn(apiClient, 'createSplit').mockResolvedValue(saved);
  const current = vi.spyOn(apiClient, 'getActiveSplit').mockResolvedValueOnce(null).mockResolvedValue(saved);
  open();

  expect(await screen.findByText('This product has no active split sheet.')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Select a product' })).toHaveValue(productId);
  await user.clear(screen.getByLabelText('Collaborator phone 1'));
  await user.type(screen.getByLabelText('Collaborator phone 1'), '+237 677 000 001');
  const share = screen.getByLabelText('Basis points');
  await user.type(share, '9999');
  expect(screen.getByRole('status')).toHaveTextContent('Unallocated 0.01%');
  expect(screen.getByRole('button', { name: 'Review allocation' })).toBeDisabled();
  await user.clear(share);
  await user.type(share, '10000');

  await user.click(screen.getByRole('button', { name: 'Review allocation' }));
  expect(create).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Save split sheet and queue invitations' }));
  expect(create).toHaveBeenCalledWith(productId, { splits: [{ phone, shareBps: 10000 }] }, expect.any(String), null);
  expect(await screen.findByText('Awaiting decision')).toBeVisible();
  expect(screen.queryByText('All shares accepted')).not.toBeInTheDocument();
  expect(current).toHaveBeenCalledWith(productId, expect.any(AbortSignal));
});

it('reloads a concurrent replacement and switches to the selected product', async () => {
  const user = userEvent.setup();
  const rejected: SplitCreateResponse = {
    ...saved, invitations: saved.invitations.map((invite) => ({ ...invite, status: 'REJECTED' })),
  };
  const current = vi.spyOn(apiClient, 'getActiveSplit')
    .mockResolvedValueOnce(rejected).mockResolvedValueOnce({ ...saved, splitId: 'newer' }).mockResolvedValueOnce(null);
  const create = vi.spyOn(apiClient, 'createSplit').mockRejectedValue(new ApiClientError({
    code: 'SPLIT_VERSION_CHANGED', status: 412, kind: 'VALIDATION_ERROR', message: '',
  }));
  open();
  expect(await screen.findByText('Declined')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Replace agreement' }));
  await user.click(screen.getByRole('button', { name: 'Review allocation' }));
  await user.click(screen.getByRole('button', { name: 'Save split sheet and queue invitations' }));
  expect(create).toHaveBeenCalledWith(productId, expect.any(Object), expect.any(String), 'sheet');
  expect(await screen.findByText('Awaiting decision')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(/agreement changed/i);

  await user.selectOptions(screen.getByRole('combobox', { name: 'Select a product' }), otherId);
  expect(await screen.findByText('This product has no active split sheet.')).toBeVisible();
  expect(current).toHaveBeenLastCalledWith(otherId, expect.any(AbortSignal));
  expect(screen.queryByText('Awaiting decision')).not.toBeInTheDocument();
});
