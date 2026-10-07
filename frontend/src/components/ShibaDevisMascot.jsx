import shibaDevis from "../assets/simba-accompagnement-administratif.webp";
export default function ShibaDevisMascot({ size = 96, decorative = false }) {
  return (
    <img
      className="devis-mascot"
      src={shibaDevis}
      width={size}
      height={Math.round(size * 1.5)}
      alt={decorative ? "" : "Simba avec un stylo et un carnet, assistant Shiba Devis"}
      style={{ objectFit: "contain", flexShrink: 0, maxWidth: "24vw", height: "auto", display: "block" }}
    />
  );
}
