interface VaultGateMarkProps {
  size?: number;
  className?: string;
}

export function VaultGateMark({ size = 22, className = "" }: VaultGateMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Left hardware enclave bracket */}
      <path d="M2 2H10.5V5.5H5.5V18.5H10.5V22H2V2Z" fill="currentColor" />
      {/* Right hardware enclave bracket */}
      <path d="M22 2H13.5V5.5H18.5V18.5H13.5V22H22V2Z" fill="currentColor" />
      {/* Sealed core inside enclave */}
      <rect x="8.5" y="8.5" width="7" height="7" fill="#E04F26" />
    </svg>
  );
}
