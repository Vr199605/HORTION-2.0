import type { ReactNode } from 'react'

/** Moldura de celular para a prévia ao vivo. O conteúdo rola dentro dela. */
export default function PhoneFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="phone" role="group" aria-label={label ?? 'Prévia da loja no celular'}>
      <div className="phone-notch" aria-hidden />
      <div className="phone-screen">{children}</div>
    </div>
  )
}
