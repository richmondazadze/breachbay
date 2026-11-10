import "./brand-artwork.css";

const artwork = {
  "command-hero": [910, 579],
  "evidence-intake": [737, 878],
  "human-review": [844, 714],
  investigation: [642, 670],
} as const;

/** Decorative objects accompany real HTML content; they never represent live state. */
export function BrandArtwork({ name, className = "", sizes = "(max-width: 600px) 75vw, 380px", priority = false }: {
  name: keyof typeof artwork;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [width, height] = artwork[name];
  return <img
    className={`bb-artwork ${className}`}
    src={`/artwork/${name}.webp`}
    srcSet={`/artwork/${name}-480.webp 480w, /artwork/${name}.webp ${width}w`}
    sizes={sizes}
    width={width}
    height={height}
    alt=""
    draggable={false}
    loading={priority ? "eager" : "lazy"}
    fetchPriority={priority ? "high" : "auto"}
    decoding="async"
  />;
}
