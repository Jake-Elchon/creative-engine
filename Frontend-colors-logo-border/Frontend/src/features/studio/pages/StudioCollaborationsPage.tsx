import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { apiClient } from '@/services/api';
import type { SplitCreateResponse } from '@/types/models';
import { formatBpsAsPercent, isValidUuid } from '@/utils/validation';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { isValidSplitDraft } from '../validation';
import { studioError, useStudioWorkspace } from '../workspace';

interface ShareRow {
  key: number;
  phone: string;
  bps: string;
}

export function StudioCollaborationsPage() {
  const { t } = useLanguage();
  const copy = t.studioForms;
  const [searchParams] = useSearchParams();
  const { storefront, products } = useStudioWorkspace();
  const recent = products.filter((product) => product.storefrontId === storefront?.storefrontId);
  const [productId, setProductId] = useState(searchParams.get('product') ?? recent[0]?.productId ?? '');
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState<ShareRow[]>([{ key: 0, phone: '+237', bps: '' }]);
  const [sheet, setSheet] = useState<{ productId: string; data: SplitCreateResponse | null }>();
  const [review, setReview] = useState(false);
  const [sentSignature, setSentSignature] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'send' | 'refresh' | null>(null);
  const rowKey = useRef(1);
  const inFlight = useRef(false);
  const attempts = useRef(new Map<string, string>());

  const splits = rows.map(({ phone, bps }) => ({
    phone: phone.trim(), shareBps: /^\d+$/.test(bps.trim()) ? Number(bps) : 0,
  }));
  const total = splits.reduce((sum, share) => sum + share.shareBps, 0);
  const id = productId.trim();
  const request = {
    splits: [...splits].sort((a, b) => a.phone.localeCompare(b.phone)),
    groupId: groupId.trim() || undefined,
  };
  const signature = JSON.stringify([id, request]);
  const canSubmit = isValidSplitDraft(id, splits, request.groupId);
  const selectedSheet = sheet?.productId === id ? sheet : undefined;
  const result = selectedSheet?.data;
  const statuses = {
    PENDING: t.invites.pending,
    ACCEPTED: t.invites.accepted,
    REJECTED: t.invites.rejected,
    EXPIRED: copy.shareExpired,
  } as const;

  function editRow(key: number, patch: Partial<Omit<ShareRow, 'key'>>) {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !canSubmit || sentSignature === signature) return;
    setError('');
    if (!review) {
      setReview(true);
      return;
    }
    const key = attempts.current.get(signature) ?? crypto.randomUUID();
    attempts.current.set(signature, key);
    inFlight.current = true;
    setBusy('send');
    try {
      const data = await apiClient.createSplit(id, request, key);
      setSheet({ productId: id, data });
      attempts.current.delete(signature);
      setSentSignature(signature);
      setReview(false);
    } catch (failure) {
      setError(studioError(failure, copy));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function refresh() {
    if (inFlight.current || !isValidUuid(id)) return;
    inFlight.current = true;
    setBusy('refresh');
    setError('');
    try {
      const data = await apiClient.getActiveSplit(id);
      setSheet({ productId: id, data });
      if (!data || data.invitations.some(({ status }) => status === 'REJECTED' || status === 'EXPIRED')) {
        setSentSignature((current) => current === signature ? '' : current);
      }
    } catch (failure) {
      setSheet(undefined);
      setError(studioError(failure, copy));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="studio-editor">
      <StudioPageIntro title={t.studio.collaborationsTitle} description={copy.splitIntro} />
      <form className="studio-editor__panel" onSubmit={submit}>
        <h3>{copy.splitTitle}</h3>
        <p>{copy.splitProductHint}</p>
        <fieldset className="studio-editor__fieldset" disabled={busy !== null || review}>
          <div className="studio-editor__fields">
            <Input label={copy.productId} value={productId} list="studio-split-products" onChange={(e) => { setProductId(e.target.value); setError(''); }} required />
            <datalist id="studio-split-products">
              {recent.map((product) => <option key={product.productId} value={product.productId}>{t.productTypes[product.type.code]}</option>)}
            </datalist>
            <Input label={copy.groupId} value={groupId} onChange={(e) => setGroupId(e.target.value)} />
          </div>
          {rows.map((row, index) => (
            <div className="studio-editor__fields" key={row.key}>
              <Input id={`split-phone-${row.key}`} label={`${copy.phone} ${index + 1}`} type="tel" value={row.phone}
                onChange={(e) => editRow(row.key, { phone: e.target.value })} required />
              <Input id={`split-share-${row.key}`} label={copy.basisPoints} inputMode="numeric" maxLength={5} value={row.bps}
                hint={formatBpsAsPercent(splits[index].shareBps)} onChange={(e) => editRow(row.key, { bps: e.target.value })} required />
              {rows.length > 1 && <Button variant="ghost" size="sm" onClick={() => setRows((current) => current.filter(({ key }) => key !== row.key))}>{copy.remove}</Button>}
            </div>
          ))}
          <div className="studio-editor__actions">
            <Button variant="secondary" onClick={() => {
              const key = rowKey.current++;
              setRows((current) => [...current, { key, phone: '+237', bps: '' }]);
            }}>{copy.addPerson}</Button>
            <strong>{copy.total} {total.toLocaleString()} / 10,000 ({formatBpsAsPercent(total)})</strong>
          </div>
        </fieldset>
        {!canSubmit && <p>{copy.invalidSplit}</p>}
        {review && <div className="studio-editor__review" aria-live="polite">
          <h4>{copy.reviewSplit}</h4>
          <p>{copy.reviewSplitHint}</p>
          <ul className="studio-editor__list">{request.splits.map((share) => (
            <li key={share.phone}>{share.phone} · {formatBpsAsPercent(share.shareBps)}</li>
          ))}</ul>
        </div>}
        <div className="studio-editor__actions">
          <Button type="submit" isLoading={busy === 'send'} disabled={busy !== null || !canSubmit || sentSignature === signature}>
            {review ? copy.submitSplit : copy.reviewSplit}
          </Button>
          {review
            ? <Button variant="secondary" disabled={busy !== null} onClick={() => setReview(false)}>{copy.editSplit}</Button>
            : <Button variant="secondary" isLoading={busy === 'refresh'} disabled={busy !== null || !isValidUuid(id)}
                onClick={() => void refresh()}>{copy.refreshSplit}</Button>}
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
      {selectedSheet && !result && <p role="status">{copy.noActiveSplit}</p>}
      {result && (
        <section className="studio-editor__panel" aria-live="polite">
          <h3>{result.completed ? copy.splitComplete : copy.splitPending}</h3>
          <p>{copy.productId} <code>{result.productId}</code></p>
          <code>{result.splitId}</code>
          {result.invitations.some((invitation) => invitation.status === 'PENDING') && <p>{copy.pendingDelivery}</p>}
          <ul className="studio-editor__list">
            {result.invitations.map((invite) => (
              <li key={invite.inviteId}>
                {invite.phone} · {formatBpsAsPercent(invite.shareBps)}
                <Badge variant={invite.status === 'ACCEPTED' ? 'forest' : invite.status === 'PENDING' ? 'gold' : 'neutral'}>
                  {statuses[invite.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
