import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Select } from '@/components/ui/Select/Select';
import { ProductVideo } from '@/components/media/ProductVideo';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { PRODUCT_TYPES } from '@/config/productTypes';
import { apiClient } from '@/services/api';
import type { CreatedProduct, ProductPrice, ProductTypeCode } from '@/types/models';
import { formatMoney } from '@/utils/currency';
import { isValidUuid, MAX_PRODUCT_DESC_LENGTH } from '@/utils/validation';
import { StudioPageIntro } from '../components/StudioPageIntro';
import { AUDIO_ACCEPT, VIDEO_ACCEPT, buildPriceReplacement, isValidProductDraft } from '../validation';
import { studioError, useStudioWorkspace } from '../workspace';

function CreatedProductMedia({ product }: { product: CreatedProduct }) {
  const { t } = useLanguage();
  const copy = t.studioForms;
  const [media, setMedia] = useState<{ kind: 'audio' | 'video'; url: string } | null>(null);
  const [loading, setLoading] = useState<'audio' | 'video' | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  async function load(kind: 'video' | 'audio') {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(kind);
    setError('');
    try {
      const blob = await apiClient.getProductMedia(product.productId, kind, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setMedia({ kind, url: objectUrl.current });
    } catch (failure) {
      if (!controller.signal.aborted) setError(studioError(failure, copy));
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(null);
      }
    }
  }

  return (
    <div className="studio-editor__media">
      {product.videoUrl && <>
        <Button variant="secondary" onClick={() => void load('video')} disabled={loading !== null} isLoading={loading === 'video'}>{copy.previewVideo}</Button>
      </>}
      {product.audioUrl && <>
        <Button variant="secondary" onClick={() => void load('audio')} disabled={loading !== null} isLoading={loading === 'audio'}>{copy.previewAudio}</Button>
      </>}
      {media?.kind === 'video' && <ProductVideo src={media.url} preload="metadata" label={copy.previewVideo} errorLabel={t.storefront.videoError} />}
      {media?.kind === 'audio' && <audio src={media.url} controls preload="metadata" aria-label={copy.previewAudio} />}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function StudioProductsPage() {
  const { locale, t } = useLanguage();
  const copy = t.studioForms;
  const { storefront, isRestoringStorefront, products, recordProduct } = useStudioWorkspace();
  const [typeCode, setTypeCode] = useState<ProductTypeCode>('release');
  const [description, setDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File>();
  const [videoPreviewFile, setVideoPreviewFile] = useState<File>();
  const [audioFile, setAudioFile] = useState<File>();
  const [productId, setProductId] = useState(products.find((p) => p.storefrontId === storefront?.storefrontId)?.productId ?? '');
  const [xaf, setXaf] = useState('');
  const [currency, setCurrency] = useState<'' | 'EUR' | 'USD'>('');
  const [cents, setCents] = useState('');
  const [priceSets, setPriceSets] = useState<Record<string, ProductPrice[]>>({});
  const [createdProduct, setCreatedProduct] = useState<CreatedProduct>();
  const [savedId, setSavedId] = useState('');
  const [createError, setCreateError] = useState('');
  const [priceError, setPriceError] = useState('');
  const [loading, setLoading] = useState<'product' | 'prices' | null>(null);
  const inFlight = useRef(false);

  function selectProduct(id: string) {
    const prices = priceSets[id.trim()] ?? [];
    const local = prices.find((p) => p.currencyCode === 'XAF');
    const diaspora = prices.find((p) => p.currencyCode !== 'XAF');
    setProductId(id);
    setXaf(local?.amountMinor.toString() ?? '');
    setCurrency(diaspora?.currencyCode === 'EUR' || diaspora?.currencyCode === 'USD' ? diaspora.currencyCode : '');
    setCents(diaspora?.amountMinor.toString() ?? '');
    setPriceError('');
    setSavedId('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storefront || inFlight.current) return;
    const form = event.currentTarget;
    setCreatedProduct(undefined);
    const request = { typeCode, description: description.trim() || undefined, videoFile, audioFile, videoPreviewFile };
    if (!isValidProductDraft(request)) return setCreateError(copy.badMedia);
    inFlight.current = true;
    setCreateError('');
    setLoading('product');
    try {
      const result = await apiClient.createProduct(storefront.storefrontId, request);
      recordProduct(result);
      selectProduct(result.productId);
      setCreatedProduct(result);
      setDescription('');
      setVideoFile(undefined);
      setAudioFile(undefined);
      setVideoPreviewFile(undefined);
      form.reset();
    } catch (failure) {
      setCreateError(studioError(failure, copy));
    } finally {
      inFlight.current = false;
      setLoading(null);
    }
  }

  async function savePrices(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setSavedId('');
    const id = productId.trim();
    const replacement = buildPriceReplacement(xaf, currency, cents);
    if (!isValidUuid(id) || !replacement) return setPriceError(copy.invalidPrices);
    inFlight.current = true;
    setLoading('prices');
    setPriceError('');
    try {
      const result = await apiClient.replacePrices(id, replacement);
      setPriceSets((current) => ({ ...current, [result.productId]: result.prices }));
      setSavedId(result.productId);
    } catch (failure) {
      setPriceError(studioError(failure, copy));
    } finally {
      inFlight.current = false;
      setLoading(null);
    }
  }

  const recent = products.filter((product) => product.storefrontId === storefront?.storefrontId);
  const currentProduct = recent.find((product) => product.productId === productId.trim());

  const suggestedPrices = priceSets[productId.trim()];

  return (
    <div className="studio-editor">
      <StudioPageIntro title={t.studio.productsTitle} description={copy.productIntro} />
      {isRestoringStorefront ? <p role="status">{copy.restoringStore}</p> : storefront ? (
        <form className="studio-editor__panel" onSubmit={create}>
          <h3>{copy.createProduct}</h3>
          <p>{storefront.displayName}</p>
          <fieldset className="studio-editor__fieldset" disabled={loading !== null}>
            <div className="studio-editor__fields">
              <Select label={copy.productType} options={PRODUCT_TYPES.map((code) => ({ value: code, label: t.productTypes[code] }))} value={typeCode} onChange={(e) => setTypeCode(e.target.value as ProductTypeCode)} />
              <Input label={copy.description} maxLength={MAX_PRODUCT_DESC_LENGTH} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="studio-editor__fields">
              <Input label={copy.video} type="file" accept={VIDEO_ACCEPT} onChange={(e) => setVideoFile(e.target.files?.[0])} />
              <Input label={copy.audio} type="file" accept={AUDIO_ACCEPT} onChange={(e) => setAudioFile(e.target.files?.[0])} />
            </div>
            <p>{copy.mediaHint}</p>
            <Input label={copy.publicPreview} type="file" accept={VIDEO_ACCEPT} hint={copy.publicPreviewHint}
              onChange={(e) => setVideoPreviewFile(e.target.files?.[0])} />
          </fieldset>
          <Button type="submit" isLoading={loading === 'product'} disabled={loading !== null}>{copy.createProduct}</Button>
          {createError && <p role="alert">{createError}</p>}
          {createdProduct?.storefrontId === storefront.storefrontId && <>
            <p role="status">{copy.createdProduct}</p>
            <Link className="studio-editor__link" to={`/studio/collaborations?product=${createdProduct.productId}`}>{copy.configureSplit}</Link>
          </>}
        </form>
      ) : (
        <EmptyState title={copy.chooseStore} action={<Link className="studio-editor__link" to="/studio/storefront">{t.studio.storefrontNav}</Link>} />
      )}
      {recent.length > 0 && <section className="studio-editor__panel">
        <h3>{copy.createdInSession}</h3>
        <p>{copy.recentHint}</p>
        <ul className="studio-editor__list">{recent.map((product) => (
          <li key={product.productId}>
            <Button variant="secondary" size="sm" onClick={() => selectProduct(product.productId)} disabled={loading !== null}>
              {t.productTypes[product.type.code]}
            </Button>
            <code>{product.productId}</code>
          </li>
        ))}</ul>
        {currentProduct && <>
          {currentProduct.description && <p>{currentProduct.description}</p>}
          <Link className="studio-editor__link" to={`/studio/collaborations?product=${currentProduct.productId}`}>{copy.configureSplit}</Link>
          <CreatedProductMedia key={currentProduct.productId} product={currentProduct} />
        </>}
      </section>}
      <form className="studio-editor__panel" onSubmit={savePrices}>
        <h3>{copy.prices}</h3>
        <p>{copy.priceKnownProduct}</p>
        <p>{copy.priceHint}</p>
        <fieldset className="studio-editor__fieldset" disabled={loading !== null}>
          <Input label={copy.productId} value={productId} list="studio-price-products" onChange={(e) => selectProduct(e.target.value)} required />
          <datalist id="studio-price-products">
            {recent.map((product) => <option key={product.productId} value={product.productId}>{t.productTypes[product.type.code]}</option>)}
          </datalist>
          <div className="studio-editor__fields">
            <Input label={copy.xaf} inputMode="numeric" value={xaf} onChange={(e) => setXaf(e.target.value)} required />
            <Select label={copy.diaspora} value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}
              options={[{ value: '', label: copy.none }, { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }]} />
            {currency && <Input label={copy.cents} inputMode="numeric" value={cents} onChange={(e) => setCents(e.target.value)} required />}
          </div>
        </fieldset>
        <Button type="submit" isLoading={loading === 'prices'} disabled={loading !== null}>{copy.savePrices}</Button>
        {priceError && <p role="alert">{priceError}</p>}
        {savedId && <p role="status">{copy.savedPrices}</p>}
        {Boolean(suggestedPrices?.length) && <ul className="studio-editor__list">
          {suggestedPrices?.map((price) => <li key={price.priceId}>{formatMoney(price.amountMinor, price.currencyCode, locale)}</li>)}
        </ul>}
      </form>
    </div>
  );
}
