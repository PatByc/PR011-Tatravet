import { PawPrint } from "lucide-react";
export default function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <PawPrint size={25} strokeWidth={2} />
      </span>
      <span>
        Tatravet<small>Przychodnia weterynaryjna</small>
      </span>
    </div>
  );
}
