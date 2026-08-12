# 🐍 PyMCU Landing Page

<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" align="right" alt="Python Badge">

🚀 **The future of Python on microcontrollers is here!** 🚀

**PyMCU** is an AOT compiler that turns a statically-typed subset of Python into bare-metal machine code for microcontrollers. This landing page showcases PyMCU's capabilities — the public alpha is out now on [PyPI](https://pypi.org/project/pymcu-compiler/), with documentation at [docs.pymcu.org](https://docs.pymcu.org).

## ✨ Features

- ✅ **Secure by default** - Security headers (CSP, HSTS, X-Frame-Options) on every response
- ✅ **Modern Tech Stack** - Built with **[Astro 5.0](https://astro.build/)** + **[Tailwind CSS](https://tailwindcss.com/)**
- ✅ **Responsive Design** - Mobile-first approach with dark mode support
- ✅ **Performance Optimized** - Lightning-fast loading with perfect Lighthouse scores
- ✅ **SEO Optimized** - Meta tags, Open Graph, and structured data
- ✅ **TypeScript** - Fully typed codebase with zero errors

<br>

## 📋 Table of Contents

- [🚀 About PyMCU](#-about-pymcu)
- [🛠️ Tech Stack](#️-tech-stack)
- [🔧 Getting Started](#-getting-started)
- [📁 Project Structure](#-project-structure)
- [⚡ Commands](#-commands)
- [🔒 Security Features](#-security-features)
- [🚀 Deployment](#-deployment)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🚀 About PyMCU

**PyMCU** is an Ahead-Of-Time compiler that brings the simplicity of Python to microcontroller development. It compiles a statically-typed subset of Python directly into bare-metal machine code — no interpreter, no heap, no garbage collection.

### Key Benefits:

- 🐍 **Write Python, Run on MCUs** - Use familiar Python syntax for embedded development
- ⚡ **Zero Runtime Overhead** - Compiles to bare-metal machine code, deterministic by design
- 🎯 **AVR Today, More Soon** - Focused on ATmega328P (Arduino Uno); ARM Cortex-M, ESP32 and more planned
- 🔧 **Ready-to-use HALs** - GPIO, timers, and peripherals easy to use from day one
- 📚 **Easy Learning Curve** - Perfect for beginners transitioning to embedded development

## 🛠️ Tech Stack

This landing page is built with modern web technologies:

- **Frontend**: [Astro 5.0](https://astro.build/) + [Tailwind CSS](https://tailwindcss.com/)
- **Language**: TypeScript (100% type-safe)
- **Security**: Security headers on every response
- **Deployment**: Cloudflare Workers via [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

## 🔧 Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **Git** for version control

### Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd pymcu-landing
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run the development server**

   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:4321`

## 📁 Project Structure

The PyMCU landing page follows a clean, organized structure:

```
pymcu-landing/
├── public/                    # Static assets
│   ├── _headers              # Netlify headers config
│   └── robots.txt            # SEO robots file
├── src/
│   ├── assets/               # Images, styles, favicons
│   ├── components/           # Reusable UI components
│   │   ├── ui/              # Basic UI elements
│   │   ├── widgets/         # Complex components
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   └── ...
│   │   └── Logo.astro
│   ├── layouts/             # Page layouts
│   │   └── PageLayout.astro
│   ├── pages/               # Routes
│   │   ├── index.astro     # Homepage
│   │   └── ...
│   ├── utils/              # Utility functions
│   │   └── security-headers.ts # Security headers
│   ├── config.yaml         # Site configuration
│   └── navigation.ts       # Navigation structure
├── package.json
├── astro.config.ts
├── wrangler.jsonc          # Cloudflare Workers config
└── README.md
```

### Key Directories:

- **`src/components/widgets/`** - PyMCU-specific UI components
- **`src/utils/`** - Security and utility functions
- **`src/content/`** - Blog posts and site content

<br>

## ⚡ Commands

All commands are run from the root of the project:

| Command             | Action                                       |
| :------------------ | :------------------------------------------- |
| `npm install`       | Install dependencies                         |
| `npm run dev`       | Start development server at `localhost:4321` |
| `npm run build`     | Build production site to `./dist/`           |
| `npm run preview`   | Preview build locally before deploying       |
| `npm run check`     | Run TypeScript, ESLint, and Prettier checks  |
| `npm run fix`       | Auto-fix ESLint and Prettier issues          |
| `npm run astro ...` | Run Astro CLI commands                       |

## 🔒 Security Features

### 🛡️ Security Headers

- **Content Security Policy (CSP)** - Prevents XSS attacks
- **X-Frame-Options** - Prevents clickjacking
- **X-Content-Type-Options** - Prevents MIME sniffing
- **Referrer-Policy** - Controls referrer information
- **HSTS** - Enforces HTTPS connections
- **CORS** - Controlled cross-origin requests

## 🚀 Deployment

The site deploys to **Cloudflare Workers** with a single command:

```bash
npm run deploy
```

This builds the site and publishes it via [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (see `wrangler.jsonc`). You need to be authenticated with `wrangler login` first.

## 🤝 Contributing

We welcome contributions to the PyMCU landing page! Here's how you can help:

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Run tests and checks**
   ```bash
   npm run check
   npm run fix
   ```
5. **Commit your changes**
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Create a Pull Request**

### Code Standards

- ✅ **TypeScript** - All code must be properly typed
- ✅ **ESLint** - Follow the configured linting rules
- ✅ **Prettier** - Code must be properly formatted
- ✅ **Security** - Follow security best practices
- ✅ **Testing** - Add tests for new features

### Areas for Contribution

- 🐛 **Bug fixes** and performance improvements
- 🎨 **UI/UX enhancements** and responsive design
- 🔒 **Security improvements** and vulnerability fixes
- 📚 **Documentation** updates and improvements
- 🌐 **Internationalization** support
- ♿ **Accessibility** improvements

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE.md](./LICENSE.md) file for details.

## 🙏 Acknowledgments

- **PyMCU Team** - For the vision of Python on microcontrollers
- **Astro Team** - For the amazing web framework
- **Tailwind CSS** - For the utility-first CSS framework

---

<div align="center">

**Built with ❤️ for the PyMCU community**

[🐍 Get the Alpha on PyPI](https://pypi.org/project/pymcu-compiler/) • [📚 Docs](https://docs.pymcu.org) • [💻 GitHub](https://github.com/PyMCU/PyMCU)

</div>
