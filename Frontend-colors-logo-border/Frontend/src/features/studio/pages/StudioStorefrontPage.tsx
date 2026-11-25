import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { StudioProfilePicture } from '../components/StudioProfilePicture';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { studioError, useStudioWorkspace } from '../workspace';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary, StorefrontUpdateRequest } from '@/types/models';
import { normalizeHandle } from '@/utils/url';
import { isValidBio, isValidDisplayName, isValidStorefrontHandle, MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '@/utils/validation';

export function StudioStorefrontPage() {
  const { t } = useLanguage();
  const { clearHomeSeed } = useAuth();
  const copy = t.studioForms;
  const { storefront, setStorefront, isRestoringStorefront, updateProfileImage } = useStudioWorkspace();
  const [handle, setHandle] = useState('');
  const [knownHandle, setKnownHandle] = useState('');
  const [name, setName] = useState(storefront?.displayName ?? '');
  const [bio, setBio] = useState(storefront?.bio ?? '');
  const [busy, setBusy] = useState<'save' | 'lookup' | null>(null);
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
    setName(result.displayName);
    setBio(result.bio ?? '');
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (active.current) return;
    const normalized = normalizeHandle(knownHandle);
    setMessage('');
    if (!isValidStorefrontHandle(normalized)) return setError(copy.storeInvalid);
    active.current = true;
    setBusy('lookup');
    setError('');
    try {
      const result = await apiClient.getPublicStorefront({ handle: normalized, limit: 1 });
      populate(result.storefront);
    } catch (failure) {
      setError(studioError(failure, copy));
    } finally {
      active.current = false;
      setBusy(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (active.current) return;
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
    setBusy('save');
    setError('');
    try {
      const result = storefront
        ? await apiClient.updateStorefront(storefront.storefrontId, changes)
        : await apiClient.createStorefront({ handle, displayName, bio: trimmedBio || undefined });
      populate(result);
      clearHomeSeed();
      setMessage(storefront ? copy.saved : copy.storeCreated);
    } catch (failure) {
      if (storefront && failure instanceof ApiClientError && failure.status === 404) setStorefront(null);
      setError(studioError(failure, copy));
    } finally {
      active.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="studio-editor">
      <StudioPageIntro title={t.studio.storefrontTitle} description={copy.storeIntro} />
      {isRestoringStorefront && <p role="status">{copy.restoringStore}</p>}
      <form className="studio-editor__panel" onSubmit={lookup}>
        <h3>{copy.findStore}</h3>
        <p>{copy.findHint}</p>
        <div className="studio-editor__fields">
          <Input id="studio-known-handle" label={copy.handle} value={knownHandle} onChange={(e) => setKnownHandle(e.target.value)} maxLength={31} required />
          <Button type="submit" variant="secondary" isLoading={busy === 'lookup'} disabled={busy !== null || isRestoringStorefront}>{copy.lookup}</Button>
        </div>
      </form>
      <form className="studio-editor__panel" onSubmit={save}>
        <h3>{storefront ? copy.editStore : copy.createStore}</h3>
        <fieldset className="studio-editor__fieldset" disabled={busy !== null || isRestoringStorefront}>
          <div className="studio-editor__fields">
            <Input id="studio-store-handle" label={copy.handle} hint={copy.publicHandleHint} value={storefront?.handle ?? handle} onChange={(e) => setHandle(e.target.value)} readOnly={Boolean(storefront)} maxLength={30} required />
            <Input label={copy.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_DISPLAY_NAME_LENGTH} required />
          </div>
          <label className="zibi-field__label" htmlFor="studio-bio">{copy.bio}</label>
          <textarea id="studio-bio" className="studio-editor__bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={MAX_BIO_LENGTH} />
        </fieldset>
        <div className="studio-editor__actions">
          <Button type="submit" isLoading={busy === 'save'} disabled={busy !== null || isRestoringStorefront}>{storefront ? copy.save : copy.createStore}</Button>
          {storefront && <Link className="studio-editor__link" to={`/@${encodeURIComponent(storefront.handle)}`}>{copy.publicStore}</Link>}
          {storefront && <Button variant="ghost" disabled={busy !== null || isRestoringStorefront} onClick={() => {
            setStorefront(null); setHandle(''); setName(''); setBio(''); setMessage(''); setError('');
          }}>{copy.createStore}</Button>}
        </div>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
      {storefront && <StudioProfilePicture key={storefront.storefrontId} storefront={storefront}
        disabled={busy !== null} onSave={(profile) => {
          updateProfileImage(profile);
          clearHomeSeed();
        }} />}
    </div>
  );
}
