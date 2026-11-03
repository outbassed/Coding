export interface QrCodeModel {
  addData(data: string, mode?: 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
export interface QrCodeFactory {
  (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'): QrCodeModel;
  stringToBytes: (s: string) => number[];
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
}
declare const qrcode: QrCodeFactory;
export default qrcode;
