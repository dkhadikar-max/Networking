import type { LinkPreview } from '@/lib/types';

export default function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview"
      onClick={e => e.stopPropagation()}
    >
      {preview.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          className="link-preview-img"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="link-preview-body">
        <div className="link-preview-domain">{preview.domain}</div>
        {preview.title && <div className="link-preview-title">{preview.title}</div>}
        {preview.description && <div className="link-preview-desc">{preview.description}</div>}
      </div>
    </a>
  );
}
