import { useEffect, useState } from "react";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

/** One read-only evidence file: a thumbnail (for images, fetched via a
 *  signed URL) or a generic file icon, plus a Download action. Shared by
 *  every place that shows already-submitted evidence (StepPreview,
 *  SessionLog) -- the *uploading* counterpart is EvidenceList. */
export default function EvidenceRow({
  path,
  onDownload,
  getPreviewUrl,
}: {
  path: string;
  onDownload: (path: string) => void;
  getPreviewUrl: (path: string) => Promise<string>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImagePath(path)) return;
    let cancelled = false;
    getPreviewUrl(path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div className="flex items-center justify-between gap-2 text-[12px] text-text-2">
      <span className="flex items-center gap-1.5 min-w-0">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-6 h-6 rounded-[4px] object-cover shrink-0 border border-border" />
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0">
            <path d="M12 3v13" />
            <path d="M7 8l5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
        )}
        <span className="truncate">{path.split("/").pop()}</span>
      </span>
      <button
        type="button"
        onClick={() => onDownload(path)}
        className="flex items-center gap-1.5 text-accent font-semibold cursor-pointer shrink-0"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 3v13" />
          <path d="M17 11l-5 5-5-5" />
          <path d="M5 21h14" />
        </svg>
        Download
      </button>
    </div>
  );
}
