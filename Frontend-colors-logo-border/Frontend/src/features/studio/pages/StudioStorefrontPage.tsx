import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Select } from '@/components/ui/Select/Select';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { studioError, useStudioWorkspace } from '../workspace';
import { apiClient } from '@/services/api';
import type { ArtistSummary, StorefrontUpdateRequest } from '@/types/models';
import { isValidBio, isValidDisplayName, isValidStorefrontHandle, MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '@/utils/validation';

export function StudioStorefrontPage() {
  const { t } = useLanguage();
  const { clearHomeSeed } = useAuth();
  const copy = t.studioForms;
  const { storefront: selection, setStorefront, storefronts, inventory, inventoryLoading, inventoryError, loadInventory } = useStudioWorkspace();
  const [creating, setCreating] = useState(false);
  const storefront = creating ? null : selection;
  const [handle, setHandle] = useState('');
  const [name, setName] = useState(storefront?.displayName ?? '');
  const [bio, setBio] = useState(storefront?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);

  const savedName = storefront?.displayName;
  const savedBio = storefront?.bio;
  useEffect(() => {
    setName(savedName ?? '');
    setBio(savedBio ?? '');
  }, [storefront?.storefrontId, savedName, savedBio]);

  function populate(result: ArtistSummary) {
    setStorefront(result);
    setCreating(false);
    setName(result.displayName);
    setBio(result.bio ?? '');
  }


  async function save(event: FormEvent) {
    event.preventDefault();
    if (active.current || !inventory) return;
    setMessage('');
    const displayName = name.trim();
    const trimmedBio = bio.trim();
    if (!isValidDisplayName(displayName) || !isValidBio(trimmedBio) || (!storefront && !isValidStorefrontHandle(handle))) {
      return setError(copy.storeInvalid);
    }
    const changes: StorefrontUpdateRequest = {};
    if (storefront && displayName !== storefront.displayName) changes.displayName = displayName;
    if (storefront && (trimmedBio || null) !== (storefront.bio || null)) changes.bio = trimmedBio || null;
    if (storefront && Object.keys(changes).length === 0) return setError(copy.noChanges);
    active.current = true;
    setBusy(true);
    setError('');
    try {
      const result = storefront
        ? await apiClient.updateStorefront(storefront.storefrontId, changes)
        : await apiClient.createStorefront({ handle, displayName, bio: trimmedBio || undefined });
      populate(result);
      clearHomeSeed();
      setMessage(storefront ? copy.saved : copy.storeCreated);
    } catch (failure) {
      setError(studioError(failure, copy));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="studio-editor">
      <StudioPageIntro title={t.studio.storefrontTitle} description={copy.storeIntro} />
      {inventoryLoading && !inventory && <p role="status">{copy.inventoryLoading}</p>}
      {inventoryError != null && !inventory && <div role="alert">
        <p>{studioError(inventoryError, copy)}</p>
        <Button variant="secondary" onClick={() => void loadInventory()}>{t.common.retry}</Button>
      </div>}
      {storefronts.length > 0 && <div className="studio-editor__panel">
        <Select label={copy.selectStorefront} value={storefront?.storefrontId ?? ''} disabled={busy}
          options={[{ value: '', label: copy.createStore }, ...storefronts.map((item) => ({
            value: item.storefrontId, label: `${item.displayName} (@${item.handle})`,
          }))]}
          onChange={(event) => {
            const selected = storefronts.find((item) => item.storefrontId === event.target.value);
            if (selected) populate(selected);
            else { setCreating(true); setHandle(''); }
            setMessage(''); setError('');
          }} />
      </div>}
      {inventory && <form className="studio-editor__panel" onSubmit={save}>
        <h3>{storefront ? copy.editStore : copy.createStore}</h3>
        <fieldset className="studio-editor__fieldset" disabled={busy}>
          <div className="studio-editor__fields">
            <Input id="studio-store-handle" label={copy.handle} hint={copy.publicHandleHint} value={storefront?.handle ?? handle} onChange={(e) => setHandle(e.target.value)} readOnly={Boolean(storefront)} maxLength={30} required />
            <Input label={copy.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_DISPLAY_NAME_LENGTH} required />
          </div>
          <label className="zibi-field__label" htmlFor="studio-bio">{copy.bio}</label>
          <textarea id="studio-bio" className="studio-editor__bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={MAX_BIO_LENGTH} />
        </fieldset>
        <div className="studio-editor__actions">
          <Button type="submit" isLoading={busy} disabled={busy}>{storefront ? copy.save : copy.createStore}</Button>
          {storefront && <Link className="studio-editor__link" to={`/@${encodeURIComponent(storefront.handle)}`}>{copy.publicStore}</Link>}
        </div>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>}
    </div>
  );
}
