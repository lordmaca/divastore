// Video URL helpers. Pure functions; no runtime deps.

// Extract the YouTube video ID from any of:
//   - https://www.youtube.com/watch?v=ID
//   - https://youtu.be/ID
//   - https://www.youtube.com/embed/ID
//   - https://www.youtube.com/shorts/ID
// Returns null for unparseable input.
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (u.hostname.endsWith("youtube.com") || u.hostname.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{6,}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|v)\/([\w-]{6,})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(id: string): string {
  // youtube-nocookie.com doesn't set tracking cookies until the user clicks
  // play — friendlier for LGPD and for Core Web Vitals (no third-party cookie
  // negotiation on initial render).
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function platformLabel(source: string): string {
  switch (source) {
    case "YOUTUBE":
      return "YouTube";
    case "TIKTOK":
      return "TikTok";
    case "INSTAGRAM":
      return "Instagram";
    case "OCI":
      return "Vídeo";
    default:
      return source;
  }
}
