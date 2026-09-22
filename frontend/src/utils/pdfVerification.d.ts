export interface PdfVerificationResults {
  onChainVerified?: boolean;
  verificacion?: {
    estado?: 'coincide' | 'parcial' | 'discrepancia' | 'sin-respuesta';
    votosNoVerificables?: number;
  };
}

export function getPdfVerificationText(results?: PdfVerificationResults): string;
