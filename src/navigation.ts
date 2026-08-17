import { getPermalink } from './utils/permalinks';

// The two destinations a first-time visitor actually needs. Kept here so the
// landing widgets link to exactly the same URLs as the navigation.
export const PLAYGROUND_URL = 'https://playground.pymcu.org';
export const DOCS_URL = 'https://docs.pymcu.org';
export const GITHUB_URL = 'https://github.com/PyMCU/PyMCU';

export const headerData = {
  links: [
    {
      text: 'Playground',
      href: PLAYGROUND_URL,
    },
    {
      text: 'Docs',
      href: DOCS_URL,
    },
    {
      text: 'Features',
      href: '/#features',
    },
    {
      text: 'How it Works',
      href: '/#steps',
    },
    {
      text: 'FAQ',
      href: '/#faqs',
    },
    {
      text: 'Blog',
      href: getPermalink('/blog'),
    },
    {
      text: 'Heritage',
      href: getPermalink('/heritage'),
    },
  ],
  actions: [
    {
      variant: 'tertiary' as const,
      text: 'Sponsor',
      href: 'https://github.com/sponsors/begeistert',
      target: '_blank',
      icon: 'tabler:heart',
    },
    {
      variant: 'primary' as const,
      text: 'Get Started',
      href: `${DOCS_URL}/getting-started/quickstart/`,
      target: '_blank',
    },
  ],
};

export const footerData = {
  secondaryLinks: [
    { text: 'Playground', href: PLAYGROUND_URL },
    { text: 'Docs', href: DOCS_URL },
    { text: 'Blog', href: getPermalink('/blog') },
    { text: 'About', href: getPermalink('/about') },
    { text: 'Heritage', href: getPermalink('/heritage') },
    { text: 'Contact', href: getPermalink('/contact') },
    { text: 'Terms', href: getPermalink('/terms') },
    { text: 'Privacy Policy', href: getPermalink('/privacy') },
  ],
  socialLinks: [
    { ariaLabel: 'Github', icon: 'tabler:brand-github', href: 'https://github.com/PyMCU' },
    { ariaLabel: 'Ko-FI', icon: 'tabler:coffee', href: 'https://ko-fi.com/pymcu' },
  ],
  footNote: ``,
};
