import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Select } from '@/components/ui/Select/Select';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { OwnedProduct, SplitCreateResponse } from '@/types/models';
import { formatBpsAsPercent, isValidUuid, TOTAL_SPLIT_BPS } from '@/utils/validation';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { isValidSplitDraft } from '../validation';
import { studioError, useOwnedProduct, useStudioWorkspace } from '../workspace';

interface ShareRow { key: number; phone: string; bps: string }
type Snapshot = { sheet: SplitCreateResponse | null } | { error: unknown };

export function StudioCollaborationsPage() {
  const { t } = useLanguage();
  const copy = t.studioForms;
  const [searchParams, setSearchParams] = useSearchParams();
  const { inventory, inventoryError, inventoryLoading, loadInventory } = useStudioWorkspace();
  const products = inventory?.products ?? [];
  const id = searchParams.get('product') ?? products[0]?.productId ?? '';
  const selection = useOwnedProduct(id, inventory);
  const target = selection.product;
  const productStore = inventory?.storefronts.find(({ storefrontId }) => storefrontId === target?.storefrontId);
  const labelFor = (product: OwnedProduct) => {
    const storefront = inventory?.storefronts.find(({ storefrontId }) => storefrontId === product.storefrontId);
    const type = t.productTypes[product.type.code];
    const description = product.description && product.description.length > 50
      ? `${product.description.slice(0, 50).trimEnd()}…` : product.description;
    return [type, storefront && `@${storefront.handle}`, description].filter(Boolean).join(' · ');
  };
  const options = products.map((product) => ({ value: product.productId, label: labelFor(product) }));
  if (id && !options.some(({ value }) => value === id)) {
    options.unshift({ value: id, label: target ? labelFor(target) : id });
  }

  return (
    <div className="studio-editor">
      <StudioPageIntro title={t.studio.collaborationsTitle} description={copy.splitIntro} />
      <section className="studio-editor__panel" aria-label={copy.chooseProduct}>
        {options.length > 0 && <Select label={copy.chooseProduct} value={id} options={options} onChange={(event) => {
          setSearchParams({ product: event.target.value }, { replace: true });
        }} />}
        {(selection.loading || (inventoryLoading && !inventory)) && <p role="status">{t.common.loading}</p>}
        {id && !isValidUuid(id) && <p role="alert">{copy.unavailable}</p>}
        {selection.error != null && <div role="alert">
          <p>{studioError(selection.error, copy)}</p>
          <Button variant="secondary" size="sm" onClick={selection.retry}>{t.common.retry}</Button>
        </div>}
        {inventoryError != null && <p role="alert">{studioError(inventoryError, copy)}</p>}
        {inventory && !products.length && !target && !selection.loading && <p>{copy.noOwnedProducts}</p>}
        <div className="studio-editor__actions">
          <Link className="studio-editor__link" to="/studio/products">{copy.createProduct}</Link>
          {inventory?.nextCursor && <Button variant="secondary" isLoading={inventoryLoading}
            onClick={() => void loadInventory(inventory.nextCursor ?? undefined)}>{t.common.loadMore}</Button>}
          {!inventory && inventoryError != null && <Button variant="secondary" onClick={() => void loadInventory()}>{t.common.retry}</Button>}
        </div>
      </section>
      {target && <SplitEditor key={target.productId} product={target} handle={productStore?.handle} />}
    </div>
  );
}

function SplitEditor({ product, handle }: { product: OwnedProduct; handle?: string }) {
  const { t } = useLanguage();
  const copy = t.studioForms;
  const id = product.productId;
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<ShareRow[]>([{ key: 0, phone: '+237', bps: '' }]);
  const [groupId, setGroupId] = useState('');
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const rowKey = useRef(1);
  const inFlight = useRef(false);
  const latestAttempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiClient.getActiveSplit(id, controller.signal).then((sheet) => {
      if (!controller.signal.aborted) setSnapshot({ sheet });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setSnapshot({ error: failure });
    });
    return () => controller.abort();
  }, [id, revision]);

  const ready = snapshot && 'sheet' in snapshot;
  const sheet = ready ? snapshot.sheet : null;
  const showDraft = ready && (!sheet || editing);
  const splits = rows.map(({ phone, bps }) => ({
    phone: phone.replace(/[\s()-]/g, ''), shareBps: /^\d+$/.test(bps) ? Number(bps) : 0,
  })).sort((a, b) => a.phone.localeCompare(b.phone));
  const request = { splits, groupId: groupId.trim() || undefined };
  const total = splits.reduce((sum, share) => sum + share.shareBps, 0);
  const difference = TOTAL_SPLIT_BPS - total;
  const replaceable = sheet?.invitations.some(({ status }) => status === 'REJECTED' || status === 'EXPIRED');
  const unchanged = Boolean(sheet && !replaceable && (request.groupId ?? null) === sheet.groupId &&
    splits.length === sheet.invitations.length && splits.every((share) => sheet.invitations.some(
      (invite) => invite.phone === share.phone && invite.shareBps === share.shareBps,
    )));
  const valid = isValidSplitDraft(id, splits, request.groupId);
  const statuses = { PENDING: t.invites.pending, ACCEPTED: t.invites.accepted, REJECTED: t.invites.rejected, EXPIRED: copy.shareExpired };

  function reload() {
    setSnapshot(undefined);
    setEditing(false);
    setReview(false);
    setError('');
    setRevision((value) => value + 1);
  }

  function patchRow(key: number, patch: Partial<Omit<ShareRow, 'key'>>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  function replace() {
    if (!sheet) return;
    setRows(sheet.invitations.map((invite) => ({ key: rowKey.current++, phone: invite.phone, bps: String(invite.shareBps) })));
    setGroupId(sheet.groupId ?? '');
    setEditing(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !showDraft || !valid || unchanged) return;
    setError('');
    if (!review) {
      setReview(true);
      return;
    }

    const expected = sheet?.splitId ?? null;
    const signature = JSON.stringify([expected, request]);
    const key = latestAttempt.current?.signature === signature ? latestAttempt.current.key : crypto.randomUUID();
    latestAttempt.current = { signature, key };
    inFlight.current = true;
    setSaving(true);
    try {
      const recorded = await apiClient.createSplit(id, request, key, expected);
      setSnapshot({ sheet: recorded });
      setReview(false);
      setEditing(false);
      latestAttempt.current = null;
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(studioError(failure, copy));
      if (failure instanceof ApiClientError && failure.code === 'SPLIT_VERSION_CHANGED') {
        setReview(false);
        setEditing(false);
        setSnapshot(undefined);
        setRevision((value) => value + 1);
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <>
    <section className="studio-editor__panel" aria-live="polite">
      <h3>{copy.agreementStatus}</h3>
      <strong>{product.description || t.productTypes[product.type.code]} {handle && ` · @${handle}`}</strong>
      <p>{copy.productId} <code>{id}</code></p>
      {!snapshot && <p role="status">{t.common.loading}</p>}
      {snapshot && 'error' in snapshot && <p role="alert">{studioError(snapshot.error, copy)}</p>}
      {ready && !sheet && <p>{copy.noActiveSplit}</p>}
      {sheet && <>
        <p>{sheet.completed ? copy.splitComplete : copy.splitPending}</p>
        {sheet.invitations.some(({ status }) => status === 'PENDING') && <p>{copy.pendingDelivery}</p>}
        <ul className="studio-editor__list">{sheet.invitations.map((invite) => (
          <li key={invite.inviteId}>
            {invite.phone} · {formatBpsAsPercent(invite.shareBps)}
            <Badge variant={invite.status === 'ACCEPTED' ? 'forest' : invite.status === 'PENDING' ? 'gold' : 'neutral'}>
              {statuses[invite.status]}
            </Badge>
          </li>
        ))}</ul>
      </>}
      {snapshot && <div className="studio-editor__actions">
        <Button variant="secondary" disabled={saving || editing || review} onClick={reload}>
          {'error' in snapshot ? t.common.retry : copy.refreshSplit}
        </Button>
        {sheet && !editing && <Button variant="ghost" disabled={saving} onClick={replace}>{copy.replaceSplit}</Button>}
      </div>}
      {error && !showDraft && <p role="alert">{error}</p>}
    </section>

    {showDraft && <form className="studio-editor__panel" onSubmit={submit}>
      <h3>{review ? copy.reviewSplit : sheet ? copy.replaceSplit : copy.splitTitle}</h3>
      {sheet && <p>{copy.replaceSplitHint}</p>}
      <fieldset className="studio-editor__fieldset" disabled={saving || review}>
        {rows.map((row, index) => (
          <div className="studio-editor__fields" key={row.key}>
            <Input id={`split-phone-${row.key}`} label={`${copy.phone} ${index + 1}`} type="tel" value={row.phone}
              onChange={(e) => patchRow(row.key, { phone: e.target.value })} required />
            <Input id={`split-share-${row.key}`} label={copy.basisPoints} inputMode="numeric" maxLength={5} value={row.bps}
              hint={formatBpsAsPercent(Number(row.bps) || 0)} onChange={(e) => patchRow(row.key, { bps: e.target.value })} required />
            {rows.length > 1 && <Button variant="ghost" size="sm"
              onClick={() => setRows((current) => current.filter(({ key }) => key !== row.key))}>{copy.remove}</Button>}
          </div>
        ))}
        <Input label={copy.groupId} value={groupId} onChange={(e) => setGroupId(e.target.value)} />
        <Button variant="secondary" onClick={() => {
          const key = rowKey.current++;
          setRows((current) => [...current, { key, phone: '+237', bps: '' }]);
        }}>{copy.addPerson}</Button>
      </fieldset>
      <p role="status"><strong>{copy.total} {formatBpsAsPercent(total)}</strong> · {
        difference < 0 ? copy.overAllocated : copy.unallocated
      } {formatBpsAsPercent(Math.abs(difference))}</p>
      {!valid && <p>{copy.invalidSplit}</p>}
      {unchanged && <p>{copy.splitUnchanged}</p>}
      {review && <div className="studio-editor__review" aria-live="polite">
        <p>{copy.reviewSplitHint}</p>
        <ul className="studio-editor__list">{splits.map((share) => (
          <li key={share.phone}>{share.phone} · {formatBpsAsPercent(share.shareBps)}</li>
        ))}</ul>
      </div>}
      <div className="studio-editor__actions">
        <Button type="submit" isLoading={saving} disabled={saving || !valid || unchanged}>
          {review ? copy.submitSplit : copy.reviewSplit}
        </Button>
        {review && <Button variant="secondary" disabled={saving} onClick={() => setReview(false)}>{copy.editSplit}</Button>}
        {sheet && !review && <Button variant="ghost" onClick={() => { setEditing(false); setError(''); }}>{t.common.cancel}</Button>}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>}
  </>;
}
