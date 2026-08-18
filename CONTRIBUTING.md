# Contributing to Tutti

Thank you for your interest in contributing to Tutti! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@tutti.app](mailto:conduct@tutti.app).

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Git

### Finding Issues to Work On

- Look for issues labeled [`good first issue`](https://github.com/ruudsl/tutti/labels/good%20first%20issue) for beginner-friendly tasks
- Issues labeled [`help wanted`](https://github.com/ruudsl/tutti/labels/help%20wanted) are ready for community contributions
- Check the [ROADMAP.md](ROADMAP.md) for larger planned features

## Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/tutti.git
   cd tutti
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp backend/.env.example backend/.env
   # Edit .env with your local settings
   ```

4. **Start development servers**

   ```bash
   # Terminal 1: Backend
   npm run dev --workspace=backend

   # Terminal 2: Frontend
   npm run dev --workspace=frontend
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3001

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-pdf-annotations` - New features
- `fix/login-redirect-loop` - Bug fixes
- `docs/api-reference` - Documentation
- `refactor/auth-middleware` - Code refactoring
- `test/user-routes` - Adding tests

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, missing semicolons, etc.
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**

```
feat(music): add MusicXML import support

fix(auth): resolve session expiration redirect

docs(api): add endpoint documentation for /rehearsals
```

## Pull Request Process

1. **Create a feature branch** from `main`
2. **Make your changes** with clear, focused commits
3. **Write/update tests** for your changes
4. **Update documentation** if needed
5. **Run the test suite** locally:
   ```bash
   npm test --workspace=backend
   npm test --workspace=frontend
   ```
6. **Push your branch** and create a Pull Request
7. **Fill out the PR template** completely
8. **Address review feedback** promptly

### PR Requirements

- [ ] All tests pass
- [ ] Code follows project style guidelines
- [ ] Documentation updated (if applicable)
- [ ] No unrelated changes included
- [ ] Commit messages follow conventions

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions

### React (Frontend)

- Use functional components with hooks
- Keep components small and focused
- Use React Query for server state
- Follow the existing file structure

### Express (Backend)

- Use async/await for asynchronous code
- Validate input with Zod schemas
- Use the existing error handling middleware
- Follow RESTful API conventions

### Styling

- Use CSS variables from `index.css`
- Follow BEM-like naming for CSS classes
- Ensure WCAG 2.1 AA accessibility compliance
- Test with keyboard navigation

### Security

- Never commit secrets or credentials
- Validate and sanitize all user input
- Use parameterized queries (no string concatenation)
- Follow OWASP guidelines

## Testing

### Backend Tests

```bash
# Run all backend tests
npm test --workspace=backend

# Run with coverage
npm test --workspace=backend -- --coverage

# Run specific test file
npm test --workspace=backend -- src/routes/__tests__/users.test.ts
```

### Frontend Tests

```bash
# Run all frontend tests
npm test --workspace=frontend

# Run with coverage
npm test --workspace=frontend -- --coverage
```

### Writing Tests

- Place tests in `__tests__` directories or `.test.ts` files
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies

## Documentation

### Code Documentation

- Add JSDoc comments to public functions
- Document complex logic inline
- Keep README files up to date

### API Documentation

- Document new endpoints in the OpenAPI spec
- Include request/response examples
- Note authentication requirements

## Multi-tenant Considerations

Tutti is a multi-tenant application. When contributing:

- Always filter data by `association_id`
- Test tenant isolation (users shouldn't see other associations' data)
- Don't hardcode association-specific values

## Internationalization (i18n)

- All user-facing text should use i18n keys
- Add translations for: Dutch (nl), English (en), German (de)
- Translation files: `frontend/src/locales/`

## Community

### Getting Help

- [GitHub Discussions](https://github.com/ruudsl/tutti/discussions) - Questions and ideas
- [GitHub Issues](https://github.com/ruudsl/tutti/issues) - Bug reports and feature requests

### Communication

- Be respectful and inclusive
- Assume good intentions
- Help others learn

## License

By contributing to Tutti, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to Tutti! Your help makes this project better for music associations everywhere.
