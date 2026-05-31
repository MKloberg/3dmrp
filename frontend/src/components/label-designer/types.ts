export interface LabelField {
  key: string
  label: string
  type?: 'text' | 'qr' | 'swatch'
}

export interface TextElement {
  id: string
  type: 'text'
  fieldKey: string
  xMm: number
  yMm: number
  fontSizePt: number
  fontWeight: 'normal' | 'bold'
  color: string
}

export interface QrElement {
  id: string
  type: 'qr'
  fieldKey: string
  xMm: number
  yMm: number
  sizeMm: number
}

export interface SwatchElement {
  id: string
  type: 'swatch'
  fieldKey: string
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

export type LabelElement = TextElement | QrElement | SwatchElement

export interface LabelTemplate {
  version: '1'
  widthMm: number
  heightMm: number
  elements: LabelElement[]
}

export interface LabelDesignerProps {
  widthMm: number
  heightMm: number
  fields: LabelField[]
  initialTemplate?: string
  onSave?: (templateJson: string) => void
}

export interface LabelPrintProps {
  template: LabelTemplate
  data: Record<string, string>[]
}
