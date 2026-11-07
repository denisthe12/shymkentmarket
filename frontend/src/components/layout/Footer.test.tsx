import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../../test/render'
import { CONTACT_EMAIL, Footer } from './Footer'

describe('Footer', () => {
  it('shows the contact email as a mailto link', () => {
    renderPage(<Footer />, '/kk/catalog')
    const email = screen.getByTestId('footer-email')
    expect(email).toHaveTextContent('info@aktau.market')
    expect(email).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`)
  })

  it('links to the blog of the current language', () => {
    renderPage(<Footer />, '/kk/catalog')
    expect(screen.getByTestId('footer-blog')).toHaveAttribute('href', '/kk/blog')
  })
})
