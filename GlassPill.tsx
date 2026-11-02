import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import './GlassPill.css'

type GlassPillProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export default function GlassPill({ label, size = 'md', className = '', style, disabled, ...props }: GlassPillProps) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 100)
    return () => window.clearTimeout(timer)
  }, [])
  const pillStyle = { ...style, '--pill-size': size === 'sm' ? '.69rem' : size === 'lg' ? '1rem' : '.82rem' } as CSSProperties
  return (
    <span className={`glass-pill-entry ${visible ? 'is-visible' : ''}`} style={pillStyle}>
      <span className={`glass-pill-wrap ${disabled ? 'is-disabled' : ''}`}>
        <button className={`glass-pill ${className}`} disabled={disabled} {...props}>
          <span className="glass-pill-label">{label}</span>
        </button>
        <span className="glass-pill-shadow" aria-hidden="true" />
      </span>
    </span>
  )
}
