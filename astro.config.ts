import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

import yaml from 'js-yaml';

import { defineConfig, passthroughImageService } from 'astro/config';

import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import partytown from '@astrojs/partytown';
import icon from 'astro-icon';
import compress from 'astro-compress';
import cloudflare from '@astrojs/cloudflare';
import type { AstroIntegration } from 'astro';

import astrowind from './vendor/integration';

import { readingTimeRemarkPlugin, responsiveTablesRehypePlugin, lazyImagesRehypePlugin } from './src/utils/frontmatter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Un sitemap solo debe listar URLs indexables. Las secciones del blog cuyo
// robots.index es false en config.yaml se excluyen aqui, para que el sitemap no
// contradiga a la etiqueta meta de la propia pagina. Se deriva de la misma
// configuracion que decide el noindex, asi las dos no pueden desincronizarse.
type BlogSection = { pathname?: string; robots?: { index?: boolean } };

const themeConfig = yaml.load(fs.readFileSync(path.resolve(__dirname, './src/config.yaml'), 'utf8')) as {
  apps?: { blog?: Record<string, BlogSection | unknown> };
};

const noindexBasePaths = Object.values(themeConfig?.apps?.blog ?? {})
  .filter((section): section is Required<BlogSection> => {
    const candidate = section as BlogSection;
    return typeof candidate === 'object' && candidate !== null && candidate.robots?.index === false && !!candidate.pathname;
  })
  .map((section) => `/${section.pathname.replace(/^\/|\/$/g, '')}/`);

const isIndexablePage = (page: string) => {
  const { pathname } = new URL(page);
  return !noindexBasePaths.some((base) => pathname.startsWith(base));
};

const hasExternalScripts = false;
const whenExternalScripts = (items: (() => AstroIntegration) | (() => AstroIntegration)[] = []) =>
  hasExternalScripts ? (Array.isArray(items) ? items.map((item) => item()) : [items()]) : [];

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  image: {
    service: passthroughImageService(),
  },

  redirects: {
    '/sucess': '/success',
  },

  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap({
      filter: isIndexablePage,
    }),
    mdx(),
    icon({
      include: {
        tabler: ['*'],
        'flat-color-icons': [
          'template',
          'gallery',
          'approval',
          'document',
          'advertising',
          'currency-exchange',
          'voice-presentation',
          'business-contact',
          'database',
        ],
      },
    }),

    ...whenExternalScripts(() =>
      partytown({
        config: { forward: ['dataLayer.push'] },
      })
    ),

    compress({
      CSS: true,
      HTML: {
        'html-minifier-terser': {
          removeAttributeQuotes: false,
        },
      },
      Image: false,
      JavaScript: true,
      SVG: false,
      Logger: 1,
    }),

    astrowind({
      config: './src/config.yaml',
    }),
  ],

  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin],
    rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin],
  },

  vite: {
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
