import { youtubeId, youtubeEmbedUrl, youtubeThumbnail, platformLabel } from "@/lib/video";

type Video = {
  id: string;
  url: string;
  source: "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "OCI";
  kind: "REEL" | "STORY";
};

// Renders the product videos section on PDP. Per DivaHub contract, the array
// is already in priority order — index 0 is the "best" video.
export function ProductVideos({ videos, productName }: { videos: Video[]; productName: string }) {
  if (videos.length === 0) return null;
  const primary = videos[0];
  const rest = videos.slice(1);

  return (
    <section className="mt-12 space-y-4">
      <h2 className="font-display text-2xl text-[color:var(--pink-600)]">Vídeos</h2>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <PrimaryVideo video={primary} productName={productName} />
        {rest.length > 0 ? (
          <ul className="space-y-2">
            {rest.map((v) => (
              <li key={v.id}>
                <VideoThumbLink video={v} productName={productName} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function PrimaryVideo({ video, productName }: { video: Video; productName: string }) {
  if (video.source === "YOUTUBE") {
    const id = youtubeId(video.url);
    if (id) {
      return (
        <div className="relative glass-card rounded-2xl overflow-hidden aspect-video">
          <iframe
            src={youtubeEmbedUrl(id)}
            title={`${productName} — vídeo`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>
      );
    }
  }
  if (video.source === "OCI") {
    return (
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={video.url}
          controls
          preload="metadata"
          className="w-full aspect-video"
        />
      </div>
    );
  }
  // TikTok / Instagram: link out (their embeds require platform JS + auth dance).
  return <VideoThumbLink video={video} productName={productName} large />;
}

function VideoThumbLink({
  video,
  productName,
  large = false,
}: {
  video: Video;
  productName: string;
  large?: boolean;
}) {
  const label = platformLabel(video.source);
  let thumb: string | null = null;
  if (video.source === "YOUTUBE") {
    const id = youtubeId(video.url);
    if (id) thumb = youtubeThumbnail(id);
  }

  const aspect = large ? "aspect-video" : "aspect-[4/3]";

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Abrir vídeo no ${label}: ${productName}`}
      className={`group relative block glass-card rounded-2xl overflow-hidden ${aspect}`}
    >
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-pink-100 to-pink-200" />
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="rounded-full bg-white/85 text-[color:var(--pink-600)] font-medium px-4 py-2 text-sm shadow group-hover:bg-white transition-colors">
          ▶ {label}
        </span>
      </div>
    </a>
  );
}
