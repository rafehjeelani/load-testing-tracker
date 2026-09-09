import { useEffect, useRef, useState } from "react";
import { MAX_EVIDENCE_FILES, MAX_EVIDENCE_FILE_SIZE_MB } from "../types";

const MAX_EVIDENCE_FILE_SIZE_BYTES = MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);

function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

interface Props {
  paths: string[];
  onAdd: (path: string) => void;
  onRemove: (path: string) => void;
  onUpload: (file: File) => Promise<string>;
  /** Shown as "(required)" in red when there are zero files yet. */
  required?: boolean;
  /** When provided, each existing file gets a "Download" action. */
  onDownload?: (path: string) => Promise<void>;
  /** When provided, image files get a thumbnail preview fetched via this (e.g. a signed URL). Not needed for files just uploaded this session -- those preview instantly from the local file. */
  getPreviewUrl?: (path: string) => Promise<string>;
}

export default function EvidenceList({
  paths,
  onAdd,
  onRemove,
  onUpload,
  required,
  onDownload,
  getPreviewUrl,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (file.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
      setUploadError(
        `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB, which is over the ${MAX_EVIDENCE_FILE_SIZE_MB}MB limit. Pick a smaller file.`,
      );
      return;
    }
    // file.type is sometimes empty for images depending on OS/browser, so
    // fall back to checking the extension rather than skipping the preview.
    const isImage = file.type.startsWith("image/") || isImagePath(file.name);
    setUploading(true);
    try {
      const path = await onUpload(file);
      if (isImage) {
        setPreviewUrls((prev) => ({ ...prev, [path]: URL.createObjectURL(file) }));
      }
      onAdd(path);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't upload that file. Try again.");
    } finally {
      setUploading(false);
    }
  }

  // Fetch a signed preview for images that were already saved in a previous
  // session (no local object URL for those) -- only when the caller can
  // produce one (staff views, which can request signed URLs).
  useEffect(() => {
    if (!getPreviewUrl) return;
    const missing = paths.filter((p) => isImagePath(p) && !(p in previewUrls));
    if (missing.length === 0) return;
    let cancelled = false;
    // Settled, not all -- one file lacking read access (e.g. RLS not yet
    // granted for this caller) shouldn't block previews for the rest, and
    // shouldn't surface as an unhandled rejection either.
    Promise.allSettled(missing.map((p) => getPreviewUrl(p).then((url) => [p, url] as const))).then((results) => {
      if (cancelled) return;
      const entries = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (entries.length === 0) return;
      setPreviewUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, getPreviewUrl]);

  async function handleDownload(path: string) {
    if (!onDownload) return;
    setDownloadingPath(path);
    try {
      await onDownload(path);
    } finally {
      setDownloadingPath(null);
    }
  }

  const atLimit = paths.length >= MAX_EVIDENCE_FILES;

  return (
    <div className="flex flex-col gap-1.5">
      {paths.map((path) => {
        const preview = previewUrls[path];
        return (
          <div
            key={path}
            className="border border-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-2 bg-surface-2 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2 min-w-0">
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="w-8 h-8 rounded-[4px] object-cover shrink-0 border border-border"
                />
              ) : (
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth={2}
                  className="shrink-0"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
              <span className="truncate">{path.split("/").pop()}</span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {onDownload && (
                <button
                  type="button"
                  onClick={() => handleDownload(path)}
                  disabled={downloadingPath === path}
                  className="flex items-center gap-1.5 text-[12px] text-accent font-semibold cursor-pointer"
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 3v13" />
                    <path d="M17 11l-5 5-5-5" />
                    <path d="M5 21h14" />
                  </svg>
                  {downloadingPath === path ? "Preparing…" : "Download"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(path)}
                className="text-text-3 hover:text-danger cursor-pointer text-[14px] leading-none"
                title="Remove"
              >
                ×
              </button>
            </span>
          </div>
        );
      })}

      {!atLimit && (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          title={`Max ${MAX_EVIDENCE_FILE_SIZE_MB}MB per file`}
          className={`w-full border border-dashed rounded-[7px] px-3.5 py-2.5 text-[12.5px] flex items-center gap-2 cursor-pointer ${
            required && paths.length === 0 ? "border-danger-border text-text-3" : "border-border text-text-3"
          }`}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3v13" />
            <path d="M7 8l5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
          {uploading ? (
            "Uploading…"
          ) : paths.length === 0 ? (
            <>
              Attach evidence{" "}
              {required ? <span className="text-danger">(required)</span> : <span className="text-text-3">(optional)</span>}
            </>
          ) : (
            `Attach another (${paths.length}/${MAX_EVIDENCE_FILES})`
          )}
        </button>
      )}
      {uploadError && <div className="text-[12px] text-danger">{uploadError}</div>}
      <input ref={fileInput} type="file" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
