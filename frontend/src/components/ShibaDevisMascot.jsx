import shibaDevis from "../assets/carnetpass-shiba-devis.png";
export default function ShibaDevisMascot({ size = 96, decorative = false }) {
  return (
    <img
      className="devis-mascot"
      src={shibaDevis}
      width={size}
      height={Math.round(size * 1.2)}
      alt={decorative ? "" : "Shiba Devis, le Shiba avec lunettes et stylo"}
      style={{ objectFit: "contain", flexShrink: 0, maxWidth: "28vw" }}
    />
  );
}
