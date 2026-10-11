export default function Icon({ name, className = "" }) {
  return (
    <i
      aria-hidden="true"
      className={["hgi", "hgi-stroke", "hgi-" + name, className].filter(Boolean).join(" ")}
    />
  );
}
