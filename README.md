# 🐍 PyMCU Landing Page

<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" align="right" alt="Python Badge">

🚀 **The future of Python on microcontrollers is here!** 🚀

**PyMCU** is a revolutionary Python-to-C compiler designed specifically for microcontrollers. This landing page showcases PyMCU's capabilities and provides early access to the Alpha release.

## ✨ Features

- ✅ **Secure & Production-Ready** - Enterprise-grade security with rate limiting, input validation, and security headers
- ✅ **Modern Tech Stack** - Built with **[Astro 5.0](https://astro.build/)** + **[Tailwind CSS](https://tailwindcss.com/)**
- ✅ **Alpha Waitlist System** - Email confirmation with **Supabase** backend and **Amazon SES**
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
- [🌐 Environment Setup](#-environment-setup)
- [🚀 Deployment](#-deployment)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🚀 About PyMCU

**PyMCU** is a groundbreaking Python-to-C compiler that brings the simplicity and power of Python to microcontroller development. Our mission is to democratize embedded programming by allowing developers to write Python code that compiles to efficient C code for microcontrollers.

### Key Benefits:
- 🐍 **Write Python, Run on MCUs** - Use familiar Python syntax for embedded development
- ⚡ **High Performance** - Compiles to optimized C code for maximum efficiency
- 🎯 **Multiple Architectures** - Support for ARM Cortex-M, ESP32, and more
- 🔧 **Rich HAL Support** - GPIO, Timers, UART, SPI, I²C, and wireless connectivity
- 📚 **Easy Learning Curve** - Perfect for beginners transitioning to embedded development

## 🛠️ Tech Stack

This landing page is built with modern web technologies:

- **Frontend**: [Astro 5.0](https://astro.build/) + [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL + RLS)
- **Email**: [Amazon SES](https://aws.amazon.com/ses/)
- **Language**: TypeScript (100% type-safe)
- **Security**: Rate limiting, input validation, security headers
- **Deployment**: Vercel/Netlify ready

## 🔧 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Supabase** account for database
- **Amazon SES** account for email sending
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

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and AWS SES credentials
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
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
│   │   │   ├── Waitlist.astro
│   │   │   └── ...
│   │   └── Logo.astro
│   ├── layouts/             # Page layouts
│   │   └── PageLayout.astro
│   ├── pages/               # Routes and API endpoints
│   │   ├── api/            # Backend API routes
│   │   │   ├── waitlist.ts # Waitlist registration
│   │   │   ├── confirm.ts  # Email confirmation
│   │   │   └── unsubscribe.ts
│   │   ├── index.astro     # Homepage
│   │   ├── confirm.astro   # Confirmation page
│   │   └── unsubscribe.astro
│   ├── types/              # TypeScript type definitions
│   │   └── api.ts          # API response types
│   ├── utils/              # Utility functions
│   │   ├── rate-limiter.ts # Rate limiting logic
│   │   └── security-headers.ts # Security headers
│   ├── config.yaml         # Site configuration
│   └── navigation.ts       # Navigation structure
├── .env.example            # Environment variables template
├── package.json
├── astro.config.ts
└── README.md
```

### Key Directories:
- **`src/pages/api/`** - Backend API endpoints for waitlist functionality
- **`src/components/widgets/`** - PyMCU-specific UI components
- **`src/utils/`** - Security and utility functions
- **`src/types/`** - TypeScript type definitions for type safety

<br>

## ⚡ Commands

All commands are run from the root of the project:

| Command             | Action                                             |
| :------------------ | :------------------------------------------------- |
| `npm install`       | Install dependencies                               |
| `npm run dev`       | Start development server at `localhost:4321`      |
| `npm run build`     | Build production site to `./dist/`                |
| `npm run preview`   | Preview build locally before deploying            |
| `npm run check`     | Run TypeScript, ESLint, and Prettier checks       |
| `npm run fix`       | Auto-fix ESLint and Prettier issues               |
| `npm run astro ...` | Run Astro CLI commands                             |

## 🔒 Security Features

This project implements enterprise-grade security measures:

### 🛡️ Rate Limiting
- **IP-based rate limiting** on all API endpoints
- **Configurable limits** per endpoint (waitlist: 5/min, confirm: 10/min, unsubscribe: 3/min)
- **In-memory storage** with automatic cleanup

### 🔐 Input Validation & Sanitization
- **Email validation** with regex patterns
- **Role and experience validation** against whitelists
- **Token sanitization** for confirmation links
- **XSS prevention** through input sanitization

### 🛡️ Security Headers
- **Content Security Policy (CSP)** - Prevents XSS attacks
- **X-Frame-Options** - Prevents clickjacking
- **X-Content-Type-Options** - Prevents MIME sniffing
- **Referrer-Policy** - Controls referrer information
- **HSTS** - Enforces HTTPS connections
- **CORS** - Controlled cross-origin requests

### 📝 Secure Logging
- **Conditional logging** - Detailed errors only in development
- **No sensitive data exposure** in production logs
- **Generic error messages** for users

## 🌐 Environment Setup

Create a `.env` file in the root directory with the following variables:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Amazon SES Configuration  
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
SES_FROM_EMAIL=noreply@yourdomain.com

# Site Configuration
SITE=https://yourdomain.com
```

### Database Setup (Supabase)

1. **Create a new Supabase project**
2. **Run the SQL schema** (see `supabase-schema.sql`)
3. **Set up Row Level Security** policies
4. **Configure email templates** for confirmations

## 🚀 Deployment

### Manual Deployment

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy the `dist/` folder** to your hosting provider

### Vercel Deployment (Recommended)

1. **Connect your GitHub repository** to Vercel
2. **Set environment variables** in Vercel dashboard
3. **Deploy automatically** on every push to main branch

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Netlify Deployment

1. **Connect your GitHub repository** to Netlify
2. **Configure build settings**:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. **Set environment variables** in Netlify dashboard

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

### Environment Variables for Production

Make sure to set these environment variables in your hosting platform:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `SES_FROM_EMAIL`
- `SITE`

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
- **Supabase** - For the backend-as-a-service platform
- **Tailwind CSS** - For the utility-first CSS framework

---

<div align="center">

**Built with ❤️ for the PyMCU community**

[🐍 Join the Alpha Waitlist](https://pymcu.com) • [📧 Contact Us](mailto:hello@pymcu.com) • [🐦 Follow Updates](https://twitter.com/pymcu)

</div>
