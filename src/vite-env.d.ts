/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_VERSION?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Модули без типов
declare module 'jspdf-autotable' {
  import { jsPDF } from 'jspdf';
  
  interface AutoTableOptions {
    head?: Array<Array<string | number>>;
    body?: Array<Array<string | number>>;
    foot?: Array<Array<string | number>>;
    startY?: number;
    margin?: { top?: number; right?: number; bottom?: number; left?: number };
    styles?: {
      font?: string;
      fontStyle?: 'normal' | 'bold' | 'italic';
      fontSize?: number;
      textColor?: number | [number, number, number];
      cellPadding?: number | { top?: number; right?: number; bottom?: number; left?: number };
      lineColor?: number | [number, number, number];
      lineWidth?: number;
      cellWidth?: 'auto' | 'wrap' | number;
      minCellHeight?: number;
      halign?: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      fillColor?: number | [number, number, number] | false;
      overflow?: 'linebreak' | 'ellipsize' | 'visible' | 'hidden';
    };
    headStyles?: Record<string, any>;
    bodyStyles?: Record<string, any>;
    footStyles?: Record<string, any>;
    alternateRowStyles?: Record<string, any>;
    columnStyles?: Record<string, any>;
    theme?: 'striped' | 'grid' | 'plain';
    didParseCell?: (data: { cell: any; section: string; row: any; column: any }) => void;
    didDrawCell?: (data: { cell: any; section: string; row: any; column: any }) => void;
    didDrawPage?: (data: { pageNumber: number; pageCount: number }) => void;
  }
  
  export default function autoTable(doc: jsPDF, options: AutoTableOptions): void;
}

// CSS-модули (если используешь .module.css)
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Статические ресурсы
declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.jpeg' {
  const content: string;
  export default content;
}

declare module '*.gif' {
  const content: string;
  export default content;
}

declare module '*.webp' {
  const content: string;
  export default content;
}
